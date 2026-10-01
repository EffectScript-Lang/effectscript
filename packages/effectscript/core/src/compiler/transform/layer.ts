/**
 * Top-level `layer Name = …` (§4.14): `a & b` merges, `effect { … }` is a background layer, and
 * pipes resolve in the `Layer` namespace.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { type Handler, withNamespace } from "../context.ts"
import { ref } from "../names.ts"
import { walk } from "../walk.ts"
import type { HandlerGroup } from "./registry.ts"

const pipelineHead = (node: Node): Node => (node.type === "PipelineExpression" ? pipelineHead(node.left) : node)

/** The first `token` in `[from, to)` outside comments. */
const tokenOutsideComments = (source: string, from: number, to: number, token: string): number => {
  for (let i = from; i < to; i++) {
    if (source.startsWith("//", i)) {
      const end = source.indexOf("\n", i)
      i = end === -1 ? to : end
    } else if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2)
      i = end === -1 ? to : end + 1
    } else if (source[i] === token) {
      return i
    }
  }
  return -1
}

/** The operands of a left-associative `a & b & c` chain. */
const mergeOperands = (node: Node): Array<Node> =>
  node.type === "BinaryExpression" && node.operator === "&" ? [...mergeOperands(node.left), node.right] : [node]

const layerDeclaration: Handler = (node, _parent, ctx) => {
  ctx.s.update(node.keyword.start, node.keyword.end, "const")
  const head = pipelineHead(node.init)
  const Layer = ref(ctx, "effect", "Layer")
  if (head.type === "BinaryExpression" && head.operator === "&") {
    const operands = mergeOperands(head)
    ctx.s.appendRight(head.start, `${Layer}.mergeAll(`)
    // only the `&` token becomes `,`: parentheses and comments around operands stay (review C1)
    operands.forEach((operand, i) => {
      if (i === 0) return
      const amp = tokenOutsideComments(ctx.source, operands[i - 1]!.end, operand.start, "&")
      if (amp === -1) return
      const absorb = ctx.source[amp - 1] === " " && !/\s/.test(ctx.source[amp - 2] ?? " ")
      ctx.s.update(absorb ? amp - 1 : amp, amp + 1, ",")
    })
    ctx.s.prependLeft(head.end, ")")
    head.efxPipeable = true
  } else if (head.type === "EffectBlock") {
    // a background layer: the layer owns the scope, so the block is never `Effect.scoped`
    head.efxLayerConstructor = true
    head.efxPipeable = true
    ctx.s.appendRight(head.start, `${Layer}.effectDiscard(`)
    ctx.s.prependLeft(head.end, ")")
  }
  withNamespace(ctx, "Layer", () => walk(node.init, node, ctx))
  return true
}

/**
 * @since 4.0.0
 * @category handlers
 */
export const layerHandlers: HandlerGroup = {
  LayerDeclaration: layerDeclaration
}
