/**
 * `: A throws E needs R` → `: Wrapper<A, E, R>` (in place).
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import type { Ctx } from "../context.ts"
import { ref } from "../names.ts"
import type { HandlerGroup } from "./registry.ts"

/**
 * `member` is the path inside the `Effect` namespace (`"fn.Return"` or `"Effect"`).
 *
 * @since 0.1.0
 * @category transforms
 */
export const rewriteReturnType = (ctx: Ctx, annotation: Node | null | undefined, member: string): void => {
  if (annotation === null || annotation === undefined || annotation.typeAnnotation === undefined) return
  annotation.efxHandled = true
  const success: Node = annotation.typeAnnotation
  ctx.s.appendRight(success.start, `${ref(ctx, "effect", "Effect")}.${member}<`)
  let end: number = success.end
  if (annotation.efxThrows !== undefined) {
    ctx.s.update(success.end, annotation.efxThrowsKeyword.end, ",")
    end = annotation.efxThrows.end
  }
  if (annotation.efxNeeds !== undefined) {
    ctx.s.update(end, annotation.efxNeedsKeyword.end, annotation.efxThrows !== undefined ? "," : ", never,")
    end = annotation.efxNeeds.end
  }
  ctx.s.prependLeft(end, ">")
}

/**
 * `throws`/`needs` in any other return position means "returns an Effect".
 *
 * @since 0.1.0
 * @category handlers
 */
export const returnTypeHandlers: HandlerGroup = {
  TSTypeAnnotation: (node, _parent, ctx) => {
    if (node.efxHandled === true) return
    if (node.efxThrows === undefined && node.efxNeeds === undefined) return
    rewriteReturnType(ctx, node, "Effect")
  }
}
