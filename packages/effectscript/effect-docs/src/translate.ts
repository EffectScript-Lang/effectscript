/**
 * Translating Effect's docs to EffectScript (ADR-0050): code blocks through the reverse compiler,
 * markdown fences, and JSDoc examples. Pure, so the generator and its tests share it.
 *
 * @since 4.0.0
 */
import { parse, toEffectScript } from "effectscript/compiler"
import { compilesBackModuloImports, verdict } from "effectscript/compiler/reverse/verify"
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
  /**
   * Whether the EffectScript compiles back to the TypeScript (ADR-0030). A block that parses can
   * still fail it: EffectScript's automatic imports may resolve a name the original left global
   * (review I2). Only valid blocks are labelled `efx`.
   */
  readonly valid: boolean
}

/**
 * Converts one code block. `toEffectScript` keeps the ADR-0030 contract: the result compiles back
 * to `code`, with imports from the effect index possibly naming module files (ADR-0089).
 *
 * @since 4.0.0
 * @category translate
 */
export const convertBlock = (code: string, filename = "example.ts"): Block => {
  const parsed = parse(code, { mode: filename.endsWith(".tsx") ? "tsx" : undefined })._tag === "Success"
  if (!parsed) return { ts: code, efx: code, changed: false, parsed, valid: false }
  const converted = toEffectScript(code, { filename })
  const efx = converted.code
  // a canonicalized import cleanup compiles back importing module files (ADR-0089)
  const valid = verdict(code, efx, { filename }) > 0 ||
    (converted.notes.some((n) => n.message.startsWith("canonicalized: imports")) &&
      compilesBackModuloImports(code, efx, { filename }))
  // where an `import` the prelude provides was the first line, the reverse compiler leaves a blank
  // one: dropping it can't change the program (Plan 21, as `efx fix` does)
  const shown = /^\s/.test(code) ? efx : efx.replace(/^\n+/, "")
  return valid
    ? { ts: code, efx: shown, changed: shown !== code, parsed, valid }
    : { ts: code, efx: code, changed: false, parsed, valid }
}

// a fence is indented at most three spaces (four is indented code); its language is a whole word
const anyFence = /^( {0,3})(`{3,}|~{3,})([^\n]*)$/
const fenceOpen = /^( {0,3})(`{3,}|~{3,})(ts|typescript|tsx)(?=$|\s|\{)([^\n]*)$/

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
      // any other fence is copied whole: a ts fence inside it is an example of Markdown (Plan 21)
      const other = anyFence.exec(lines[i]!)
      if (other !== null) {
        const [, , marker] = other
        const close = lines.findIndex((line, j) =>
          j > i && new RegExp(`^ {0,3}${marker![0]}{${marker!.length},}\\s*$`).test(line)
        )
        if (close !== -1) {
          out.push(...lines.slice(i, close + 1))
          i = close
          continue
        }
      }
      out.push(lines[i]!)
      continue
    }
    const [, indent, marker, language, info] = open
    // v3 examples (the migration guides) aren't EffectScript's target: they stay as written (review I5)
    let previous = i - 1
    while (previous >= 0 && lines[previous]!.trim() === "") previous--
    const legacy = previous >= 0 && /\bv3\b/i.test(lines[previous]!)
    const close = lines.findIndex((line, j) =>
      j > i && line.startsWith(indent!) && line.slice(indent!.length).trimEnd() === marker
    )
    if (close === -1) {
      out.push(lines[i]!)
      continue
    }
    if (legacy) {
      out.push(...lines.slice(i, close + 1))
      i = close
      continue
    }
    const body = lines.slice(i + 1, close).map((line) => (line.startsWith(indent!) ? line.slice(indent!.length) : line))
    const block = convertBlock(`${body.join("\n")}\n`, language === "tsx" ? "example.tsx" : "example.ts")
    blocks.push(block)
    if (!block.valid) {
      out.push(...lines.slice(i, close + 1))
      i = close
      continue
    }
    out.push(`${indent}${marker}efx${info}`)
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

/**
 * The symbol each JSDoc comment documents, by the line its `/**` is on: from TypeScript's syntax
 * tree, namespace-, interface- and class-qualified, including export specifiers
 * (`export { let_ as let }`) and members of `declare namespace` blocks (review I3). A module's own
 * comment (attached to an import, or tagged `@module`) maps to `undefined`.
 */
const documentedSymbols = (source: string): Map<number, string | undefined> => {
  const file = ts.createSourceFile("module.ts", source, ts.ScriptTarget.Latest, true)
  const symbols = new Map<number, string | undefined>()
  const nameOf = (node: ts.Node): string | undefined => {
    if (ts.isVariableStatement(node)) {
      const first = node.declarationList.declarations[0]
      return first !== undefined && ts.isIdentifier(first.name) ? first.name.text : undefined
    }
    if (ts.isExportSpecifier(node)) return node.name.text
    if (ts.isImportDeclaration(node) || ts.isExpressionStatement(node)) return undefined
    const name = (node as { readonly name?: ts.Node }).name
    return name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isPrivateIdentifier(name))
      ? name.text
      : undefined
  }
  const scopes = (node: ts.Node): string | undefined =>
    ts.isModuleDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node) ||
      ts.isEnumDeclaration(node)
      ? nameOf(node)
      : undefined
  const visit = (node: ts.Node, scope: ReadonlyArray<string>): void => {
    const docs = (node as { readonly jsDoc?: ReadonlyArray<ts.JSDoc> }).jsDoc
    if (docs !== undefined) {
      const name = nameOf(node)
      docs.forEach((doc, index) => {
        const line = file.getLineAndCharacterOfPosition(doc.getStart(file)).line
        const isModule = doc.tags?.some((tag) => tag.tagName.text === "module") === true
        // TypeScript attaches every comment before a node; only the last one documents it
        const documents = index === docs.length - 1 && !isModule && name !== undefined
        symbols.set(line, documents ? [...scope, name].join(".") : undefined)
      })
    }
    const inner = scopes(node)
    ts.forEachChild(node, (child) => visit(child, inner === undefined ? scope : [...scope, inner]))
  }
  visit(file, [])
  return symbols
}

const declaration =
  /^\s*export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|interface|type|namespace|enum)\s+([A-Za-z_$][\w$]*)/

/**
 * The code fences in a module's JSDoc comments, with the symbol each comment documents.
 *
 * @since 4.0.0
 * @category translate
 */
export const jsdocExamples = (source: string): Array<JsdocExample> => {
  const lines = source.split("\n")
  const fromTree = documentedSymbols(source)
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
    // the syntax tree's answer; the line scan is the fallback for code TypeScript can't attach
    const symbol = fromTree.has(i)
      ? fromTree.get(i)
      : documented === undefined
      ? undefined
      : [...namespaces.map((n) => n.name), documented].join(".")
    const moduleComment = !fromTree.has(i) && !seenDeclaration && documented === undefined
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
      const margin = Math.min(
        ...body.filter((l) => l.trim() !== "").map((l) => l.length - l.trimStart().length),
        Infinity
      )
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
  const parsed = parse(code, { tokens: true })
  if (parsed._tag === "Success") return parsed.tokens.length
  // code that doesn't parse: TypeScript's scanner, as an estimate
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, code)
  let count = 0
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) count++
  return count
}
