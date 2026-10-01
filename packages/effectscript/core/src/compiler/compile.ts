/**
 * @since 0.1.0
 */
import { MagicString } from "magic-string"
import { analyze } from "./analyze/scope.ts"
import type { Ctx } from "./context.ts"
import { type Diagnostic, diagnosticError, diagnosticWarning } from "./diagnostics.ts"
import { emitImports, makeImportSet } from "./imports.ts"
import { fullFeatures, toCodeMappings } from "./mappings.ts"
import {
  type CompileOptions,
  type CompileResult,
  type ResolvedOptions,
  resolveOptions,
  type SourceMapV3
} from "./options.ts"
import { looksLikeJsx, type Mode, parse } from "./parser/parse.ts"
import { handlers } from "./transform/registry.ts"
import { walk } from "./walk.ts"

/**
 * Compiles EffectScript (`.efx`) to idiomatic Effect TypeScript.
 *
 * @since 0.1.0
 * @category compiler
 */
export const toTypeScript = (source: string, options: CompileOptions = {}): CompileResult => {
  const resolved = withDirectives(resolveOptions(options), source)
  const result = compileOnce(source, resolved)
  const parseError = result.diagnostics.find((d) => d.code === "EFX1001")
  const final = !resolved.recover || parseError === undefined ? result : recover(source, resolved, parseError)
  const diagnostics = [...final.diagnostics, ...headerDiagnostics(source, resolved)]
  return {
    ...final,
    // strict mode promotes warnings to errors (ADR-0028)
    diagnostics: resolved.strict ? diagnostics.map((d) => ({ ...d, severity: "error" as const })) : diagnostics
  }
}

const directive = (source: string, name: string): boolean =>
  new RegExp(`^\\s*\\/\\/\\s*@efx\\s+${name}\\b`, "m").test(source)

/** `// @efx no-prelude`, `// @efx no-ambient`, `// @efx strict` (ADR-0017). */
const withDirectives = (options: ResolvedOptions, source: string): ResolvedOptions => ({
  ...options,
  prelude: options.prelude && !directive(source, "no-prelude"),
  ambient: options.ambient && !directive(source, "no-ambient"),
  strict: options.strict || directive(source, "strict")
})

/** EFX1003: a `// @effect X.Y` header that disagrees with the installed `effect` (§7.6). */
const headerDiagnostics = (source: string, options: ResolvedOptions): Array<Diagnostic> => {
  const header = /^\s*\/\/\s*@effect\s+(\d+)\.(\d+)/m.exec(source)
  const installed = /^(\d+)\.(\d+)/.exec(options.effectVersion ?? "")
  if (header === null || installed === null) return []
  if (header[1] === installed[1] && header[2] === installed[2]) return []
  const start = header.index + header[0].indexOf("@effect")
  return [
    diagnosticWarning(
      "EFX1003",
      `This file targets effect ${header[1]}.${header[2]}, but effect ${installed[1]}.${installed[2]} is installed`,
      start,
      header.index + header[0].length,
      "update the header or the installed effect"
    )
  ]
}

/** Line ranges around the error, in the order ADR-0020 tries them. */
const candidates = (source: string, offset: number): Array<readonly [number, number]> => {
  const starts = [0]
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) starts.push(i + 1)
  let line = 0
  while (line + 1 < starts.length && starts[line + 1]! <= offset) line++
  const range = (from: number, to: number): readonly [number, number] => {
    const start = starts[Math.max(0, from)]!
    const end = to + 1 < starts.length ? starts[to + 1]! - 1 : source.length
    return [start, end]
  }
  return [range(line, line), range(line - 1, line - 1), range(line - 1, line), range(line, line + 1)]
}

const recover = (source: string, resolved: ResolvedOptions, parseError: Diagnostic): CompileResult => {
  for (const [start, end] of candidates(source, parseError.start)) {
    if (end <= start) continue
    const original = source.slice(start, end)
    const blank = original.replace(/[^\n]/g, " ")
    // keep the file's mode when the neutralized region holds its only JSX (review I8)
    const mode: Mode | undefined = looksLikeJsx(original) ? "tsx" : undefined
    const result = compileOnce(source.slice(0, start) + blank + source.slice(end), resolved, mode)
    if (result.diagnostics.some((d) => d.code === "EFX1001" || d.code === "EFX1000")) continue
    const mapping = result.mappings.find((m) =>
      m.generatedLengths === undefined && m.sourceOffsets[0]! <= start && start < m.sourceOffsets[0]! + m.lengths[0]!
    )
    if (mapping === undefined) continue
    const at = mapping.generatedOffsets[0]! + (start - mapping.sourceOffsets[0]!)
    if (result.code.slice(at, at + blank.length) !== blank) continue
    const map = result.map === undefined ? undefined : { ...result.map, sourcesContent: [source] }
    return {
      ...result,
      code: result.code.slice(0, at) + original + result.code.slice(at + blank.length),
      map,
      diagnostics: [parseError, ...result.diagnostics],
      recovered: true
    }
  }
  return {
    code: source,
    mode: "ts",
    map: undefined,
    mappings: [{ sourceOffsets: [0], generatedOffsets: [0], lengths: [source.length], data: fullFeatures }],
    diagnostics: [parseError],
    recovered: false
  }
}

const compileOnce = (source: string, resolved: ResolvedOptions, mode?: Mode): CompileResult => {
  const parsed = parse(source, { mode })
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
