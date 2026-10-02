/**
 * `describe "…" [with layer] { … }` and `test[.live|.skip|.only] "…" { … } |> …` (§4.14) →
 * `@effect/vitest`. Test bodies are `effect` bodies; `it.effect` provides the `Scope`, so they are
 * never `Effect.scoped`.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { type Handler, makeFrame, withEffect, withNamespace } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { fresh, ref, unused } from "../names.ts"
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
  // nested inside another `describe … with`: chain through the outer `it`, keeping its layer (review C3)
  const head = ctx.testIt === undefined ? `${ref(ctx, vitest, "layer")}(` : `${ctx.testIt}.layer(`
  // a fresh name, so a user binding named `it` is never captured (review C2)
  const param = unused(ctx, "it")
  ctx.s.update(node.keyword.start, layer.start, head)
  ctx.s.update(layer.end, node.body.start, `)(${name}, (${param}) => `)
  ctx.s.appendLeft(node.body.end, ")")
  walk(layer, node, ctx)
  // tests inside use the `it` that `layer(…)` passes in
  const previous = ctx.testIt
  ctx.testIt = param
  walk(node.body, node, ctx)
  ctx.testIt = previous
  return true
}

const testStatement: Handler = (node, _parent, ctx) => {
  if (node.modifier === "live" && ctx.testIt !== undefined) {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX2030",
        "`test.live` can't run inside `describe … with`: the shared layer's tests have no live mode",
        node.keyword.start,
        node.name.start,
        "move the test out of the block and provide the layer with `|> provide(…)`"
      )
    )
  }
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

/** `doctest "./x.efx" [with layer]` → the examples of `./x.efx?doctest` as tests (docs spec §2.3). */
const doctestStatement: Handler = (node, _parent, ctx) => {
  const target: string = node.path.value
  if (typeof target !== "string" || !/^\.\.?\//.test(target) || !/\.(efx|ts)$/.test(target)) {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX9304",
        "`doctest` needs a relative path to a .efx or .ts file",
        node.path.start,
        node.path.end,
        "for example doctest \"../src/bank.efx\""
      )
    )
    return true
  }
  const local = fresh(ctx, "doctest")
  ctx.imports.need(`${target}?doctest`, "default", local)
  const name = JSON.stringify(`doctest ${target}`)
  const layer: Node | null = node.layer
  const end = ctx.source[node.end - 1] === ";" ? node.end - 1 : node.end
  if (layer === null) {
    const it = ctx.testIt ?? ref(ctx, vitest, "it")
    ctx.s.update(node.keyword.start, end, `${ref(ctx, vitest, "describe")}(${name}, () => ${local}(${it}))`)
    return true
  }
  const head = ctx.testIt === undefined ? `${ref(ctx, vitest, "layer")}(` : `${ctx.testIt}.layer(`
  const param = unused(ctx, "it")
  ctx.s.update(node.keyword.start, layer.start, head)
  const tail = `)(${name}, (${param}) => ${local}(${param}))`
  if (layer.end < end) ctx.s.update(layer.end, end, tail)
  else ctx.s.appendLeft(layer.end, tail)
  walk(layer, node, ctx)
  return true
}

/**
 * @since 4.0.0
 * @category handlers
 */
export const testHandlers: HandlerGroup = {
  DescribeStatement: describeStatement,
  TestStatement: testStatement,
  DoctestStatement: doctestStatement
}
