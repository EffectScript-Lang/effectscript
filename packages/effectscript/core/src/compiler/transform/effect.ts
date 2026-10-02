/**
 * `effect` functions: declarations (this task), blocks/arrows/methods (Task 6).
 *
 * @since 0.1.0
 */
import { containsThis, type Node } from "../ast.ts"
import { type Ctx, type Handler, makeFrame, withEffect, withNamespace } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { ref } from "../names.ts"
import { skipSpace } from "../parser/scan.ts"
import { walk, walkChildren } from "../walk.ts"
import { topicsOf } from "./pipeline.ts"
import type { HandlerGroup } from "./registry.ts"
import { rewriteReturnType } from "./returnType.ts"

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

const effectDeclaration: Handler = (node, parent, ctx) => {
  if (node.efx?.kind !== "declaration") return
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

const effectClassMember: Handler = (node, _parent, ctx) => {
  if (node.efx?.kind !== "method") return
  ctx.diagnostics.push(
    diagnosticError(
      "EFX2002",
      "`effect` class methods are not supported yet",
      node.efx.keyword.start,
      node.efx.keyword.end,
      "use a property: `name = effect (…) => { … }`, or a `service`"
    )
  )
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
  MethodDefinition: effectClassMember,
  TSDeclareMethod: effectClassMember
}
