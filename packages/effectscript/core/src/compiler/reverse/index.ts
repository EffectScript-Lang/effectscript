/**
 * `toEffectScript`: idiomatic Effect TypeScript → EffectScript (spec §6). Anything that doesn't
 * match a canonical shape stays TypeScript, which is valid EffectScript. Every rewrite compiles
 * back to its input (ADR-0030).
 *
 * @since 4.0.0
 */
import { MagicString } from "magic-string"
import { analyze } from "../analyze/scope.ts"
import type { Node } from "../ast.ts"
import { resolveOptions } from "../options.ts"
import { parse } from "../parser/parse.ts"
import { classShape, convertClass } from "./classes.ts"
import type { ConvertNote, ConvertOptions, ReverseCtx } from "./context.ts"
import { makeVisit, visitProgram } from "./effects.ts"
import { removePreludeImports } from "./imports.ts"
import { importedLocal, isMember } from "./origin.ts"

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
export const toEffectScript = (source: string, options: ConvertOptions = {}): ConvertResult => {
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
    effects: new Set(),
    notes: []
  }
  if (ctx.effect === undefined && ctx.schema === undefined) return { code: source, notes: [] }
  // classes first: bodies need to know which classes become `error` declarations
  for (const top of parsed.program.body as Array<Node>) {
    const statement: Node = top.type === "ExportNamedDeclaration" && top.declaration !== null ? top.declaration : top
    if (statement.type === "ClassDeclaration") {
      const shape = classShape(ctx, statement, false)
      if (shape?.keyword === "error") ctx.errors.add(shape.name)
    }
    // conservative: any module const initialized by `Effect.fn(…)(…)` without pipes
    const declarator: Node | undefined = statement.type === "VariableDeclaration"
      ? statement.declarations[0]
      : undefined
    const init: Node | undefined = declarator?.init ?? undefined
    if (
      declarator?.id.type === "Identifier" && init?.type === "CallExpression" && init.arguments.length === 1 &&
      init.callee.type === "CallExpression" && isMember(init.callee.callee, ctx.effect, "fn")
    ) {
      ctx.effects.add(declarator.id.name)
    }
  }
  const topLevel = new Set((parsed.program.body as Array<Node>).flatMap((top) => [top, top.declaration]))
  visitProgram(ctx, parsed.program, makeVisit(ctx, (cls) => topLevel.has(cls) && convertClass(ctx, cls)))
  if (!ctx.s.hasChanged()) return { code: source, notes: ctx.notes }
  return { code: removePreludeImports(ctx.s.toString(), options), notes: ctx.notes }
}
