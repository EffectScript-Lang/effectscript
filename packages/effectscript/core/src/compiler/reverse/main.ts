/**
 * `<Runtime>.runMain(Effect.gen(function*() B).pipe([Effect.scoped,] …pipes[, telemetry], Effect.provide(<Runtime>Services.layer)))`
 * as the module's last statement → `main B |> …pipes` (spec §4.10, §4.16): the inverse of
 * `transform/main.ts`.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import type { Runtime } from "../options.ts"
import { genShape } from "./blockers.ts"
import type { Visit } from "./body.ts"
import {
  commaToPipe,
  commentsIn,
  note,
  removeKeepingComments,
  type ReverseCtx,
  separatorComma,
  slice,
  within
} from "./context.ts"
import { importedLocal, isMember } from "./origin.ts"
import { isPlainStep } from "./pipes.ts"
import { hasFinalizer, inFrame } from "./resources.ts"

/**
 * The runtime imports the forward compiler adds for `main`, by runtime.
 *
 * @since 4.0.0
 * @category reverse
 */
export const runtimes: Record<
  Runtime,
  { readonly module: string; readonly runtime: string; readonly services: string | undefined }
> = {
  node: { module: "@effect/platform-node", runtime: "NodeRuntime", services: "NodeServices" },
  bun: { module: "@effect/platform-bun", runtime: "BunRuntime", services: "BunServices" },
  deno: { module: "@effect/platform-deno", runtime: "DenoRuntime", services: "DenoServices" },
  browser: { module: "@effect/platform-browser", runtime: "BrowserRuntime", services: undefined }
}

/**
 * @since 4.0.0
 * @category utils
 */
export const leadingComments = (source: string): string =>
  /^(?:#![^\n]*\n)?(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*/.exec(source)![0]

/**
 * @since 4.0.0
 * @category utils
 */
export const directive = /^[ \t]*\/\/\s*@efx\s+observability\s+otlp\b[^\n]*\n?/m

const telemetryText = (ctx: ReverseCtx): string | undefined => {
  const locals = [
    importedLocal(ctx.analysis, "effect/observability", "Otlp"),
    ctx.layer,
    importedLocal(ctx.analysis, "effect/http", "FetchHttpClient"),
    importedLocal(ctx.analysis, "effect/observability", "OtlpSerialization")
  ]
  if (locals.some((l) => l === undefined)) return undefined
  const [Otlp, Layer, Fetch, Serialization] = locals
  return `${ctx.effect}.provide(${Otlp}.layerFromConfig().pipe(${Layer}.provide([${Fetch}.layer, ${Serialization}.layerJson])))`
}

/**
 * @since 4.0.0
 * @category reverse
 */
export const convertMain = (ctx: ReverseCtx, program: Node, visit: Visit): boolean => {
  const body: Array<Node> = program.body
  const statement = body[body.length - 1]
  if (statement?.type !== "ExpressionStatement") return false
  const run: Node = statement.expression
  if (run.type !== "CallExpression" || run.callee.type !== "MemberExpression" || run.callee.computed) return false
  if (run.callee.property.name !== "runMain" || run.arguments.length !== 1) return false
  const explain = (message: string) => {
    note(ctx, statement, `\`runMain\` stays TypeScript: ${message}`)
    return false
  }
  const target = runtimes[ctx.options.runtime]
  const runtime = importedLocal(ctx.analysis, target.module, target.runtime)
  if (runtime === undefined || run.callee.object.type !== "Identifier" || run.callee.object.name !== runtime) {
    return explain(`it isn't the \`${target.runtime}\` the ${ctx.options.runtime} runtime option produces`)
  }
  // `Effect.gen(…)` or `Effect.gen(…).pipe(…)`
  let gen: Node = run.arguments[0]
  let args: Array<Node> = []
  if (
    gen.type === "CallExpression" && gen.callee.type === "MemberExpression" && !gen.callee.computed &&
    gen.callee.property.name === "pipe"
  ) {
    args = [...gen.arguments]
    gen = gen.callee.object
  }
  const shape = genShape(ctx, gen, run)
  if (shape === undefined || !("fn" in shape) || gen.arguments.length !== 1) return false
  const fn = shape.fn
  // trailing provides: the runtime's services, telemetry before them
  const services = target.services === undefined
    ? undefined
    : importedLocal(ctx.analysis, target.module, target.services)
  if (target.services !== undefined) {
    const last = args[args.length - 1]
    if (
      services === undefined || last === undefined || slice(ctx, last) !== `${ctx.effect}.provide(${services}.layer)`
    ) {
      return explain("its services layer isn't the runtime's")
    }
    args.pop()
  }
  const telemetry = telemetryText(ctx)
  const withTelemetry = telemetry !== undefined && args.length > 0 && slice(ctx, args[args.length - 1]!) === telemetry
  if (withTelemetry) args.pop()
  // the forward compiler adds telemetry from the option or a leading directive
  const found = directive.exec(ctx.source)
  const leading = found !== null && found.index < leadingComments(ctx.source).length
  const fromOption = ctx.options.observability === "otlp"
  if (withTelemetry !== (fromOption || found !== null)) {
    return explain("its telemetry doesn't match the observability option or directive")
  }
  // `Effect.scoped` first when the body has a finalizer that becomes `defer`
  const scoped = args.length > 0 && isMember(args[0], ctx.effect, "scoped") && hasFinalizer(ctx, fn.body)
  const pipes = scoped ? args.slice(1) : args
  if (!pipes.every((p) => isPlainStep(p))) return explain("a pipe step wouldn't read the same after `|>`")
  // the text before the body is rewritten whole, and so is the text after `.pipe(`
  if (commentsIn(ctx, statement.start, fn.body.start).length > 0) return false

  // rewrite (a directive that isn't leading yet becomes leading once the imports above it go;
  // `toEffectScript` checks that and otherwise converts again without `main`)
  if (ctx.disabled.has("main")) return false
  if (withTelemetry && !fromOption && !leading) ctx.telemetryDirective = true
  ctx.s.update(statement.start, fn.body.start, "main ")
  let previous: Node = fn.body
  pipes.forEach((pipe, i) => {
    if (i === 0) {
      const from = scoped ? args[0]!.end : ctx.source.indexOf("(", gen.end) + 1
      const gap = ctx.source.slice(from, pipe.start)
      const newline = gap.lastIndexOf("\n")
      if (commentsIn(ctx, fn.body.end, pipe.start).length > 0) {
        // keep the comments: drop only `).pipe(` (and the scope) before them
        ctx.s.remove(fn.body.end, from)
        ctx.s.appendLeft(pipe.start, "|> ")
      } else {
        ctx.s.update(fn.body.end, pipe.start, newline === -1 ? " |> " : `${gap.slice(newline)}|> `)
      }
    } else {
      commaToPipe(ctx, separatorComma(ctx, previous.end, pipe.start), pipe)
    }
    visit(pipe, run, false)
    previous = pipe
  })
  removeKeepingComments(ctx, previous.end, run.end)
  within(ctx, "Effect", () => inFrame(ctx, scoped, () => visit(fn.body, fn, true)))
  return true
}
