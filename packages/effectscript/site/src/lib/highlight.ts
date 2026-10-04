/** Build-time highlighting with Shiki and the `source.efx` grammar (ADR-0054), shared by pages. */
import {
  type BundledLanguage,
  createHighlighter,
  type Highlighter,
  type ThemedToken,
  type ThemeRegistration
} from "shiki"
import shellscript from "shiki/langs/shellscript.mjs"
import tsx from "shiki/langs/tsx.mjs"
import typescript from "shiki/langs/typescript.mjs"
import { efxGrammars } from "../playground/grammar.ts"

/**
 * The brand's code colours (brand README: white carries the brand, grays set hierarchy): keywords
 * white, names near-white, strings and punctuation in the zinc grays, comments muted and italic.
 * The landing page's rooms use it; the editor windows keep VS Code's Dark+. The Blume theme's
 * `effectscript-dark` (ADR-0079) replaces it when the site moves, adding the signal colours for
 * return types, `throws` and `needs` (ADR-0078).
 */
export const mono: ThemeRegistration = {
  name: "efx-mono",
  type: "dark",
  colors: { "editor.background": "#0c0c0e", "editor.foreground": "#c8c8ce" },
  tokenColors: [
    { settings: { foreground: "#c8c8ce" } },
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#8e8e96", fontStyle: "italic" } },
    {
      scope: [
        "keyword",
        "storage",
        "storage.type",
        "storage.modifier",
        "keyword.control",
        "keyword.operator.new",
        "keyword.operator.expression",
        "variable.language",
        "constant.language"
      ],
      settings: { foreground: "#ffffff" }
    },
    { scope: ["string", "string.template", "punctuation.definition.string"], settings: { foreground: "#a1a1aa" } },
    { scope: ["constant.numeric"], settings: { foreground: "#e4e4e7" } },
    { scope: ["entity.name.function", "support.function"], settings: { foreground: "#f4f4f5" } },
    {
      scope: ["entity.name.type", "entity.name.class", "support.type", "support.class", "entity.other.inherited-class"],
      settings: { foreground: "#e4e4e7" }
    },
    { scope: ["punctuation", "meta.brace", "keyword.operator"], settings: { foreground: "#8e8e96" } }
  ]
}

let highlighter: Promise<Highlighter> | undefined

/** The signal colours on Ink (ADR-0078): Effect's A, E and R in a signature. */
const signals = { pass: "#4ADE80", fail: "#F87171", need: "#60A5FA" } as const

/** A line that declares a signature: an `effect`, a service method, a tool or a workflow. */
const signature = /^\s*(export\s+)?(effect\*?|tool|workflow)\b|\b(throws|needs)\b/

/**
 * Colours a signature the way the Blume theme will (spec 2026-10-05 §5.2, ADR-0078): the return
 * type Pass, the types after `throws` Fail and the services after `needs` Need. The grammar has no
 * scopes for these clauses yet, so this reads the tokens of one line: a clause runs until `{`,
 * `=`, `=>`, `|>` or the end of the line.
 */
const withSignals = (line: Array<ThemedToken>): Array<ThemedToken> => {
  if (!signature.test(line.map((t) => t.content).join(""))) return line
  let mode: keyof typeof signals | undefined
  let depth = 0
  let previous = ""
  // Shiki merges neighbours of one colour, so a token can hold a whole `find(id: string): User`
  const pieces = line.flatMap((token) =>
    (token.content.match(/\s+|=>|\|>|[A-Za-z_$][\w$.]*|./g) ?? []).map((content) => ({ ...token, content }))
  )
  return pieces.map((token) => {
    const text = token.content.trim()
    let colour: string | undefined
    if (text === "throws") mode = "fail"
    else if (text === "needs") mode = "need"
    else if (text.startsWith(":") && depth === 0 && previous === ")" && mode === undefined) mode = "pass"
    else if (["{", "=", "=>", "|>", "key"].includes(text) || text.startsWith("{")) mode = undefined
    else if (mode !== undefined && /^[A-Za-z_$]/.test(text)) colour = signals[mode]
    for (const char of token.content) depth += char === "(" ? 1 : char === ")" ? -1 : 0
    if (text !== "") previous = text.at(-1)!
    return colour === undefined ? token : { ...token, color: colour }
  })
}

const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

/** HTML lines for `code`: one `<span class="line">` per line, no wrapper, for our windows. */
export const highlight = async (
  code: string,
  language: "ts" | "efx" | "shell",
  theme: "dark-plus" | "mono" = "dark-plus"
): Promise<string> => {
  highlighter ??= createHighlighter({
    themes: ["dark-plus", mono],
    langs: [...tsx, ...typescript, ...shellscript, ...efxGrammars]
  })
  const lang = language === "ts" ? "typescript" : language === "shell" ? "shellscript" : "efx"
  if (theme === "mono" && language === "efx") {
    // `efx` is our own grammar, loaded into this highlighter, so it isn't in Shiki's bundled list
    const { tokens } = (await highlighter).codeToTokens(code.replace(/\n$/, ""), {
      lang: lang as BundledLanguage,
      theme: "efx-mono"
    })
    return tokens
      .map((line) =>
        `<span class="line">${
          withSignals(line).map((t) =>
            `<span style="color:${t.color}${(t.fontStyle ?? 0) & 1 ? ";font-style:italic" : ""}">${
              escape(t.content)
            }</span>`
          ).join("")
        }</span>`
      )
      .join("\n")
  }
  const html = (await highlighter).codeToHtml(code.replace(/\n$/, ""), {
    lang,
    theme: theme === "mono" ? "efx-mono" : "dark-plus"
  })
  return /<code>([\s\S]*)<\/code>/.exec(html)![1]!
}
