/**
 * The playground's hover docs for Effect (ADR-0088): the summary and "When to use" of each export's
 * JSDoc, from Effect's own sources, for every public module of `effect` (the ones the prelude
 * imports). `scripts/content.ts` writes them when the site builds, one file per namespace, which the
 * playground fetches the first time it needs one.
 */
import * as fs from "node:fs"
import * as path from "node:path"

/** The namespaces whose exports are bare builtins, in the prelude's order (`namespaceExports`). */
const bareNamespaces = ["Effect", "Layer", "Schema", "Atom", "Command"]

export interface EffectDoc {
  /** The first paragraphs, up to the first section, example or tag. */
  readonly summary: string
  /** The "When to use" section's first paragraph. */
  readonly when?: string
  readonly category?: string
  /** The site page with this export's examples in EffectScript, when it has any (ADR-0050). */
  readonly examples?: string
}

export interface EffectDocs {
  /** By namespace, then export: `Effect` → `retry`. */
  readonly namespaces: Readonly<Record<string, Readonly<Record<string, EffectDoc>>>>
  /** A bare builtin's qualified name: `retry` → `Effect.retry` (the prelude's order). */
  readonly bare: Readonly<Record<string, string>>
}

const clip = (text: string, max: number) => {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const stop = cut.lastIndexOf(". ")
  return stop > max * 0.5 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}…`
}

/** The documented top-level exports of one module's source, with their JSDoc parts. */
export const summaries = (source: string): Map<string, Omit<EffectDoc, "examples">> => {
  const lines = source.split("\n")
  const out = new Map<string, Omit<EffectDoc, "examples">>()
  // a value's docs win over a same-named type's or namespace's (`Effect.fn` the function, not
  // its `fn` namespace of type helpers)
  const valueLevel = new Set<string>()
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.startsWith("/**")) continue
    let end = i
    while (end < lines.length && !lines[end]!.includes("*/")) end++
    let next = end + 1
    while (next < lines.length && lines[next]!.trim() === "") next++
    const declaration =
      /^export\s+(?:declare\s+)?(const|let|function\*?|class|abstract\s+class|interface|type|namespace)\s+([A-Za-z_$][\w$]*)/
        .exec(lines[next] ?? "")
    const text = lines.slice(i, end + 1).map((l) => l.replace(/^\s*\/?\*{1,2}\/?\s?/, "").replace(/\s*\*\/\s*$/, ""))
    i = end
    if (declaration === null) continue
    const name = declaration[2]!
    const isValue = !/^(interface|type|namespace)$/.test(declaration[1]!)
    if (valueLevel.has(name) || (out.has(name) && !isValue)) continue
    // paragraphs, until a section heading, an example fence or a tag
    const summary: Array<string> = []
    let paragraph: Array<string> = []
    let section: string | undefined
    const sections = new Map<string, Array<string>>()
    const flush = () => {
      if (paragraph.length === 0) return
      const joined = paragraph.join(" ").trim()
      if (section === undefined) summary.push(joined)
      else sections.set(section, [...(sections.get(section) ?? []), joined])
      paragraph = []
    }
    for (const line of text) {
      const heading = /^\*\*(.+?)\*\*/.exec(line.trim())
      if (line.trim().startsWith("@") || line.trim().startsWith("```")) {
        flush()
        if (line.trim().startsWith("@")) break
        section = "code"
      } else if (heading !== null && line.trim() === `**${heading[1]}**`) {
        flush()
        section = heading[1]
      } else if (heading !== null && line.trim().startsWith("**Example**")) {
        flush()
        section = "Example"
      } else if (line.trim() === "") flush()
      // `{@link gen}` and `{@link Schedule | a schedule}` read as code
      else paragraph.push(line.trim().replace(/\{@link(?:code|plain)?\s+([^}|\s]+)[^}]*\}/g, "`$1`"))
    }
    flush()
    const category = /@category\s+(.+)/.exec(text.join("\n"))?.[1]?.trim()
    const when = sections.get("When to use")?.[0]
    if (summary.length === 0) continue
    if (isValue) valueLevel.add(name)
    out.set(name, {
      summary: clip(summary.slice(0, 2).join(" "), 420),
      ...(when === undefined ? {} : { when: clip(when, 300) }),
      ...(category === undefined ? {} : { category })
    })
  }
  return out
}

/** The headings of a generated API page: the exports that have EffectScript examples. */
const exampleAnchors = (page: string): Set<string> => new Set([...page.matchAll(/^## (\S+)$/gm)].map((m) => m[1]!))

/**
 * The docs of every module `effect` exports (its top level, then each public subpath, as its
 * `package.json` lists them), with links to the site's example pages.
 */
export const effectDocs = (effectSource: string, exampleRoot: string): EffectDocs => {
  const namespaces: Record<string, Record<string, EffectDoc>> = {}
  const manifest = JSON.parse(fs.readFileSync(path.join(effectSource, "../package.json"), "utf8")) as {
    readonly exports: Readonly<Record<string, unknown>>
  }
  const subpaths = Object.keys(manifest.exports)
    .filter((key) => /^\.\/[a-z-]+$/.test(key) && key !== "./index" && key !== "./testing")
    .map((key) => key.slice(2))
  const modules = [
    ...fs.readdirSync(effectSource).map((file) => ["", file] as const),
    ...subpaths.flatMap((sub) =>
      fs.existsSync(path.join(effectSource, sub))
        ? fs.readdirSync(path.join(effectSource, sub)).map((file) => [sub, file] as const)
        : []
    )
  ].filter(([, file]) => /^[A-Z][\w]*\.ts$/.test(file))
  for (const [sub, fileName] of modules) {
    const name = fileName.replace(/\.ts$/, "")
    // a name in two places is the top level's, as the prelude imports it
    if (namespaces[name] !== undefined) continue
    const file = path.join(effectSource, sub, fileName)
    const page = path.join(exampleRoot, sub, `${name.toLowerCase()}.md`)
    const anchors = fs.existsSync(page) ? exampleAnchors(fs.readFileSync(page, "utf8")) : new Set<string>()
    const href = `/docs/effect/api/effect/${sub === "" ? "" : `${sub}/`}${name.toLowerCase()}`
    const entries: Record<string, EffectDoc> = (namespaces[name] = {})
    for (const [symbol, doc] of summaries(fs.readFileSync(file, "utf8"))) {
      entries[symbol] = {
        ...doc,
        ...(anchors.has(symbol) ? { examples: `${href}#${symbol.toLowerCase()}` } : {})
      }
    }
  }
  const bare: Record<string, string> = {}
  // the prelude's namespaces, in its order: a free `succeed` is Effect's before Layer's. Their
  // lower-case exports are the builtins; the capitalized ones are types and classes
  for (const namespace of bareNamespaces) {
    for (const name of Object.keys(namespaces[namespace] ?? {})) {
      if (/^[a-z]/.test(name) && bare[name] === undefined) bare[name] = `${namespace}.${name}`
    }
  }
  return { namespaces, bare }
}
