/**
 * `effect` functions: declarations (this task), blocks/arrows/methods (Task 6).
 *
 * @since 0.1.0
 */
import { containsThis, type Node } from "../ast.ts"
import { type Ctx, type Handler, makeFrame, withEffect, withNamespace } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { ref, unused } from "../names.ts"
import { skipSpace } from "../parser/scan.ts"
import { walk, walkChildren } from "../walk.ts"
import { topicsOf } from "./pipeline.ts"
import type { HandlerGroup } from "./registry.ts"
import { rewriteReturnType, rewriteReturnTypeAs } from "./returnType.ts"

/**
 * @since 0.1.0
 * @category utils
 */
export const spanName = (ctx: Ctx, name: string): string => ctx.service === undefined ? name : `${ctx.service}.${name}`

/**
 * Removes a `|>` token (and one following space) and appends `text` right after the previous item.
 *
 * @since 0.1.0
 * @category utils
 */
export const removePipeOp = (
  ctx: Ctx,
  previousEnd: number,
  op: { readonly start: number; readonly end: number },
  text: string
): void => {
  ctx.s.appendLeft(previousEnd, text)
  ctx.s.remove(op.start, ctx.source[op.end] === " " ? op.end + 1 : op.end)
}

/**
 * `} |> a |> b` → `}<leading>, a, b)`. Walks each pipe in the current (outer) context.
 *
 * @since 0.1.0
 * @category utils
 */
export const attachPipesAsArguments = (ctx: Ctx, node: Node, end: number, leading: string): void => {
  const pipes: Array<Node> = node.efxPipes ?? []
  const ops: Array<{ readonly start: number; readonly end: number }> = node.efxPipeOps ?? []
  if (pipes.length === 0) {
    ctx.s.appendLeft(end, `${leading})`)
    return
  }
  let previousEnd = end
  pipes.forEach((pipe, i) => {
    removePipeOp(ctx, previousEnd, ops[i]!, i === 0 ? `${leading},` : ",")
    if (topicsOf(pipe).length > 0) {
      ctx.diagnostics.push(
        diagnosticError(
          "EFX5001",
          "Hack-style `%` is not allowed in declaration pipes",
          pipe.start,
          pipe.end,
          "pipes after a declaration must be functions, like `retry(…)`"
        )
      )
    }
    walk(pipe, node, ctx)
    previousEnd = pipe.end
  })
  ctx.s.appendLeft(previousEnd, ")")
}

/**
 * @since 0.1.0
 * @category utils
 */
export const lastEnd = (node: Node): number => {
  const pipes: Array<Node> = node.efxPipes ?? []
  return pipes.length > 0 ? pipes[pipes.length - 1]!.end : node.end
}

/** The `yield`s that belong to a function itself, not to a function nested in it. */
const ownYields = (fn: Node): Array<Node> => {
  const found: Array<Node> = []
  const visit = (node: Node, top: boolean): void => {
    if (node === null || typeof node !== "object") return
    if (!top && /Function|Method/.test(node.type ?? "")) return
    if (node.type === "YieldExpression") found.push(node)
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc") continue
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child !== null && typeof child === "object" && typeof child.type === "string") visit(child, false)
      }
    }
  }
  visit(fn.body, false)
  return found
}

/**
 * `effect* name(…): A throws E { … yield x … }` → `const name = (…): Stream.Stream<A, E> =>
 * Stream.callback((queue) => Effect.gen(function*() { … yield* Queue.offer(queue, x) … })
 * .pipe(Queue.into(queue)), { bufferSize: 1 })` (ADR-0067). The stream pulls one element at a
 * time, ends when the body returns, and fails with what it throws.
 */
const streamDeclaration = (node: Node, parent: Node | undefined, ctx: Ctx): true => {
  const keyword: { start: number; end: number } = node.efx.keyword
  const name: string = node.id.name
  if (node.returnType === undefined || node.returnType === null) {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX2006",
        "An `effect*` stream needs its element type",
        keyword.start,
        node.id.end,
        `write \`effect* ${name}(…): Element\``
      )
    )
    return true
  }
  if ((node.efxPipes ?? []).length > 0) {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX2008",
        "An `effect*` stream takes no `|>` pipes",
        node.efxPipeOps[0].start,
        lastEnd(node),
        "pipe the stream where it is used"
      )
    )
    return true
  }
  const E = ref(ctx, "effect", "Effect")
  const Q = ref(ctx, "effect", "Queue")
  const S = ref(ctx, "effect", "Stream")
  // each stream binds its own parameter, so sibling streams may share the name
  const queue = unused(ctx, "queue")
  const yields = ownYields(node)
  for (const y of yields) {
    if (y.delegate) {
      ctx.diagnostics.push(
        diagnosticError(
          "EFX2007",
          "`yield*` in an `effect*` stream",
          y.start,
          y.end,
          "write `for await (const x of stream) yield x`"
        )
      )
      return true
    }
    y.efxStreamQueue = queue
  }
  const exportDefault = node.efx.exportDefault === true
  ctx.s.update(exportDefault ? parent!.start : keyword.start, node.id.start, "const ")
  ctx.s.appendLeft(node.id.end, " = ")
  rewriteReturnTypeAs(ctx, node.returnType, () => `${S}.Stream`)
  ctx.s.update(node.returnType.end, node.body.start, ` => ${S}.callback((${queue}) => ${E}.gen(function*() `)
  const frame = makeFrame(node, "declaration")
  withEffect(ctx, frame, () => withNamespace(ctx, "Effect", () => walkChildren(node, ctx, new Set([node.id]))))
  // a stream provides the scope its body runs in: `defer` and `using` need no `Effect.scoped`
  ctx.s.appendLeft(node.end, `).pipe(${Q}.into(${queue})), { bufferSize: 1 })`)
  if (exportDefault) ctx.s.appendLeft(node.end, `\nexport default ${name}`)
  return true
}

const streamYield: Handler = (node, _parent, ctx) => {
  const queue: string | undefined = node.efxStreamQueue
  if (queue === undefined) return
  const Q = ref(ctx, "effect", "Queue")
  if (node.argument === null) ctx.s.update(node.start, node.end, `yield* ${Q}.offer(${queue}, undefined)`)
  else {
    ctx.s.update(node.start, node.argument.start, `yield* ${Q}.offer(${queue}, `)
    ctx.s.appendLeft(node.argument.end, ")")
    walk(node.argument, node, ctx)
  }
  return true
}

const effectDeclaration: Handler = (node, parent, ctx) => {
  if (node.efx?.kind !== "declaration") return
  if (node.efx.stream === true && node.type !== "TSDeclareFunction") return streamDeclaration(node, parent, ctx)
  if (node.type === "TSDeclareFunction") {
    ctx.diagnostics.push(diagnosticError("EFX2005", "An `effect` declaration needs a body", node.start, node.end))
    return true
  }
  const name: string = node.id.name
  const exportDefault = node.efx.exportDefault === true
  const keyword: { start: number; end: number } = node.efx.keyword
  const E = ref(ctx, "effect", "Effect")
  const head = `const ${name} = ${E}.fn(${JSON.stringify(spanName(ctx, name))})(function*`
  const start = exportDefault ? parent!.start : keyword.start
  if (/^\s*$/.test(ctx.source.slice(keyword.end, node.id.start))) {
    // the name stays user text, so editor navigation and rename keep working on it
    ctx.s.update(start, node.id.start, "const ")
    ctx.s.appendLeft(node.id.end, ` = ${E}.fn(${JSON.stringify(spanName(ctx, name))})(function*`)
  } else {
    ctx.s.update(start, keyword.end, head)
    ctx.s.remove(node.id.start, node.id.end)
  }
  rewriteReturnType(ctx, node.returnType, "fn.Return")
  const frame = makeFrame(node, "declaration")
  withEffect(ctx, frame, () => walkChildren(node, ctx, new Set([node.id, ...(node.efxPipes ?? [])])))
  attachPipesAsArguments(ctx, node, node.end, frame.scoped ? `, ${E}.scoped` : "")
  if (exportDefault) ctx.s.appendLeft(lastEnd(node), `\nexport default ${name}`)
  return true
}

const effectBlock: Handler = (node, parent, ctx) => {
  if (parent?.type === "ExpressionStatement") {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX2003",
        "This effect is created but never used",
        node.start,
        node.keyword.end,
        "did you mean `main { … }`?"
      )
    )
  }
  const E = ref(ctx, "effect", "Effect")
  const head = containsThis(node.body) ? `${E}.gen({ self: this }, function*() ` : `${E}.gen(function*() `
  ctx.s.update(node.start, node.body.start, head)
  const frame = makeFrame(node, "block", node.efxLayerConstructor === true)
  withEffect(ctx, frame, () => withNamespace(ctx, "Effect", () => walk(node.body, node, ctx)))
  if (frame.scoped && !frame.layerConstructor) {
    ctx.s.appendRight(node.start, `${E}.scoped(`)
    ctx.s.appendLeft(node.end, "))")
  } else {
    ctx.s.appendLeft(node.end, ")")
  }
  return true
}

const effectArrow: Handler = (node, _parent, ctx) => {
  if (node.efx?.kind !== "arrow") return
  const keyword: { start: number; end: number } = node.efx.keyword
  if (containsThis(node.body)) {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX2001",
        "`effect` arrows cannot use `this`",
        keyword.start,
        keyword.end,
        "use an `effect { … }` block or an `effect` method"
      )
    )
  }
  const E = ref(ctx, "effect", "Effect")
  const params: Array<Node> = node.params
  if (ctx.source[skipSpace(ctx.source, keyword.end)] === "(") {
    ctx.s.update(keyword.start, node.start, `${E}.fnUntraced(function*`)
  } else {
    ctx.s.update(keyword.start, params[0]!.start, `${E}.fnUntraced(function*(`)
    ctx.s.appendLeft(params[0]!.end, ")")
  }
  rewriteReturnType(ctx, node.returnType, "fn.Return")
  const searchFrom: number = node.returnType?.end ?? (params.length > 0 ? params[params.length - 1]!.end : node.start)
  const arrow = ctx.source.indexOf("=>", searchFrom)
  const expressionBody = node.body.type !== "BlockStatement"
  // a body on the next line would end the `return` (ASI): parenthesize it
  const wrap = expressionBody && /[\n\r\u2028\u2029]/.test(ctx.source.slice(arrow + 2, node.body.start))
  if (expressionBody) ctx.s.update(arrow, arrow + 2, wrap ? "{ return (" : "{ return")
  else ctx.s.remove(arrow, node.body.start)
  const frame = makeFrame(node, "arrow")
  withEffect(ctx, frame, () => withNamespace(ctx, "Effect", () => walkChildren(node, ctx)))
  const close = frame.scoped ? `, ${E}.scoped)` : ")"
  ctx.s.appendLeft(node.end, expressionBody ? `${wrap ? ")" : ""} }${close}` : close)
  return true
}

const effectProperty: Handler = (node, _parent, ctx) => {
  if (node.efxMethod !== true) return
  const fn: Node = node.value
  const E = ref(ctx, "effect", "Effect")
  const keyStart = node.computed ? ctx.source.lastIndexOf("[", node.key.start) : node.key.start
  ctx.s.remove(fn.efx.keyword.start, keyStart)
  const name: string | undefined = node.computed
    ? undefined
    : node.key.type === "Identifier"
    ? node.key.name
    : String(node.key.value)
  ctx.s.appendRight(
    fn.start,
    name === undefined
      ? `: ${E}.fnUntraced(function*`
      : `: ${E}.fn(${JSON.stringify(spanName(ctx, name))})(function*`
  )
  rewriteReturnType(ctx, fn.returnType, "fn.Return")
  if (node.computed) walk(node.key, node, ctx)
  const frame = makeFrame(fn, "method")
  withEffect(ctx, frame, () => withNamespace(ctx, "Effect", () => walk(fn, node, ctx)))
  ctx.s.appendLeft(fn.end, frame.scoped ? `, ${E}.scoped)` : ")")
  return true
}

/** The first `super` or `arguments` a method body uses itself (arrows inherit both; functions don't). */
const superOrArguments = (node: Node): Node | undefined => {
  if (node === null || typeof node !== "object") return undefined
  if (node.type === "Super" || (node.type === "Identifier" && node.name === "arguments")) return node
  if (/^(FunctionDeclaration|FunctionExpression|ClassDeclaration|ClassExpression)$/.test(node.type ?? "")) {
    return undefined
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "loc") continue
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child !== null && typeof child === "object" && typeof child.type === "string") {
        const found = superOrArguments(child)
        if (found !== undefined) return found
      }
    }
  }
  return undefined
}

/** Line starts inside `[from, to)` that aren't inside a template literal or string. */
const lineStartsToIndent = (ctx: Ctx, body: Node, from: number, to: number): Array<number> => {
  const verbatim: Array<readonly [number, number]> = []
  const collect = (node: Node): void => {
    if (node === null || typeof node !== "object") return
    if (node.type === "TemplateLiteral" || (node.type === "Literal" && typeof node.value === "string")) {
      verbatim.push([node.start, node.end])
      return
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc") continue
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child !== null && typeof child === "object" && typeof child.type === "string") collect(child)
      }
    }
  }
  collect(body)
  const starts: Array<number> = []
  for (let i = ctx.source.indexOf("\n", from); i !== -1 && i < to; i = ctx.source.indexOf("\n", i + 1)) {
    const start = i + 1
    if (start >= to || verbatim.some(([a, b]) => start > a && start < b)) continue
    if (ctx.source[start] !== "\n") starts.push(start)
  }
  return starts
}

/**
 * `effect name(…): A throws E { … }` in a class → a prototype method returning
 * `Effect.gen({ self: this }, function*() { … }).pipe(Effect.withSpan("Class.name"))` (ADR-0065).
 * A method rather than an `Effect.fn` field: instances stay plain data for `Equal` and encoding.
 */
const effectClassMember: Handler = (node, _parent, ctx) => {
  if (node.efx?.kind !== "method") return
  const keyword: { start: number; end: number } = node.efx.keyword
  const fn: Node = node.value
  if (node.type === "TSDeclareMethod" || fn.body === null || fn.body === undefined || node.kind !== "method") {
    ctx.diagnostics.push(
      diagnosticError("EFX2002", "An `effect` method needs a body", keyword.start, keyword.end)
    )
    return true
  }
  if (fn.generator === true) {
    ctx.diagnostics.push(
      diagnosticError("EFX2002", "An `effect` method can't be a generator", keyword.start, keyword.end)
    )
    return true
  }
  // the body runs in a generator function: `super` doesn't parse there, and `arguments` would be
  // the generator's (Plan 22 review I3)
  const inherited = superOrArguments(fn.body)
  if (inherited !== undefined) {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX2009",
        `An \`effect\` method can't use \`${inherited.type === "Super" ? "super" : "arguments"}\``,
        inherited.start,
        inherited.end,
        inherited.type === "Super"
          ? "read what you need from `super` in a plain method, and pass it in"
          : "use a rest parameter: `effect m(...args: Array<A>)`"
      )
    )
    return true
  }
  const E = ref(ctx, "effect", "Effect")
  ctx.s.remove(keyword.start, skipSpace(ctx.source, keyword.end))
  rewriteReturnType(ctx, fn.returnType, "Effect")
  const name: string | undefined = node.computed || node.key.type !== "Identifier" ? undefined : node.key.name
  const span = name === undefined || node.efx.className === undefined
    ? ""
    : `.pipe(${E}.withSpan(${JSON.stringify(`${node.efx.className}.${name}`)}))`
  const body: Node = fn.body
  const gen = containsThis(body) ? `${E}.gen({ self: this }, function*() ` : `${E}.gen(function*() `
  const open = body.start
  const close = body.end - 1
  const multiline = ctx.source.slice(open, close).includes("\n")
  const frame = makeFrame(fn, "method")
  if (!multiline) {
    ctx.s.appendLeft(open, `{ return ${gen}`)
    withEffect(ctx, frame, () => withNamespace(ctx, "Effect", () => walk(fn, node, ctx)))
    ctx.s.appendLeft(body.end, `)${frame.scoped ? `.pipe(${E}.scoped)` : ""}${span} }`)
    return true
  }
  // the generator gets the method's lines, one level deeper
  const lineStart = ctx.source.lastIndexOf("\n", node.start) + 1
  const indent = /^[ \t]*/.exec(ctx.source.slice(lineStart))![0]
  const step = indent.includes("\t") ? "\t" : "  "
  ctx.s.appendLeft(open + 1, `\n${indent}${step}return ${gen}{`)
  for (const start of lineStartsToIndent(ctx, body, open, close)) {
    if (ctx.source.slice(start, close).trim() !== "") ctx.s.prependRight(start, step)
  }
  withEffect(ctx, frame, () => withNamespace(ctx, "Effect", () => walk(fn, node, ctx)))
  ctx.s.prependLeft(close, `${step}})${frame.scoped ? `.pipe(${E}.scoped)` : ""}${span}\n${indent}`)
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const effectHandlers: HandlerGroup = {
  FunctionDeclaration: effectDeclaration,
  TSDeclareFunction: effectDeclaration,
  EffectBlock: effectBlock,
  ArrowFunctionExpression: effectArrow,
  Property: effectProperty,
  YieldExpression: streamYield,
  MethodDefinition: effectClassMember,
  TSDeclareMethod: effectClassMember
}
