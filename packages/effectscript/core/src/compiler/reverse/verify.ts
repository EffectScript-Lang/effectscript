/**
 * The conversion-time ADR-0030 check: EffectScript produced by `toEffectScript` must compile back
 * to the input's code tokens (trailing commas aside) and comments, in order.
 *
 * @since 4.0.0
 */
import { toTypeScript } from "../compile.ts"
import { parse } from "../parser/parse.ts"
import type { ConvertOptions } from "./context.ts"

/** Code tokens without trailing commas, and comments, as text; `undefined` when it doesn't parse. */
const shape = (source: string): { readonly tokens: string; readonly comments: string } | undefined => {
  const parsed = parse(source, { tokens: true })
  if (parsed._tag === "Failure") return undefined
  const texts = parsed.tokens.map(([start, end]) => source.slice(start, end))
  const tokens = texts.filter((t, i) => !(t === "," && [")", "]", "}"].includes(texts[i + 1]!)))
  return {
    tokens: tokens.join("\u0000"),
    comments: parsed.comments.map((c) => source.slice(c.start, c.end)).join("\u0000")
  }
}

/**
 * Whether `efx` compiles without errors to code equivalent to `typescript`.
 *
 * @since 4.0.0
 * @category reverse
 */
export const compilesBack = (typescript: string, efx: string, options: ConvertOptions): boolean =>
  verdict(typescript, efx, options) > 0

/**
 * How well `efx` compiles back to `typescript`: 2 = byte for byte, 1 = token- and
 * comment-equivalent, 0 = not at all (or with errors).
 *
 * @since 4.0.0
 * @category reverse
 */
export const verdict = (typescript: string, efx: string, options: ConvertOptions): 0 | 1 | 2 => {
  const result = toTypeScript(efx, options)
  if (result.diagnostics.some((d) => d.severity === "error")) return 0
  if (result.code === typescript) return 2
  const before = shape(typescript)
  const after = shape(result.code)
  return before !== undefined && after !== undefined && before.tokens === after.tokens &&
      before.comments === after.comments
    ? 1
    : 0
}
