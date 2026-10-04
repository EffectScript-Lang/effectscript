/**
 * `effectscript/blume-kinds` (spec §4.3): a construct's badge glyph, for the theme's `PageHeader`.
 * It has no Node imports, so it can be bundled into the page.
 *
 * @since 4.0.0
 */

const glyphs: Record<string, { readonly glyph: string; readonly signal?: "fail" | "need" }> = {
  effect: { glyph: "ƒ" },
  error: { glyph: "!", signal: "fail" },
  try: { glyph: "!", signal: "fail" },
  schema: { glyph: "{}" },
  service: { glyph: "◇", signal: "need" },
  layer: { glyph: "◇", signal: "need" },
  config: { glyph: "⚙" },
  cli: { glyph: "$" },
  command: { glyph: "$" },
  pipeline: { glyph: "|>" },
  match: { glyph: "?" },
  main: { glyph: "▶" },
  test: { glyph: "✓" }
}

/**
 * A construct's badge glyph, and its signal for errors and services (ADR-0078).
 *
 * @since 4.0.0
 * @category config
 */
export const kindGlyph = (kind: string): { readonly glyph: string; readonly signal?: "fail" | "need" } =>
  glyphs[kind] ?? { glyph: "·" }
