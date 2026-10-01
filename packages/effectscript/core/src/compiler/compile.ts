/**
 * @since 0.1.0
 */
import { MagicString } from "magic-string"
import { analyze } from "./analyze/scope.ts"
import type { Ctx } from "./context.ts"
import { diagnosticError } from "./diagnostics.ts"
import { emitImports, makeImportSet } from "./imports.ts"
import { fullFeatures, toCodeMappings } from "./mappings.ts"
import { type CompileOptions, type CompileResult, resolveOptions, type SourceMapV3 } from "./options.ts"
import { parse } from "./parser/parse.ts"
import { handlers } from "./transform/registry.ts"
import { walk } from "./walk.ts"

/**
 * Compiles EffectScript (`.efx`) to idiomatic Effect TypeScript.
 *
 * @since 0.1.0
 * @category compiler
 */
export const toTypeScript = (source: string, options: CompileOptions = {}): CompileResult => {
  const base = resolveOptions(options)
  const resolved = /^\s*\/\/\s*@efx\s+no-prelude\b/m.test(source) ? { ...base, prelude: false } : base
  const parsed = parse(source)
  if (parsed._tag === "Failure") {
    return { code: "", mode: "ts", map: undefined, mappings: [], diagnostics: parsed.diagnostics }
  }
  const s = new MagicString(source)
  const analysis = analyze(parsed.program)
  const ctx: Ctx = {
    source,
    s,
    options: resolved,
    analysis,
    diagnostics: [],
    imports: makeImportSet(),
    handlers,
    refs: new Map(),
    generatedNames: new Set(),
    scope: analysis.module,
    effect: undefined,
    service: undefined,
    namespace: "Effect"
  }
  try {
    walk(parsed.program, undefined, ctx)
    emitImports(ctx)
  } catch (error) {
    // The compiler runs on every keystroke in editors: report, never throw.
    const message = error instanceof Error ? error.message : String(error)
    return {
      code: "",
      mode: parsed.mode,
      map: undefined,
      mappings: [],
      diagnostics: [
        ...ctx.diagnostics,
        diagnosticError("EFX1000", `Internal compiler error: ${message}`, 0, Math.min(1, source.length))
      ]
    }
  }
  const code = s.toString()
  const changed = s.hasChanged()
  const map: SourceMapV3 | undefined = resolved.sourceMap
    ? JSON.parse(s.generateMap({ hires: "boundary", source: resolved.filename, includeContent: true }).toString())
    : undefined
  return {
    code,
    mode: parsed.mode,
    map,
    mappings: changed
      ? toCodeMappings(s, source, code)
      : [{ sourceOffsets: [0], generatedOffsets: [0], lengths: [source.length], data: fullFeatures }],
    diagnostics: ctx.diagnostics
  }
}
