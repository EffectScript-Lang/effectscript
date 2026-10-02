/**
 * `toEffectScript`: idiomatic Effect TypeScript → EffectScript (spec §6). Anything that doesn't
 * match a canonical shape stays TypeScript, which is valid EffectScript. Every rewrite compiles
 * back to its input (ADR-0030).
 *
 * @since 4.0.0
 */
import { MagicString } from "magic-string"
import { analyze } from "../analyze/scope.ts"
import { children, type Node } from "../ast.ts"
import { resolveOptions } from "../options.ts"
import { parse } from "../parser/parse.ts"
import { classShape, convertClass } from "./classes.ts"
import type { ConvertNote, ConvertOptions, ReverseCtx } from "./context.ts"
import { makeVisit, visitProgram } from "./effects.ts"
import { convertHttpApi } from "./httpApi.ts"
import { applyPrelude } from "./imports.ts"
import { directive, leadingComments } from "./main.ts"
import { importedLocal } from "./origin.ts"
import { topicsRoundTrip } from "./pipes.ts"
import { effectDeclarationName } from "./resources.ts"
import { convertService } from "./service.ts"
import { compilesBack } from "./verify.ts"

export type { ConvertNote, ConvertOptions } from "./context.ts"

/**
 * @since 4.0.0
 * @category models
 */
export interface ConvertResult {
  readonly code: string
  /** Near misses that were left as TypeScript, and why. */
  readonly notes: ReadonlyArray<ConvertNote>
}

/**
 * Converts idiomatic Effect TypeScript to EffectScript.
 *
 * @since 4.0.0
 * @category reverse
 */
export const toEffectScript = (source: string, options: ConvertOptions = {}): ConvertResult => {
  const full = convert(source, options, new Set(), undefined)
  if (full.code === source || compilesBack(source, full.code, options)) return full
  // ADR-0030 amendment 2: add top-level statements one at a time, keeping those that verify
  const parsed = parse(source)
  if (parsed._tag === "Failure") return { code: source, notes: full.notes }
  const body: Array<Node> = parsed.program.body
  const enabled = new Set<number>()
  const failed: Array<ConvertNote> = []
  let best: ConvertResult = { code: source, notes: [] }
  body.forEach((statement, i) => {
    const attempt = convert(source, options, new Set(), new Set([...enabled, i]))
    if (attempt.code === best.code) return
    if (compilesBack(source, attempt.code, options)) {
      enabled.add(i)
      best = attempt
    } else {
      failed.push({
        start: statement.start,
        end: statement.end,
        message: "This statement stays TypeScript: its conversion doesn't compile back to the same code (ADR-0030)"
      })
    }
  })
  return { code: best.code, notes: [...best.notes, ...failed] }
}

const binderNames = new Set(["defect", "error"])

/** Whether a generated binder name is also used by another identifier (see `ReverseCtx.binders`). */
const bindersClash = (program: Node, binders: ReadonlySet<Node>): boolean => {
  const used = new Set([...binders].map((b) => b.name as string))
  let clash = false
  const visit = (node: Node): void => {
    if (node.type === "Identifier" && binderNames.has(node.name) && used.has(node.name) && !binders.has(node)) {
      clash = true
    }
    for (const child of children(node)) visit(child)
  }
  if (used.size > 0) visit(program)
  return clash
}

/** One conversion; with `only`, top-level statements outside it are left as written. */
const convert = (
  source: string,
  options: ConvertOptions,
  disabled: ReadonlySet<"try" | "main">,
  only: ReadonlySet<number> | undefined
): ConvertResult => {
  const parsed = parse(source)
  if (parsed._tag === "Failure") {
    return { code: source, notes: parsed.diagnostics.map((d) => ({ start: d.start, end: d.end, message: d.message })) }
  }
  const analysis = analyze(parsed.program)
  const ctx: ReverseCtx = {
    source,
    s: new MagicString(source),
    analysis,
    // the forward compiler honors `// @efx no-ambient` in the leading comments
    options: {
      ...resolveOptions(options),
      ...(/^\s*\/\/\s*@efx\s+no-ambient\b/m.test(leadingComments(source)) ? { ambient: false } : {})
    },
    comments: parsed.comments,
    effect: importedLocal(analysis, "effect", "Effect"),
    schema: importedLocal(analysis, "effect", "Schema"),
    layer: importedLocal(analysis, "effect", "Layer"),
    errors: new Set(),
    effectCandidates: new Set(),
    effects: new Set(),
    notes: [],
    topics: false,
    deferAllowed: false,
    binders: new Set(),
    disabled,
    telemetryDirective: false,
    namespace: "Effect",
    service: undefined,
    testIt: undefined,
    only
  }
  // nothing to re-sugar without an import from `effect`, its subpaths or `@effect/*`
  const imports = (parsed.program.body as Array<Node>).some((s) =>
    s.type === "ImportDeclaration" && /^(effect(\/|$)|@effect\/)/.test(s.source.value)
  )
  if (!imports) return { code: source, notes: [] }
  const enabled = (i: number) => only === undefined || only.has(i)
  // classes first: bodies need to know which classes become `error` declarations
  for (const [i, top] of (parsed.program.body as Array<Node>).entries()) {
    const statement: Node = top.type === "ExportNamedDeclaration" && top.declaration !== null ? top.declaration : top
    if (statement.type === "ClassDeclaration" && enabled(i)) {
      const shape = classShape(ctx, statement, false)
      if (shape?.keyword === "error") ctx.errors.add(shape.name)
    }
  }
  // pipe-less `effect` declarations (the forward `localEffects`): every candidate feeds the
  // floating-effect blocker, then the ones that convert are known before any pipe is converted
  const statements = (parsed.program.body as Array<Node>).map((top) =>
    top.type === "ExportNamedDeclaration" && top.declaration !== null ? top.declaration : top
  )
  for (const statement of statements) {
    const name = effectDeclarationName(ctx, statement, false)
    if (name !== undefined) ctx.effectCandidates.add(name)
  }
  for (const [i, statement] of statements.entries()) {
    const name = enabled(i) ? effectDeclarationName(ctx, statement, true) : undefined
    if (name !== undefined) ctx.effects.add(name)
  }
  ctx.topics = topicsRoundTrip(ctx)
  // `export default class` has no declaration spelling (`export default schema` doesn't parse)
  const topLevel = new Set(
    (parsed.program.body as Array<Node>).flatMap((
      top
    ) => [top, top.type === "ExportNamedDeclaration" ? top.declaration : top])
  )
  visitProgram(
    ctx,
    parsed.program,
    makeVisit(
      ctx,
      (cls, visit) =>
        topLevel.has(cls) &&
        (convertService(ctx, cls, visit) || convertHttpApi(ctx, cls) || convertClass(ctx, cls, visit))
    )
  )
  if (bindersClash(parsed.program, ctx.binders)) return convert(source, options, new Set([...disabled, "try"]), only)
  if (!ctx.s.hasChanged()) return { code: source, notes: ctx.notes }
  const code = applyPrelude(ctx.s.toString(), options, source)
  // a telemetry directive must end up leading (after the imports above it went)
  if (ctx.telemetryDirective) {
    const found = directive.exec(code)
    if (found === null || found.index >= leadingComments(code).length) {
      return convert(source, options, new Set([...disabled, "main"]), only)
    }
  }
  return { code, notes: ctx.notes }
}
