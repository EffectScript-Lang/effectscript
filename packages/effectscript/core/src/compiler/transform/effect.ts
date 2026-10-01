/**
 * `effect` functions: declarations (this task), blocks/arrows/methods (Task 6).
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import { type Ctx, type Handler, makeFrame, withEffect } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { walk, walkChildren } from "../walk.ts"
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
    ctx.s.prependLeft(end, `${leading})`)
    return
  }
  let previousEnd = end
  pipes.forEach((pipe, i) => {
    removePipeOp(ctx, previousEnd, ops[i]!, i === 0 ? `${leading},` : ",")
    walk(pipe, node, ctx)
    previousEnd = pipe.end
  })
  ctx.s.prependLeft(previousEnd, ")")
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
  const head = `const ${name} = Effect.fn(${JSON.stringify(spanName(ctx, name))})(function*`
  ctx.imports.need("effect", "Effect")
  const start = exportDefault ? parent!.start : keyword.start
  if (/^\s*$/.test(ctx.source.slice(keyword.end, node.id.start))) {
    ctx.s.update(start, node.id.end, head)
  } else {
    ctx.s.update(start, keyword.end, head)
    ctx.s.remove(node.id.start, node.id.end)
  }
  rewriteReturnType(ctx, node.returnType, "Effect.fn.Return")
  const frame = makeFrame(node, "declaration")
  withEffect(ctx, frame, () => walkChildren(node, ctx, new Set([node.id, ...(node.efxPipes ?? [])])))
  attachPipesAsArguments(ctx, node, node.end, frame.scoped ? ", Effect.scoped" : "")
  if (exportDefault) ctx.s.appendLeft(lastEnd(node), `\nexport default ${name}`)
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const effectHandlers: HandlerGroup = {
  FunctionDeclaration: effectDeclaration,
  TSDeclareFunction: effectDeclaration
}
