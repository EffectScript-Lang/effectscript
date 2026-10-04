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
import { signalColours, signalRanges } from "./signals.ts"

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

/**
 * Splits each token at the signal ranges (`signals.ts`) and recolours the parts inside them: the
 * return type Pass, `throws` Fail, `needs` Need, as the Blume theme will (ADR-0078).
 */
const withSignals = (lines: Array<Array<ThemedToken>>, code: string): Array<Array<ThemedToken>> => {
  const ranges = signalRanges(code, "efx")
  if (ranges.length === 0) return lines
  let offset = 0
  return lines.map((line) => {
    const out: Array<ThemedToken> = []
    for (const token of line) {
      const start = offset
      const end = offset + token.content.length
      // the boundaries inside this token, where a signal range starts or ends
      const cuts = [start, end, ...ranges.flatMap((r) => [r.start, r.end]).filter((x) => x > start && x < end)]
        .sort((a, b) => a - b)
      for (let i = 0; i + 1 < cuts.length; i++) {
        const [from, to] = [cuts[i]!, cuts[i + 1]!]
        if (from === to) continue
        const signal = ranges.find((r) => r.start <= from && to <= r.end)?.signal
        out.push({
          ...token,
          content: token.content.slice(from - start, to - start),
          ...(signal === undefined ? {} : { color: signalColours[signal] })
        })
      }
      offset = end
    }
    offset += 1
    return out
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
    return withSignals(tokens, code.replace(/\n$/, ""))
      .map((line) =>
        `<span class="line">${
          line.map((t) =>
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
