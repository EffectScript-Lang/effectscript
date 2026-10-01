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
    operands.forEach((operand, i) => {
      if (i > 0) ctx.s.update(operands[i - 1]!.end, operand.start, ", ")
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
