/**
 * `Effect.fn` / `Effect.fnUntraced` / `Effect.gen` forms → `effect` declarations, arrows, methods and
 * blocks, plus the walker that finds them anywhere in a module.
 *
 * @since 4.0.0
 */
import { children, type Node } from "../ast.ts"
import { blocker, genShape, isGenerator } from "./blockers.ts"
import { convertGeneratorNode, unqualify, type Visit } from "./body.ts"
import {
  commaToPipe,
  note,
  removeKeepingComments,
  replaceHoistingComments,
  replaceKeepingComments,
  type ReverseCtx,
  separatorComma,
  slice
} from "./context.ts"
import { isMember } from "./origin.ts"
import { convertPipe, isPlainStep } from "./pipes.ts"

/**
 * `: Effect.fn.Return<A, E, R>` → `: A throws E needs R`. An explicit `never` error stays (`throws
 * never`) unless requirements follow, where the forward compiler restores it.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertReturnType = (ctx: ReverseCtx, annotation: Node | null | undefined): void => {
  const type: Node | undefined = annotation?.typeAnnotation
  if (type?.type !== "TSTypeReference") return
  const name: Node = type.typeName
  const isReturn = name.type === "TSQualifiedName" && name.right.name === "Return" &&
    name.left.type === "TSQualifiedName" && name.left.right.name === "fn" &&
    name.left.left.type === "Identifier" && name.left.left.name === ctx.effect
  if (!isReturn) return
  const [success, error, requirements]: Array<Node> = (type.typeArguments ?? type.typeParameters)?.params ?? []
  if (success === undefined) return
  const omitError = error === undefined || (requirements !== undefined && error.type === "TSNeverKeyword")
  const throws = omitError ? "" : ` throws ${slice(ctx, error)}`
  const needs = requirements === undefined ? "" : ` needs ${slice(ctx, requirements)}`
  ctx.s.update(type.start, type.end, `${slice(ctx, success)}${throws}${needs}`)
}

/** `const f = Effect.fn(…)` statements converted to `effect` declarations. */
const declarations = new WeakSet<Node>()

/** The `(` that opens a generator function expression's parameters. */
const paramsOpen = (ctx: ReverseCtx, fn: Node): number => ctx.source.indexOf("(", ctx.source.indexOf("*", fn.start))

const blocked = (ctx: ReverseCtx, node: Node, what: string, fn: Node, kind: Parameters<typeof blocker>[1]) => {
  const reason = blocker(fn, kind, ctx)
  if (reason !== undefined) note(ctx, node, `${what} stays TypeScript: ${reason}`)
  return reason !== undefined
}

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
  const [fn, ...pipes]: Array<Node> = call.arguments
  if (!isGenerator(fn) || declarator.id.typeAnnotation) return false
  const name: string = declarator.id.name
  const span: Node | undefined = head.arguments[0]
  if (span?.type !== "Literal" || span.value !== name) {
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
  if (!pipes.every((pipe, i) => isPlainStep(pipe, i === pipes.length - 1))) {
    note(ctx, statement, `\`${name}\` stays TypeScript: a pipe step wouldn't read the same after \`|>\``)
    return false
  }
  if (blocked(ctx, statement, `\`${name}\``, fn, "declaration")) return false
  // the text between `function*` and `(` stays: the forward compiler keeps it after the name
  replaceHoistingComments(ctx, statement.start, ctx.source.indexOf("*", fn.start) + 1, `effect ${name}`, outerStart)
  declarations.add(statement)
  convertReturnType(ctx, fn.returnType)
  let previous = fn
  for (const pipe of pipes) {
    commaToPipe(ctx, separatorComma(ctx, previous.end, pipe.start), pipe)
    visit(pipe, call, false)
    previous = pipe
  }
  removeKeepingComments(ctx, previous.end, call.end)
  for (const param of fn.params) visit(param, fn, false)
  visit(fn.body, fn, true)
  return true
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
  visit(shape.fn.body, shape.fn, true)
  return true
}

/** `Effect.fnUntraced(function*(…) {…})` → `effect (…) => {…}`, or `=> e` for `{ return e }`. */
const convertUntraced = (ctx: ReverseCtx, call: Node, visit: Visit): boolean => {
  if (!isMember(call.callee, ctx.effect, "fnUntraced") || call.arguments.length !== 1) return false
  const fn: Node = call.arguments[0]
  if (!isGenerator(fn)) return false
  if (blocked(ctx, call, "`Effect.fnUntraced`", fn, "arrow")) return false
  replaceKeepingComments(ctx, call.start, paramsOpen(ctx, fn), "effect ")
  convertReturnType(ctx, fn.returnType)
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
    visit(value!, only, true)
  } else {
    ctx.s.appendLeft(body.start, "=> ")
    visit(body, fn, true)
  }
  removeKeepingComments(ctx, body.end, call.end)
  return true
}

const propertyName = (key: Node): string | undefined =>
  key.type === "Identifier" ? key.name : key.type === "Literal" ? String(key.value) : undefined

/** `k: Effect.fn("k")(function*(…) {…})` → `effect k(…) {…}`; computed keys use `fnUntraced`. */
const convertProperty = (ctx: ReverseCtx, property: Node, visit: Visit): boolean => {
  if (property.kind !== "init" || property.method === true || property.shorthand === true) return false
  const call: Node = property.value
  if (call?.type !== "CallExpression" || call.arguments.length !== 1) return false
  const fn: Node = call.arguments[0]
  if (!isGenerator(fn)) return false
  let keyEnd: number
  if (property.computed) {
    if (!isMember(call.callee, ctx.effect, "fnUntraced")) return false
    keyEnd = ctx.source.indexOf("]", property.key.end) + 1
  } else {
    const head: Node = call.callee
    if (head.type !== "CallExpression" || !isMember(head.callee, ctx.effect, "fn")) return false
    const name = propertyName(property.key)
    const span: Node | undefined = head.arguments[0]
    if (head.arguments.length !== 1 || span?.type !== "Literal" || span.value !== name) return false
    keyEnd = property.key.end
  }
  if (blocked(ctx, property, "this method", fn, "method")) return false
  ctx.s.appendLeft(property.start, "effect ")
  replaceKeepingComments(ctx, keyEnd, paramsOpen(ctx, fn), "")
  if (property.computed) visit(property.key, property, false)
  convertReturnType(ctx, fn.returnType)
  for (const param of fn.params) visit(param, fn, false)
  visit(fn.body, fn, true)
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
export const makeVisit = (ctx: ReverseCtx, convertClass: (cls: Node) => boolean): Visit => {
  const visit: Visit = (node, parent, generator) => {
    if (
      node.type === "VariableDeclaration" &&
      (parent?.type === "Program" || parent?.type === "BlockStatement" || parent?.type === "ExportNamedDeclaration") &&
      convertDeclaration(ctx, node, parent.type === "ExportNamedDeclaration" ? parent.start : node.start, visit)
    ) {
      return
    }
    if (node.type === "ClassDeclaration" && convertClass(node)) return
    if (node.type === "Property" && convertProperty(ctx, node, visit)) return
    if (
      node.type === "CallExpression" &&
      (convertPipe(ctx, node, parent, visit) || convertGen(ctx, node, parent, visit) ||
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
  body.forEach((statement, i) => {
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
