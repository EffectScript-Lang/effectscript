/**
 * Translating Effect's docs to EffectScript (ADR-0050): code blocks through the reverse compiler,
 * markdown fences, and JSDoc examples. Pure, so the generator and its tests share it.
 *
 * @since 4.0.0
 */
import { parse, toEffectScript } from "effectscript/compiler"
import ts from "typescript"

/**
 * @since 4.0.0
 * @category models
 */
export interface Block {
  readonly ts: string
  /** The EffectScript; equal to `ts` when nothing re-sugars or the code doesn't parse. */
  readonly efx: string
  /** Whether the reverse compiler re-sugared anything. */
  readonly changed: boolean
  /** Whether the code parses: only then is it EffectScript (the superset, ADR-0030). */
  readonly parsed: boolean
}

/**
 * Converts one code block. `toEffectScript` keeps the ADR-0030 contract: the result compiles back
 * to `code`.
 *
 * @since 4.0.0
 * @category translate
 */
export const convertBlock = (code: string, filename = "example.ts"): Block => {
  const parsed = parse(code, { mode: filename.endsWith(".tsx") ? "tsx" : undefined })._tag === "Success"
  if (!parsed) return { ts: code, efx: code, changed: false, parsed }
  const efx = toEffectScript(code, { filename }).code
  return { ts: code, efx, changed: efx !== code, parsed }
}

const fenceOpen = /^( *)(`{3,}|~{3,})(ts|typescript|tsx)\b([^\n]*)$/

/**
 * Rewrites the TypeScript fences of a markdown document as `efx` fences (code that doesn't parse
 * stays `ts`). Everything outside those fences is kept byte for byte.
 *
 * @since 4.0.0
 * @category translate
 */
export const convertMarkdown = (markdown: string): { readonly markdown: string; readonly blocks: Array<Block> } => {
  const lines = markdown.split("\n")
  const out: Array<string> = []
  const blocks: Array<Block> = []
  for (let i = 0; i < lines.length; i++) {
    const open = fenceOpen.exec(lines[i]!)
    if (open === null) {
      out.push(lines[i]!)
      continue
    }
    const [, indent, marker, language, info] = open
    const close = lines.findIndex((line, j) =>
      j > i && line.startsWith(indent!) && line.slice(indent!.length).trimEnd() === marker
    )
    if (close === -1) {
      out.push(lines[i]!)
      continue
    }
    const body = lines.slice(i + 1, close).map((line) => (line.startsWith(indent!) ? line.slice(indent!.length) : line))
    const block = convertBlock(`${body.join("\n")}\n`, language === "tsx" ? "example.tsx" : "example.ts")
    blocks.push(block)
    out.push(`${indent}${marker}${block.parsed ? "efx" : language}${info}`)
    for (const line of block.efx.replace(/\n$/, "").split("\n")) out.push(line === "" ? "" : `${indent}${line}`)
    out.push(lines[close]!)
    i = close
  }
  return { markdown: out.join("\n"), blocks }
}

/**
 * @since 4.0.0
 * @category models
 */
export interface JsdocExample {
  /** The documented symbol, namespace-qualified; `undefined` for a module's own comment. */
  readonly symbol: string | undefined
  /** From a `**Example** (Title)` line before the fence. */
  readonly title: string | undefined
  readonly code: string
  /** The 1-based line of the opening fence. */
  readonly line: number
}

const declaration = /^\s*export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|interface|type|namespace|enum)\s+([A-Za-z_$][\w$]*)/

/**
 * The code fences in a module's JSDoc comments, with the symbol each comment documents.
 *
 * @since 4.0.0
 * @category translate
 */
export const jsdocExamples = (source: string): Array<JsdocExample> => {
  const lines = source.split("\n")
  const examples: Array<JsdocExample> = []
  // the enclosing `export namespace X {` blocks, by indentation
  const namespaces: Array<{ readonly name: string; readonly indent: number }> = []
  let seenDeclaration = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const indent = line.length - line.trimStart().length
    while (namespaces.length > 0 && line.trim() === "}" && indent === namespaces.at(-1)!.indent) {
      namespaces.pop()
    }
    const opens = /^\s*export\s+(?:declare\s+)?namespace\s+([\w$]+)\s*\{\s*$/.exec(line)
    if (opens !== null) namespaces.push({ name: opens[1]!, indent })
    if (declaration.test(line) || /^\s*(?:import|export)\b/.test(line)) seenDeclaration = true
    if (!/^\s*\/\*\*/.test(line)) continue
    // a JSDoc comment: collect its lines and the fences inside
    let end = i
    while (end < lines.length && !lines[end]!.includes("*/")) end++
    const comment = lines.slice(i, end + 1).map((l) => l.replace(/^\s*\/?\*{1,2}\/?\s?/, "").replace(/\s*\*\/\s*$/, ""))
    let next = end + 1
    while (next < lines.length && lines[next]!.trim() === "") next++
    const documented = declaration.exec(lines[next] ?? "")?.[1]
    const symbol = documented === undefined
      ? undefined
      : [...namespaces.map((n) => n.name), documented].join(".")
    const moduleComment = !seenDeclaration && documented === undefined
    let title: string | undefined
    for (let c = 0; c < comment.length; c++) {
      const text = comment[c]!
      const heading = /^\*\*Example\*\*(?:\s*\((.*)\))?/.exec(text.trim())
      if (heading !== null) title = heading[1]
      const fence = /^(`{3,})(?:ts|typescript|tsx)\b/.exec(text.trim())
      if (fence === null) continue
      const close = comment.findIndex((l, j) => j > c && l.trim() === fence[1])
      if (close === -1) continue
      const body = comment.slice(c + 1, close)
      const margin = Math.min(...body.filter((l) => l.trim() !== "").map((l) => l.length - l.trimStart().length), Infinity)
      examples.push({
        symbol: moduleComment ? undefined : symbol,
        title,
        code: `${body.map((l) => l.slice(Number.isFinite(margin) ? margin : 0)).join("\n")}\n`,
        line: i + c + 1
      })
      title = undefined
      c = close
    }
    i = end
  }
  return examples
}

/**
 * The number of tokens TypeScript's scanner sees (comments and whitespace excluded): a fair
 * measure of how much code there is to read.
 *
 * @since 4.0.0
 * @category translate
 */
export const tokens = (code: string): number => {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, code)
  let count = 0
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) count++
  return count
}
