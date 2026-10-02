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
import { effectDeclarationName } from "./blockers.ts"
import { classShape, convertClass } from "./classes.ts"
import type { ConvertNote, ConvertOptions, ReverseCtx } from "./context.ts"
import { makeVisit, visitProgram } from "./effects.ts"
import { applyPrelude } from "./imports.ts"
import { importedLocal } from "./origin.ts"
import { topicsRoundTrip } from "./pipes.ts"

export type { ConvertNote, ConvertOptions } from "./context.ts"

/**
 * @since 4.0.0
 * @category models
 */
export interface ConvertResult {
  readonly code: string
  /** Near misses that were left as TypeScript and why, plus `canonicalized: …` notes. */
  readonly notes: ReadonlyArray<ConvertNote>
}

/**
 * Converts idiomatic Effect TypeScript to EffectScript.
 *
 * @since 4.0.0
 * @category reverse
 */
export const toEffectScript = (source: string, options: ConvertOptions = {}): ConvertResult =>
  convert(source, options, false)

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

const convert = (source: string, options: ConvertOptions, tryDisabled: boolean): ConvertResult => {
  const parsed = parse(source)
  if (parsed._tag === "Failure") {
    return { code: source, notes: parsed.diagnostics.map((d) => ({ start: d.start, end: d.end, message: d.message })) }
  }
  const analysis = analyze(parsed.program)
  const ctx: ReverseCtx = {
    source,
    s: new MagicString(source),
    analysis,
    options: resolveOptions(options),
    comments: parsed.comments,
    effect: importedLocal(analysis, "effect", "Effect"),
    schema: importedLocal(analysis, "effect", "Schema"),
    errors: new Set(),
    effectCandidates: new Set(),
    effects: new Set(),
    notes: [],
    topics: false,
    deferAllowed: false,
    binders: new Set(),
    tryDisabled
  }
  if (ctx.effect === undefined && ctx.schema === undefined) return { code: source, notes: [] }
  // classes first: bodies need to know which classes become `error` declarations
  for (const top of parsed.program.body as Array<Node>) {
    const statement: Node = top.type === "ExportNamedDeclaration" && top.declaration !== null ? top.declaration : top
    if (statement.type === "ClassDeclaration") {
      const shape = classShape(ctx, statement, false)
      if (shape?.keyword === "error") ctx.errors.add(shape.name)
    }
  }
  // pipe-less `effect` declarations (the forward `localEffects`): every candidate feeds the
  // floating-effect blocker, then the ones that convert are known before any pipe is converted
  const statements = (parsed.program.body as Array<Node>).map((top) =>
    top.type === "ExportNamedDeclaration" && top.declaration !== null ? top.declaration : top
  )
  const loose = { effect: ctx.effect, effectCandidates: new Set<string>() }
  for (const statement of statements) {
    const name = effectDeclarationName(loose, statement, false)
    if (name !== undefined) ctx.effectCandidates.add(name)
  }
  for (const statement of statements) {
    const name = effectDeclarationName(ctx, statement, true)
    if (name !== undefined) ctx.effects.add(name)
  }
  ctx.topics = topicsRoundTrip(ctx)
  const topLevel = new Set((parsed.program.body as Array<Node>).flatMap((top) => [top, top.declaration]))
  visitProgram(ctx, parsed.program, makeVisit(ctx, (cls) => topLevel.has(cls) && convertClass(ctx, cls)))
  if (bindersClash(parsed.program, ctx.binders)) return convert(source, options, true)
  if (!ctx.s.hasChanged()) return { code: source, notes: ctx.notes }
  return { code: applyPrelude(ctx.s.toString(), options), notes: ctx.notes }
}
