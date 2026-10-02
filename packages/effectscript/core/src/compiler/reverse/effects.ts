/**
 * `Effect.fn` / `Effect.fnUntraced` / `Effect.gen` forms → `effect` declarations, arrows, methods and
 * blocks, plus the walker that finds them anywhere in a module.
 *
 * @since 4.0.0
 */
import { children, type Node } from "../ast.ts"
import { convertAtom } from "./atom.ts"
import { blocker, genShape, isGenerator } from "./blockers.ts"
import { convertGeneratorNode, unqualify, type Visit } from "./body.ts"
import { convertSchemaRun } from "./classes.ts"
import { convertConfig } from "./config.ts"
import {
  commaToPipe,
  commentsIn,
  note,
  removeKeepingComments,
  replaceHoistingComments,
  replaceKeepingComments,
  type ReverseCtx,
  separatorComma,
  slice,
  within
} from "./context.ts"
import { convertImpl } from "./httpApi.ts"
import { convertLayer } from "./layer.ts"
import { convertMain } from "./main.ts"
import { convertMatch, matchShape } from "./match.ts"
import { isMember } from "./origin.ts"
import { convertPipe, inPosition, isPlainStep } from "./pipes.ts"
import { hasFinalizer, inFrame } from "./resources.ts"
import { convertTestStatement } from "./test.ts"

/**
 * `: Effect.fn.Return<A, E, R>` → `: A throws E needs R`. An explicit `never` error stays (`throws
 * never`) unless requirements follow, where the forward compiler restores it.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertReturnType = (
  ctx: ReverseCtx,
  annotation: Node | null | undefined,
  member: "fn.Return" | "Effect" = "fn.Return"
): boolean => {
  const type: Node | undefined = annotation?.typeAnnotation
  if (type === undefined || returnTypeProblem(ctx, annotation, member) !== undefined) return false
  const [success, error, requirements]: Array<Node> = (type.typeArguments ?? type.typeParameters).params
  const omitError = error === undefined || (requirements !== undefined && error.type === "TSNeverKeyword")
  const throws = omitError ? "" : ` throws ${slice(ctx, error)}`
  const needs = requirements === undefined ? "" : ` needs ${slice(ctx, requirements)}`
  ctx.s.update(type.start, type.end, `${slice(ctx, success!)}${throws}${needs}`)
  return true
}

/** Success types that would swallow a following `throws` (`() => A throws E`). */
const openTypes = new Set(["TSFunctionType", "TSConstructorType", "TSConditionalType"])

/**
 * Why a return type can't be written as `A throws E needs R`, or `undefined` (also when there is
 * none). The forward compiler wraps any annotation, so an unconvertible one blocks the form.
 *
 * @since 4.0.0
 * @category reverse
 */
export const returnTypeProblem = (
  ctx: ReverseCtx,
  annotation: Node | null | undefined,
  member: "fn.Return" | "Effect" = "fn.Return"
): string | undefined => {
  if (annotation === null || annotation === undefined) return undefined
  const type: Node | undefined = annotation.typeAnnotation
  const name: Node | undefined = type?.type === "TSTypeReference" ? type.typeName : undefined
  const matches = member === "fn.Return"
    ? name?.type === "TSQualifiedName" && name.right.name === "Return" &&
      name.left.type === "TSQualifiedName" && name.left.right.name === "fn" &&
      name.left.left.type === "Identifier" && name.left.left.name === ctx.effect
    : name?.type === "TSQualifiedName" && name.right.name === "Effect" && name.left.type === "Identifier" &&
      name.left.name === ctx.effect
  const params: Array<Node> = (type?.typeArguments ?? type?.typeParameters)?.params ?? []
  if (!matches || params.length === 0 || params.length > 3) return `its return type isn't \`Effect.${member}<…>\``
  if (openTypes.has(params[0]!.type)) return "a function type in its return type would absorb `throws`"
  if (commentsIn(ctx, type!.start, type!.end).length > 0) return "its return type has comments"
  return undefined
}

/** The `(` that opens a generator function expression's parameters. */
const paramsOpen = (ctx: ReverseCtx, fn: Node): number => ctx.source.indexOf("(", ctx.source.indexOf("*", fn.start))

const blocked = (ctx: ReverseCtx, node: Node, what: string, fn: Node, kind: Parameters<typeof blocker>[1]) => {
  // arrows and methods rewrite the header up to the parameters (and `paramsOpen` would find a `(`
  // in a comment); declarations keep the text after `function*`
  const header = kind !== "declaration" &&
    commentsIn(ctx, fn.start, fn.params[0]?.start ?? fn.body.start).length > 0
  const reason = blocker(fn, kind, ctx) ?? returnTypeProblem(ctx, fn.returnType) ??
    (header ? "a comment inside `function*` has no place" : undefined)
  if (reason !== undefined) note(ctx, node, `${what} stays TypeScript: ${reason}`)
  return reason !== undefined
}

/** `const f = Effect.fn(…)` statements converted to `effect` declarations. */
const declarations = new WeakSet<Node>()

/**
 * `const f = Effect.fn("f")(function*(…) {…}, …pipes)` → `effect f(…) {…} |> …pipes`.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertDeclaration = (ctx: ReverseCtx, statement: Node, outerStart: number, visit: Visit): boolean => {
  if (statement.kind !== "const" || statement.declarations.length !== 1) return false
  const declarator: Node = statement.declarations[0]
  const call: Node | null = declarator.init
  if (declarator.id.type !== "Identifier" || call?.type !== "CallExpression") return false
  const head: Node = call.callee
  if (head.type !== "CallExpression" || !isMember(head.callee, ctx.effect, "fn")) return false
  const [fn, ...allPipes]: Array<Node> = call.arguments
  if (!isGenerator(fn) || declarator.id.typeAnnotation) return false
  const name: string = declarator.id.name
  // the forward compiler adds `Effect.scoped` as the first pipe of a frame with `defer`
  const scope = isScope(ctx, allPipes[0]) && hasFinalizer(ctx, fn.body) ? allPipes[0] : undefined
  const pipes = scope === undefined ? allPipes : allPipes.slice(1)
  const span: Node | undefined = head.arguments[0]
  // inside a service layer the forward compiler names it `Svc.name`
  const expected = ctx.service === undefined ? name : `${ctx.service}.${name}`
  if (span?.type !== "Literal" || span.value !== expected) {
    note(
      ctx,
      statement,
      `\`${name}\` stays TypeScript: its span name ${
        span?.type === "Literal" ? JSON.stringify(span.value) : "is not a string literal"
      } differs from the binding`
    )
    return false
  }
  if (head.arguments.length !== 1) {
    note(ctx, statement, `\`${name}\` stays TypeScript: it passes span options`)
    return false
  }
  if (!pipes.every((pipe) => isPlainStep(pipe))) {
    note(ctx, statement, `\`${name}\` stays TypeScript: a pipe step wouldn't read the same after \`|>\``)
    return false
  }
  if (blocked(ctx, statement, `\`${name}\``, fn, "declaration")) return false
  // the text between `function*` and `(` stays: the forward compiler keeps it after the name
  replaceHoistingComments(ctx, statement.start, ctx.source.indexOf("*", fn.start) + 1, `effect ${name}`, outerStart)
  declarations.add(statement)
  convertReturnType(ctx, fn.returnType)
  let previous = fn
  if (scope !== undefined) {
    removeKeepingComments(ctx, fn.end, scope.end)
    previous = scope
  }
  for (const pipe of pipes) {
    commaToPipe(ctx, separatorComma(ctx, previous.end, pipe.start), pipe)
    visit(pipe, call, false)
    previous = pipe
  }
  removeKeepingComments(ctx, previous.end, call.end)
  for (const param of fn.params) visit(param, fn, false)
  within(ctx, "Effect", () => inFrame(ctx, scope !== undefined, () => visit(fn.body, fn, true)))
  return true
}

const isScope = (ctx: ReverseCtx, node: Node | undefined): node is Node => isMember(node, ctx.effect, "scoped")

/** `fn` alone, or `fn, Effect.scoped` when the frame has a finalizer that becomes `defer`. */
const scopedArguments = (ctx: ReverseCtx, args: ReadonlyArray<Node>): { fn: Node; scoped: boolean } | undefined => {
  const fn = args[0]
  if (!isGenerator(fn)) return undefined
  if (args.length === 1) return { fn: fn!, scoped: false }
  return args.length === 2 && isScope(ctx, args[1]) && hasFinalizer(ctx, fn!.body)
    ? { fn: fn!, scoped: true }
    : undefined
}

/** `Effect.gen(function*() {…})` / `Effect.gen({ self: this }, function*() {…})` → `effect {…}`. */
const convertGen = (ctx: ReverseCtx, call: Node, parent: Node | undefined, visit: Visit): boolean => {
  const shape = genShape(ctx, call, parent)
  if (shape === undefined) return false
  if ("reason" in shape) {
    note(ctx, call, `\`Effect.gen\` stays TypeScript: ${shape.reason}`)
    return false
  }
  replaceKeepingComments(ctx, call.start, shape.fn.body.start, "effect ")
  removeKeepingComments(ctx, shape.fn.body.end, call.end)
  within(ctx, "Effect", () => inFrame(ctx, false, () => visit(shape.fn.body, shape.fn, true)))
  return true
}

/** `Effect.scoped(Effect.gen(…))` with a finalizer → `effect { … defer … }`. */
const convertScopedGen = (ctx: ReverseCtx, call: Node, parent: Node | undefined): boolean => {
  if (!isScope(ctx, call.callee) || call.arguments.length !== 1) return false
  const inner: Node = call.arguments[0]
  if (inner.type !== "CallExpression") return false
  const shape = genShape(ctx, inner, parent)
  if (shape === undefined || !("fn" in shape) || !hasFinalizer(ctx, shape.fn.body)) return false
  replaceKeepingComments(ctx, call.start, shape.fn.body.start, "effect ")
  removeKeepingComments(ctx, shape.fn.body.end, call.end)
  return true
}

/** `Effect.fnUntraced(function*(…) {…})` → `effect (…) => {…}`, or `=> e` for `{ return e }`. */
const convertUntraced = (ctx: ReverseCtx, call: Node, visit: Visit): boolean => {
  if (!isMember(call.callee, ctx.effect, "fnUntraced")) return false
  const args = scopedArguments(ctx, call.arguments)
  if (args === undefined) return false
  const fn = args.fn
  if (blocked(ctx, call, "`Effect.fnUntraced`", fn, "arrow")) return false
  replaceKeepingComments(ctx, call.start, paramsOpen(ctx, fn), "effect ")
  convertReturnType(ctx, fn.returnType)
  within(ctx, "Effect", () => untracedBody(ctx, call, fn, args.scoped, visit))
  return true
}

const untracedBody = (ctx: ReverseCtx, call: Node, fn: Node, scoped: boolean, visit: Visit): void => {
  for (const param of fn.params) visit(param, fn, false)
  const body: Node = fn.body
  const only: Node | undefined = body.body.length === 1 ? body.body[0] : undefined
  const value: Node | undefined = only?.type === "ReturnStatement" ? only.argument ?? undefined : undefined
  const expression = value !== undefined && value.type !== "ObjectExpression" &&
    value.type !== "SequenceExpression" && ctx.source.slice(body.start, value.start) === "{ return " &&
    ctx.source.slice(value.end, body.end) === " }"
  if (expression) {
    ctx.s.update(body.start, value!.start, "=> ")
    ctx.s.remove(value!.end, body.end)
    inFrame(ctx, scoped, () => visit(value!, only, true))
  } else {
    ctx.s.appendLeft(body.start, "=> ")
    inFrame(ctx, scoped, () => visit(body, fn, true))
  }
  removeKeepingComments(ctx, body.end, call.end)
}

const propertyName = (key: Node): string | undefined =>
  key.type === "Identifier" ? key.name : key.type === "Literal" ? String(key.value) : undefined

/** `k: Effect.fn("k")(function*(…) {…})` → `effect k(…) {…}`; computed keys use `fnUntraced`. */
const convertProperty = (ctx: ReverseCtx, property: Node, visit: Visit): boolean => {
  if (property.kind !== "init" || property.method === true || property.shorthand === true) return false
  const call: Node = property.value
  if (call?.type !== "CallExpression") return false
  const args = scopedArguments(ctx, call.arguments)
  if (args === undefined) return false
  const fn = args.fn
  let keyEnd: number
  if (property.computed) {
    if (!isMember(call.callee, ctx.effect, "fnUntraced")) return false
    keyEnd = ctx.source.indexOf("]", property.key.end) + 1
  } else {
    const head: Node = call.callee
    if (head.type !== "CallExpression" || !isMember(head.callee, ctx.effect, "fn")) return false
    const name = propertyName(property.key)
    const span: Node | undefined = head.arguments[0]
    const expected = ctx.service === undefined ? name : `${ctx.service}.${name}`
    if (head.arguments.length !== 1 || span?.type !== "Literal" || span.value !== expected) return false
    keyEnd = property.key.end
  }
  if (blocked(ctx, property, "this method", fn, "method")) return false
  ctx.s.appendLeft(property.start, "effect ")
  replaceKeepingComments(ctx, keyEnd, paramsOpen(ctx, fn), "")
  if (property.computed) visit(property.key, property, false)
  convertReturnType(ctx, fn.returnType)
  within(ctx, "Effect", () => {
    for (const param of fn.params) visit(param, fn, false)
    inFrame(ctx, args.scoped, () => visit(fn.body, fn, true))
  })
  removeKeepingComments(ctx, fn.end, call.end)
  return true
}

const scopes = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassDeclaration",
  "ClassExpression"
])

/**
 * The walker: converts every recognized form, and generator-level nodes inside converted bodies.
 *
 * @since 4.0.0
 * @category reverse
 */
export const makeVisit = (ctx: ReverseCtx, convertClass: (cls: Node, visit: Visit) => boolean): Visit => {
  const visit: Visit = (node, parent, generator) => {
    if (
      node.type === "VariableDeclaration" &&
      (parent?.type === "Program" || parent?.type === "BlockStatement" || parent?.type === "ExportNamedDeclaration") &&
      convertDeclaration(ctx, node, parent.type === "ExportNamedDeclaration" ? parent.start : node.start, visit)
    ) {
      return
    }
    if (
      node.type === "VariableDeclaration" &&
      (parent?.type === "Program" || parent?.type === "ExportNamedDeclaration") &&
      (convertConfig(ctx, node, visit) || convertLayer(ctx, node, visit) || convertAtom(ctx, node, visit))
    ) {
      return
    }
    if (node.type === "ExpressionStatement" && !generator && convertTestStatement(ctx, node, visit)) return
    if (node.type === "ClassDeclaration" && convertClass(node, visit)) return
    if (node.type === "Property" && convertProperty(ctx, node, visit)) return
    if (node.type === "CallExpression" && inPosition(node, parent)) {
      const shape = matchShape(ctx, node, false)
      if (shape !== undefined && convertMatch(ctx, shape, [node.start, node.end], visit, generator)) return
    }
    if (node.type === "CallExpression" && convertScopedGen(ctx, node, parent)) {
      const shape = genShape(ctx, node.arguments[0], parent) as { readonly fn: Node }
      within(ctx, "Effect", () => inFrame(ctx, true, () => visit(shape.fn.body, shape.fn, true)))
      return
    }
    if (
      node.type === "CallExpression" &&
      (convertPipe(ctx, node, parent, visit, generator) || convertImpl(ctx, node, visit) ||
        convertGen(ctx, node, parent, visit) ||
        convertUntraced(ctx, node, visit))
    ) {
      return
    }
    if (generator && scopes.has(node.type)) {
      for (const child of children(node)) visit(child, node, false)
      return
    }
    if (generator && convertGeneratorNode(ctx, node, parent, visit)) return
    unqualify(ctx, node)
    for (const child of children(node)) visit(child, node, generator)
  }
  return visit
}

/**
 * Visits a module, pairing `const f = Effect.fn("f")(…)` + `export default f` into
 * `export default effect f(…)`.
 *
 * @since 4.0.0
 * @category reverse
 */
export const visitProgram = (ctx: ReverseCtx, program: Node, visit: Visit): void => {
  const body: Array<Node> = program.body
  let skip = 0
  body.forEach((statement, i) => {
    if (skip > 0) {
      skip--
      return
    }
    if (ctx.only !== undefined && !ctx.only.has(i)) return
    if (i === body.length - 1 && convertMain(ctx, program, visit)) return
    const consumed = convertSchemaRun(ctx, body, i)
    if (consumed > 0) {
      skip = consumed - 1
      return
    }
    visit(statement, program, false)
    const next = body[i + 1]
    if (!declarations.has(statement) || next?.type !== "ExportDefaultDeclaration") return
    const declarator: Node = statement.declarations[0]
    const name: string = declarator.id.name
    // the forward compiler appends exactly `\nexport default <name>` after the declaration
    if (
      statement.end !== declarator.init.end || ctx.source.slice(statement.end, next.end) !== `\nexport default ${name}`
    ) {
      return
    }
    ctx.s.appendLeft(statement.start, "export default ")
    ctx.s.remove(statement.end, next.end)
  })
}
