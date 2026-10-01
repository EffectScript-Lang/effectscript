/**
 * `describe "…" [with layer] { … }` and `test[.live|.skip|.only] "…" { … } |> …` (§4.14) →
 * `@effect/vitest`. Test bodies are `effect` bodies; `it.effect` provides the `Scope`, so they are
 * never `Effect.scoped`.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { type Handler, makeFrame, withEffect, withNamespace } from "../context.ts"
import { ref } from "../names.ts"
import { walk } from "../walk.ts"
import type { HandlerGroup } from "./registry.ts"

const vitest = "@effect/vitest"

const describeStatement: Handler = (node, _parent, ctx) => {
  const name = ctx.source.slice(node.name.start, node.name.end)
  const layer: Node | null = node.layer
  if (layer === null) {
    ctx.s.update(node.keyword.start, node.body.start, `${ref(ctx, vitest, "describe")}(${name}, () => `)
    ctx.s.appendLeft(node.body.end, ")")
    walk(node.body, node, ctx)
    return true
  }
  ctx.s.update(node.keyword.start, layer.start, `${ref(ctx, vitest, "layer")}(`)
  ctx.s.update(layer.end, node.body.start, `)(${name}, (it) => `)
  ctx.s.appendLeft(node.body.end, ")")
  walk(layer, node, ctx)
  // tests inside use the `it` that `layer(…)` passes in
  const previous = ctx.testIt
  ctx.testIt = "it"
  walk(node.body, node, ctx)
  ctx.testIt = previous
  return true
}

const testStatement: Handler = (node, _parent, ctx) => {
  const it = ctx.testIt ?? ref(ctx, vitest, "it")
  const E = ref(ctx, "effect", "Effect")
  const method = node.modifier === "live"
    ? `${it}.live`
    : node.modifier === "skip" || node.modifier === "only"
    ? `${it}.effect.${node.modifier}`
    : `${it}.effect`
  const name = ctx.source.slice(node.name.start, node.name.end)
  ctx.s.update(node.keyword.start, node.body.start, `${method}(${name}, () => ${E}.gen(function*() `)
  const frame = makeFrame(node, "block", true) // `it.effect` provides the Scope
  withEffect(ctx, frame, () => withNamespace(ctx, "Effect", () => walk(node.body, node, ctx)))
  const pipes: Array<Node> = node.efxPipes ?? []
  if (pipes.length === 0) {
    ctx.s.appendLeft(node.body.end, "))")
    return true
  }
  let previousEnd: number = node.body.end
  pipes.forEach((pipe, i) => {
    const op: { readonly start: number; readonly end: number } = node.efxPipeOps[i]
    const text = i === 0 ? ").pipe(" : ", "
    if (ctx.source.slice(previousEnd, op.start).includes("\n")) {
      ctx.s.appendLeft(previousEnd, text.trimEnd())
      ctx.s.remove(op.start, ctx.source[op.end] === " " ? op.end + 1 : op.end)
    } else {
      ctx.s.update(previousEnd, pipe.start, text)
    }
    withNamespace(ctx, "Effect", () => walk(pipe, node, ctx))
    previousEnd = pipe.end
  })
  ctx.s.appendLeft(previousEnd, "))")
  return true
}

/**
 * @since 4.0.0
 * @category handlers
 */
export const testHandlers: HandlerGroup = {
  DescribeStatement: describeStatement,
  TestStatement: testStatement
}
