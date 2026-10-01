/**
 * `main { … } |> …` → `<Runtime>.runMain(Effect.gen(…).pipe(…, Effect.provide(<Runtime>Services.layer)))`,
 * moved to the end of the module so every declaration is initialized first.
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import { type Ctx, type Handler, makeFrame, withEffect } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { ref } from "../names.ts"
import type { Runtime } from "../options.ts"
import { walk } from "../walk.ts"
import { lineRange } from "./classLike.ts"
import { lastEnd } from "./effect.ts"
import type { HandlerGroup } from "./registry.ts"

const runtimes: Record<
  Runtime,
  { readonly module: string; readonly runtime: string; readonly services: string | undefined }
> = {
  node: { module: "@effect/platform-node", runtime: "NodeRuntime", services: "NodeServices" },
  bun: { module: "@effect/platform-bun", runtime: "BunRuntime", services: "BunServices" },
  deno: { module: "@effect/platform-deno", runtime: "DenoRuntime", services: "DenoServices" },
  browser: { module: "@effect/platform-browser", runtime: "BrowserRuntime", services: undefined }
}

const joinPipe = (
  ctx: Ctx,
  previousEnd: number,
  op: { readonly start: number; readonly end: number },
  nextStart: number,
  text: string
): void => {
  if (ctx.source.slice(previousEnd, op.start).includes("\n")) {
    ctx.s.appendLeft(previousEnd, text)
    ctx.s.remove(op.start, ctx.source[op.end] === " " ? op.end + 1 : op.end)
  } else {
    ctx.s.update(previousEnd, nextStart, text === "," ? ", " : text)
  }
}

const mainStatement: Handler = (node, parent, ctx) => {
  if (parent?.type !== "Program") {
    ctx.diagnostics.push(
      diagnosticError("EFX6002", "`main` must be at the top level of a module", node.start, node.keyword.end)
    )
  }
  const mains = (ctx.analysis.program.body as Array<Node>).filter((s) => s.type === "MainStatement")
  if (mains.indexOf(node) > 0) {
    ctx.diagnostics.push(
      diagnosticError("EFX6001", "Only one `main` is allowed per module", node.start, node.keyword.end)
    )
  }
  const target = runtimes[ctx.options.runtime]
  const E = ref(ctx, "effect", "Effect")
  const runtime = ref(ctx, target.module, target.runtime)
  const services = target.services === undefined ? undefined : ref(ctx, target.module, target.services)
  ctx.s.update(node.start, node.body.start, `${runtime}.runMain(${E}.gen(function*() `)
  const frame = makeFrame(node, "main")
  withEffect(ctx, frame, () => walk(node.body, node, ctx))
  const telemetry = ctx.options.observability === "otlp"
    ? `${E}.provide(${ref(ctx, "effect/observability", "Otlp")}.layerFromConfig().pipe(${
      ref(ctx, "effect", "Layer")
    }.provide([${ref(ctx, "effect/http", "FetchHttpClient")}.layer, ${
      ref(ctx, "effect/observability", "OtlpSerialization")
    }.layerJson])))`
    : undefined
  const provides = [telemetry, services === undefined ? undefined : `${E}.provide(${services}.layer)`]
    .filter((p): p is string => p !== undefined)
  const provide = provides.length === 0 ? undefined : provides.join(", ")
  const pipes: Array<Node> = node.efxPipes
  if (pipes.length === 0) {
    const extras = [...(frame.scoped ? [`${E}.scoped`] : []), ...(provide === undefined ? [] : [provide])]
    ctx.s.appendLeft(node.end, extras.length > 0 ? `).pipe(${extras.join(", ")}))` : "))")
  } else {
    let previousEnd: number = node.end
    pipes.forEach((pipe, i) => {
      joinPipe(
        ctx,
        previousEnd,
        node.efxPipeOps[i],
        pipe.start,
        i === 0 ? `).pipe(${frame.scoped ? `${E}.scoped, ` : ""}` : ","
      )
      walk(pipe, node, ctx)
      previousEnd = pipe.end
    })
    ctx.s.appendLeft(previousEnd, `${provide === undefined ? "" : `, ${provide}`}))`)
  }
  const [start, end] = lineRange(ctx.source, { type: "MainStatement", start: node.start, end: lastEnd(node) })
  if (ctx.source.slice(end).trim() !== "") {
    if (!ctx.source.endsWith("\n")) ctx.s.appendLeft(ctx.source.length, "\n")
    ctx.s.move(start, end, ctx.source.length)
  }
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const mainHandlers: HandlerGroup = {
  MainStatement: mainStatement
}
