/**
 * Top-level `layer Name = …` (§4.14): `a & b` merges, `effect { … }` is a background layer, and
 * pipes resolve in the `Layer` namespace.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { type Ctx, type Handler, withNamespace } from "../context.ts"
import { ref } from "../names.ts"
import { walk } from "../walk.ts"
import type { HandlerGroup } from "./registry.ts"
import { wrapReturnedObjects } from "./service.ts"

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

/**
 * `layer Name for Service = …` (ADR-0095): the implementation of a service declared anywhere, as a
 * `service` body's `layer = …` is for its own. An `effect` block becomes `Layer.effect(Service,
 * Effect.gen(…))` with its returned objects wrapped in `Service.of(…)`, an object becomes
 * `Layer.succeed(Service, Service.of({ … }))`, and any other value `Layer.effect(Service, value)`.
 * Spans are named after the service, `Service.method`, as in a `service` body.
 */
const serviceLayer = (node: Node, ctx: Ctx): void => {
  const target: Node = node.efxFor
  const service = ctx.source.slice(target.start, target.end)
  const span = target.type === "MemberExpression" ? target.property.name : target.name
  ctx.s.update(node.keyword.start, node.keyword.end, "const")
  ctx.s.remove(node.id.end, target.end)
  const head = pipelineHead(node.init)
  const Layer = ref(ctx, "effect", "Layer")
  if (head.type === "EffectBlock") {
    head.efxLayerConstructor = true
    ctx.s.appendRight(head.start, `${Layer}.effect(${service}, `)
    ctx.s.prependLeft(head.end, ")")
    wrapReturnedObjects(ctx, head, service)
  } else if (head.type === "ObjectExpression") {
    ctx.s.appendRight(head.start, `${Layer}.succeed(${service}, ${service}.of(`)
    ctx.s.prependLeft(head.end, "))")
  } else {
    ctx.s.appendRight(head.start, `${Layer}.effect(${service}, `)
    ctx.s.prependLeft(head.end, ")")
  }
  head.efxPipeable = true
  const previous = ctx.service
  ctx.service = span
  withNamespace(ctx, "Layer", () => walk(node.init, node, ctx))
  ctx.service = previous
}

const layerDeclaration: Handler = (node, _parent, ctx) => {
  if (node.efxFor !== undefined) {
    serviceLayer(node, ctx)
    return true
  }
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
