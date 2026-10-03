/** Build-time highlighting with Shiki and the `source.efx` grammar (ADR-0054), shared by pages. */
import { createHighlighter, type Highlighter } from "shiki"
import shellscript from "shiki/langs/shellscript.mjs"
import tsx from "shiki/langs/tsx.mjs"
import typescript from "shiki/langs/typescript.mjs"
import { efxGrammars } from "../playground/grammar.ts"

let highlighter: Promise<Highlighter> | undefined

/** HTML lines for `code`: one `<span class="line">` per line, no wrapper, for our windows. */
export const highlight = async (code: string, language: "ts" | "efx" | "shell"): Promise<string> => {
  highlighter ??= createHighlighter({
    themes: ["dark-plus"],
    langs: [...tsx, ...typescript, ...shellscript, ...efxGrammars]
  })
  const html = (await highlighter).codeToHtml(code.replace(/\n$/, ""), {
    lang: language === "ts" ? "typescript" : language === "shell" ? "shellscript" : "efx",
    theme: "dark-plus"
  })
  return /<code>([\s\S]*)<\/code>/.exec(html)![1]!
}
