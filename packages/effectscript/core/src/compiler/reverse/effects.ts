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
import { convertCommand } from "./command.ts"
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
  streamOffers,
  within
} from "./context.ts"
import { convertImpl } from "./httpApi.ts"
import { convertLayer } from "./layer.ts"
import { convertEntity, convertGenericImpl, convertRpcGroup, convertTool, convertToolkit } from "./library.ts"
import { convertMain } from "./main.ts"
import { convertMatch, matchShape } from "./match.ts"
import { importedLocal, isMember } from "./origin.ts"
import { convertPipe, inPosition, isPlainStep } from "./pipes.ts"
import { hasFinalizer, inFrame } from "./resources.ts"
import { convertReferenceService } from "./service.ts"
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

/** `yield*` steps at a generator's own level, not inside a nested function. */
const ownDelegations = (body: Node): Array<Node> => {
  const found: Array<Node> = []
  const walkOwn = (node: Node): void => {
    if (/Function|Method|Class/.test(node.type)) return
    if (node.type === "YieldExpression" && node.delegate) found.push(node)
    for (const child of children(node)) walkOwn(child)
  }
  for (const child of children(body)) walkOwn(child)
  return found
}

/** Whether `name` occurs as an identifier anywhere under `node`. */
const mentions = (node: Node, name: string): boolean =>
  (node.type === "Identifier" && node.name === name) || children(node).some((child) => mentions(child, name))

/**
 * `const f = (…): Stream.Stream<A, E> => Stream.callback((queue) => Effect.gen(function*() { …
 * yield* Queue.offer(queue, x) … }).pipe(Queue.into(queue)), { bufferSize: 1 })` → `effect* f(…): A
 * throws E { … yield x … }` (ADR-0067).
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertStreamDeclaration = (ctx: ReverseCtx, statement: Node, visit: Visit): boolean => {
  const stream = importedLocal(ctx.analysis, "effect", "Stream")
  const queueModule = importedLocal(ctx.analysis, "effect", "Queue")
  if (stream === undefined || queueModule === undefined) return false
  if (statement.kind !== "const" || statement.declarations.length !== 1) return false
  const declarator: Node = statement.declarations[0]
  const arrow: Node | null = declarator.init
  if (
    declarator.id.type !== "Identifier" || declarator.id.typeAnnotation || arrow?.type !== "ArrowFunctionExpression" ||
    arrow.async || arrow.typeParameters || arrow.returnType === undefined || arrow.body.type !== "CallExpression"
  ) {
    return false
  }
  // the element, error and requirement types
  const type: Node = arrow.returnType.typeAnnotation
  const typeArgs: Array<Node> = (type.typeArguments ?? type.typeParameters)?.params ?? []
  if (
    type.type !== "TSTypeReference" || slice(ctx, type.typeName) !== `${stream}.Stream` || typeArgs.length < 1 ||
    typeArgs.length > 3
  ) {
    return false
  }
  const call: Node = arrow.body
  const [producer, options]: Array<Node> = call.arguments
  if (
    !isMember(call.callee, stream, "callback") || call.arguments.length !== 2 ||
    producer?.type !== "ArrowFunctionExpression" || producer.params.length !== 1 ||
    producer.params[0].type !== "Identifier" || slice(ctx, options!) !== "{ bufferSize: 1 }"
  ) {
    return false
  }
  const queue: string = producer.params[0].name
  const into: Node = producer.body
  if (
    into?.type !== "CallExpression" || into.callee.type !== "MemberExpression" ||
    into.callee.property?.name !== "pipe" ||
    into.arguments.length !== 1 || slice(ctx, into.arguments[0]) !== `${queueModule}.into(${queue})`
  ) {
    return false
  }
  const gen: Node = into.callee.object
  const shape = gen.type === "CallExpression" ? genShape(ctx, gen, into) : undefined
  if (shape === undefined || !("fn" in shape) || gen.arguments.length !== 1) return false
  const body: Node = shape.fn.body
  if (
    ctx.source.slice(arrow.returnType.end, body.start) !==
      ` => ${stream}.callback((${queue}) => ${ctx.effect}.gen(function*() ` ||
    ctx.source.slice(body.end, statement.end) !== `).pipe(${queueModule}.into(${queue})), { bufferSize: 1 })` ||
    ctx.source.slice(declarator.id.end, arrow.start) !== " = " ||
    commentsIn(ctx, arrow.returnType.end, body.start).length > 0
  ) {
    return false
  }
  // every use of the queue is an offer at the generator's own level
  const offers = ownDelegations(body).filter((y) =>
    y.argument.type === "CallExpression" && isMember(y.argument.callee, queueModule, "offer") &&
    y.argument.arguments.length === 2 && y.argument.arguments[0].type === "Identifier" &&
    y.argument.arguments[0].name === queue
  )
  const offered = new Set(offers.map((y) => y.argument.arguments[0]))
  const stray = (node: Node): boolean =>
    (node.type === "Identifier" && node.name === queue && !offered.has(node)) || children(node).some(stray)
  if (offers.length === 0 || stray(body) || mentions(arrow.returnType, queue)) return false
  const reason = blocker(shape.fn, "declaration", ctx)
  if (reason !== undefined) return false
  // the header
  replaceKeepingComments(ctx, statement.start, declarator.id.start, "effect* ")
  ctx.s.remove(declarator.id.end, arrow.start)
  const [success, error, requirements] = typeArgs
  const omitError = error === undefined || (requirements !== undefined && error.type === "TSNeverKeyword")
  ctx.s.update(
    type.start,
    type.end,
    `${slice(ctx, success!)}${omitError ? "" : ` throws ${slice(ctx, error!)}`}${
      requirements === undefined ? "" : ` needs ${slice(ctx, requirements)}`
    }`
  )
  ctx.s.update(arrow.returnType.end, body.start, " ")
  ctx.s.remove(body.end, statement.end)
  for (const offer of offers) {
    const value: Node = offer.argument.arguments[1]
    ctx.s.update(offer.start, value.start, "yield ")
    ctx.s.remove(value.end, offer.end)
    streamOffers.add(offer)
  }
  declarations.add(statement)
  for (const param of arrow.params) visit(param, arrow, false)
  within(ctx, "Effect", () => inFrame(ctx, false, () => visit(body, shape.fn, true)))
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
  const plain = value !== undefined && value.type !== "ObjectExpression" &&
    value.type !== "SequenceExpression"
  const expression = plain && ctx.source.slice(body.start, value!.start) === "{ return " &&
    ctx.source.slice(value!.end, body.end) === " }"
  // `=>` with the body on the next line compiles to `{ return (⏎ e) }` (the ASI guard in transform/effect.ts)
  const lineBreak = plain && !expression
    ? /^\{ return \((\s*[\n\r\u2028\u2029]\s*)$/.exec(ctx.source.slice(body.start, value!.start))
    : null
  const multiLine = lineBreak !== null && ctx.source.slice(value!.end, body.end) === ") }"
  if (expression || multiLine) {
    ctx.s.update(body.start, value!.start, multiLine ? `=>${lineBreak![1]}` : "=> ")
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

/** Line starts in `[from, to)` outside template literals and strings, as the forward compiler indents them. */
const indentedLineStarts = (ctx: ReverseCtx, root: Node, from: number, to: number): Array<number> => {
  const verbatim: Array<readonly [number, number]> = []
  const collect = (node: Node): void => {
    if (node.type === "TemplateLiteral" || (node.type === "Literal" && typeof node.value === "string")) {
      verbatim.push([node.start, node.end])
      return
    }
    for (const child of children(node)) collect(child)
  }
  collect(root)
  const starts: Array<number> = []
  for (let i = ctx.source.indexOf("\n", from); i !== -1 && i < to; i = ctx.source.indexOf("\n", i + 1)) {
    const start = i + 1
    if (start < to && !verbatim.some(([a, b]) => start > a && start < b) && ctx.source[start] !== "\n") {
      starts.push(start)
    }
  }
  return starts
}

/**
 * `m(…): Effect.Effect<A, E> { return Effect.gen({ self: this }, function*() {…}).pipe(Effect.withSpan("C.m")) }`
 * in class `C` → `effect m(…): A throws E {…}` (ADR-0065), in the one-line or the indented layout.
 */
const convertMethod = (ctx: ReverseCtx, method: Node, className: string | undefined, visit: Visit): boolean => {
  const fn: Node = method.value
  if (
    className === undefined || method.type !== "MethodDefinition" || method.kind !== "method" || method.static ||
    method.computed || method.key.type !== "Identifier" || method.accessibility !== undefined ||
    method.override === true || method.decorators?.length > 0 || fn?.type !== "FunctionExpression" ||
    fn.async || fn.generator || fn.body === null || ctx.source.slice(method.start, method.key.start) !== ""
  ) {
    return false
  }
  const body: Node = fn.body
  const only: Node | undefined = body.body.length === 1 ? body.body[0] : undefined
  const piped: Node | undefined = only?.type === "ReturnStatement" ? only.argument ?? undefined : undefined
  // `<gen>[.pipe(Effect.scoped)].pipe(Effect.withSpan("C.m"))`
  const span = `${ctx.effect}.withSpan(${JSON.stringify(`${className}.${method.key.name}`)})`
  if (piped?.type !== "CallExpression" || piped.arguments.length !== 1 || slice(ctx, piped.arguments[0]) !== span) {
    return false
  }
  if (piped.callee.type !== "MemberExpression" || piped.callee.property.name !== "pipe") return false
  let gen: Node = piped.callee.object
  let scoped = false
  if (
    gen.type === "CallExpression" && gen.callee.type === "MemberExpression" && gen.callee.property?.name === "pipe" &&
    gen.arguments.length === 1 && isScope(ctx, gen.arguments[0])
  ) {
    gen = gen.callee.object
    scoped = true
  }
  if (gen.type !== "CallExpression") return false
  const shape = genShape(ctx, gen, only)
  if (shape === undefined || !("fn" in shape)) return false
  const inner: Node = shape.fn.body
  const tail = `)${scoped ? `.pipe(${ctx.effect}.scoped)` : ""}.pipe(${span})`
  const lineStart = ctx.source.lastIndexOf("\n", method.start) + 1
  const indent = /^[ \t]*/.exec(ctx.source.slice(lineStart))![0]
  const step = indent.includes("\t") ? "\t" : "  "
  const head = ctx.source.slice(gen.start, inner.start)
  const oneLine = ctx.source.slice(body.start, gen.start) === "{ return " &&
    ctx.source.slice(inner.end, body.end) === `${tail} }`
  const closeLine = ctx.source.lastIndexOf("\n", inner.end - 1) + 1
  const indented = ctx.source.slice(body.start, gen.start) === `{\n${indent}${step}return ` &&
    ctx.source.slice(closeLine, body.end) === `${indent}${step}}${tail}\n${indent}}` &&
    head.endsWith("function*() ") && ctx.source[inner.start + 1] === "\n"
  if (!oneLine && !indented) return false
  if (commentsIn(ctx, body.start, inner.start + 1).length > 0 || commentsIn(ctx, inner.end - 1, body.end).length > 0) {
    return false
  }
  if (returnTypeProblem(ctx, fn.returnType, "Effect") !== undefined && fn.returnType !== undefined) return false
  ctx.s.appendLeft(method.start, "effect ")
  convertReturnType(ctx, fn.returnType, "Effect")
  if (oneLine) {
    ctx.s.remove(body.start, inner.start)
    ctx.s.remove(inner.end, body.end)
  } else {
    ctx.s.remove(body.start + 1, inner.start + 1)
    for (const start of indentedLineStarts(ctx, inner, inner.start + 1, closeLine)) {
      if (ctx.source.startsWith(step, start)) ctx.s.remove(start, start + step.length)
    }
    ctx.s.remove(closeLine, body.end - 1 - indent.length)
  }
  within(ctx, "Effect", () => {
    for (const param of fn.params) visit(param, fn, false)
    inFrame(ctx, scoped, () => visit(inner, shape.fn, true))
  })
  return true
}

const testNames = new Set(["describe", "it", "layer"])

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
  // the enclosing classes' names, innermost last: an `effect` method's span names its class
  const classes: Array<string | undefined> = []
  const visit: Visit = (node, parent, generator) => {
    if (node.type === "ClassDeclaration" || node.type === "ClassExpression") {
      classes.push(node.id?.name)
      try {
        visitClass(node, parent, generator)
      } finally {
        classes.pop()
      }
      return
    }
    visitNode(node, parent, generator)
  }
  const visitClass: Visit = (node, parent, generator) => {
    visitNode(node, parent, generator)
  }
  const visitNode: Visit = (node, parent, generator) => {
    if (node.type === "MethodDefinition" && convertMethod(ctx, node, classes.at(-1), visit)) return
    if (
      node.type === "VariableDeclaration" &&
      (parent?.type === "Program" || parent?.type === "BlockStatement" || parent?.type === "ExportNamedDeclaration") &&
      (convertStreamDeclaration(ctx, node, visit) ||
        convertDeclaration(ctx, node, parent.type === "ExportNamedDeclaration" ? parent.start : node.start, visit))
    ) {
      return
    }
    if (
      node.type === "VariableDeclaration" &&
      (parent?.type === "Program" || parent?.type === "ExportNamedDeclaration") &&
      (convertConfig(ctx, node, visit) || convertLayer(ctx, node, visit) || convertAtom(ctx, node, visit) ||
        convertRpcGroup(ctx, node) || convertEntity(ctx, node) || convertToolkit(ctx, node) ||
        convertTool(ctx, node, parent.type === "ExportNamedDeclaration" ? parent.start : node.start) ||
        convertCommand(ctx, node, parent.type === "ExportNamedDeclaration" ? parent.start : node.start, visit))
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
        convertGenericImpl(ctx, node, visit) ||
        convertGen(ctx, node, parent, visit) ||
        convertUntraced(ctx, node, visit))
    ) {
      return
    }
    // a function whose parameters rebind `describe`/`it`/`layer` hides the test imports inside
    const shadowed = scopes.has(node.type) && node.params !== undefined
      ? (node.params as Array<Node>).filter((p) => p.type === "Identifier" && testNames.has(p.name)).map((p) =>
        p.name as string
      )
      : []
    const added = shadowed.filter((name) => !ctx.testShadow.has(name))
    for (const name of added) ctx.testShadow.add(name)
    try {
      if (generator && scopes.has(node.type)) {
        for (const child of children(node)) visit(child, node, false)
        return
      }
      visitRest(node, parent, generator)
    } finally {
      for (const name of added) ctx.testShadow.delete(name)
    }
  }
  const visitRest = (node: Node, parent: Node | undefined, generator: boolean): void => {
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
    const consumed = convertSchemaRun(ctx, body, i) || convertReferenceService(ctx, body, i, visit)
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
