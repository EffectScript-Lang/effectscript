/**
 * Generates `content/` (ADR-0050): the repository's Effect docs and examples in EffectScript.
 * Returns the files instead of writing them, so `--check` and the tests compare without writing.
 *
 * @since 4.0.0
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { type Block, convertBlock, convertMarkdown, jsdocExamples } from "./translate.ts"

/**
 * One example in the parallel corpus.
 *
 * @since 4.0.0
 * @category models
 */
export interface CorpusEntry {
  readonly area: "ai-docs" | "guides" | "api"
  /** The repository path it comes from. */
  readonly source: string
  readonly symbol?: string | undefined
  readonly title?: string | undefined
  readonly ts: string
  readonly efx: string
  readonly changed: boolean
  readonly parsed: boolean
}

const posix = (p: string) => p.split(path.sep).join("/")

/**
 * Opens every generated page: the code is EffectScript, the prose is Effect's own and names the
 * TypeScript forms (ADR-0050).
 *
 * @since 4.0.0
 * @category generate
 */
export const editionNote = [
  "> **EffectScript edition.** The code blocks are Effect's own examples, converted by the",
  "> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is",
  "> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,",
  "> `Effect.fn(\"f\")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,",
  "> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and",
  "> `Effect.log(…)` is `console.log(…)` inside `effect` code.",
  ""
].join("\n")

/** Sorted directory entries (code-unit order, the same on every file system). */
const entries = (dir: string) =>
  fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

const walk = (dir: string, skip: (name: string) => boolean, out: Array<string> = []): Array<string> => {
  for (const entry of entries(dir)) {
    if (skip(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, skip, out)
    else out.push(full)
  }
  return out
}

const entry = (area: CorpusEntry["area"], source: string, block: Block, extra: Partial<CorpusEntry> = {}): CorpusEntry => ({
  area,
  source,
  ...extra,
  ts: block.ts,
  efx: block.efx,
  changed: block.changed,
  parsed: block.parsed
})

/** `packages/tools/ai-docgen`'s title, description and body for an example (here, its EffectScript). */
const metadata = (text: string, file: string) => {
  const name = path.basename(file).replace(/\.[^.]+$/, "")
  let title = name.replace(/^\d+/g, "").replace(/[-_]/g, " ").trim()
  title = title.charAt(0).toUpperCase() + title.slice(1)
  let content = text
  const docString = text.indexOf("/**")
  if (docString === -1) return { name, title, description: undefined, content }
  const lines = text.slice(docString).split("\n")
  let description = ""
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!
    if (!line.startsWith(" *")) break
    if (line.endsWith(" */")) {
      content = lines.slice(i + 1).join("\n").trim()
      break
    }
    const lineContent = line.replace(/^ \*\s?/, "")
    if (lineContent.startsWith("@title")) {
      title = lineContent.replace("@title", "").trim()
      continue
    }
    description += `${lineContent}\n`
  }
  return { name, title, description: description.trim() || undefined, content }
}

/** `ai-docs/src`: each example as `.efx`, each `index.md` with EffectScript fences, and `LLMS.efx.md`. */
const aiDocs = (repo: string, out: Map<string, string>, corpus: Array<CorpusEntry>) => {
  const root = path.join(repo, "ai-docs/src")
  const efxOf = new Map<string, string>()
  for (const file of walk(root, (name) => name === "fixtures")) {
    const relative = posix(path.relative(root, file))
    const source = posix(path.relative(repo, file))
    if (/\.tsx?$/.test(file)) {
      const block = convertBlock(fs.readFileSync(file, "utf8"), path.basename(file))
      efxOf.set(file, block.efx)
      out.set(`ai-docs/${relative.replace(/\.tsx?$/, ".efx")}`, block.efx)
      corpus.push(entry("ai-docs", source, block))
    } else if (file.endsWith(".md")) {
      const converted = convertMarkdown(fs.readFileSync(file, "utf8"))
      out.set(`ai-docs/${relative}`, converted.markdown)
      for (const block of converted.blocks) corpus.push(entry("ai-docs", source, block))
    }
  }
  // the `ai-docgen` layout over the EffectScript
  const directory = (dir: string): string => {
    const index = path.join(dir, "index.md")
    const indexMd = fs.existsSync(index) ? out.get(`ai-docs/${posix(path.relative(root, index))}`)!.trim() : null
    const all = entries(dir)
    const hasInline = all.some((e) => e.name.startsWith("0") && /\.tsx?$/.test(e.name))
    const parts: Array<string> = []
    for (const e of all) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name !== "fixtures") parts.push(`${directory(full)}\n`)
        continue
      }
      if (!/\.tsx?$/.test(e.name)) continue
      const meta = metadata(efxOf.get(full)!, full)
      if (meta.name.startsWith("0")) {
        parts.push(`### ${meta.title}\n\n${meta.description ?? ""}\n\n\`\`\`efx\n${meta.content}\n\`\`\`\n`)
        continue
      }
      const link = `[${meta.title}](./ai-docs/${posix(path.relative(root, full)).replace(/\.tsx?$/, ".efx")})`
      let content = hasInline && meta.name.startsWith("10") ? "### More examples\n\n" : ""
      content += `- **${link}**`
      if (meta.description !== undefined) {
        content += meta.description.includes("\n")
          ? `:\n${meta.description.split("\n").map((line) => `  ${line}`).join("\n")}`
          : `: ${meta.description}`
      }
      parts.push(content)
    }
    const body = parts.filter((s) => s.trim() !== "").join("\n").trim()
    return indexMd !== null ? `${indexMd}\n\n${body}` : body
  }
  out.set("LLMS.efx.md", `${editionNote}\n${directory(root)}\n`)
}

/** Package READMEs, `packages/effect/*.md` and the migration guides, with EffectScript fences. */
const guides = (repo: string, out: Map<string, string>, corpus: Array<CorpusEntry>) => {
  const skip = (name: string) => ["node_modules", "dist", "effectscript", "build", ".git"].includes(name)
  const files = [
    ...walk(path.join(repo, "packages"), skip).filter((f) => path.basename(f) === "README.md"),
    ...entries(path.join(repo, "packages/effect")).filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "README.md" && e.name !== "CHANGELOG.md")
      .map((e) => path.join(repo, "packages/effect", e.name)),
    ...entries(path.join(repo, "migration")).filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => path.join(repo, "migration", e.name))
  ].sort()
  for (const file of files) {
    const source = posix(path.relative(repo, file))
    const converted = convertMarkdown(fs.readFileSync(file, "utf8"))
    if (converted.blocks.length === 0) continue
    out.set(`guides/${source}`, `${editionNote}\n${converted.markdown}`)
    for (const block of converted.blocks) corpus.push(entry("guides", source, block))
  }
}

/** Every package's JSDoc examples, per module. */
const api = (repo: string, out: Map<string, string>, corpus: Array<CorpusEntry>) => {
  const skip = (name: string) => ["node_modules", "dist", "effectscript", "tools", "build", "test", ".git"].includes(name)
  const manifests = walk(path.join(repo, "packages"), skip).filter((f) => path.basename(f) === "package.json")
  for (const manifest of manifests) {
    const dir = path.dirname(manifest)
    const src = path.join(dir, "src")
    if (!fs.existsSync(src)) continue
    const name: string = JSON.parse(fs.readFileSync(manifest, "utf8")).name
    for (const file of walk(src, (n) => n === "internal").filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))) {
      const examples = jsdocExamples(fs.readFileSync(file, "utf8"))
      if (examples.length === 0) continue
      const source = posix(path.relative(repo, file))
      const module = posix(path.relative(src, file)).replace(/\.ts$/, "")
      const sections: Array<string> = [
        `# ${name}/${module}`,
        "",
        `The examples in the JSDoc of \`${source}\`, in EffectScript (ADR-0050).`,
        "",
        editionNote.trimEnd()
      ]
      let current: string | undefined | null = null
      for (const example of examples) {
        const block = convertBlock(example.code)
        corpus.push(entry("api", source, block, { symbol: example.symbol, title: example.title }))
        if (example.symbol !== current) {
          current = example.symbol
          sections.push("", `## ${example.symbol ?? "Module"}`)
        }
        if (example.title !== undefined) sections.push("", `**${example.title}**`)
        sections.push("", `\`\`\`${block.parsed ? "efx" : "ts"}`, block.efx.replace(/\n$/, ""), "```")
      }
      out.set(`api/${name}/${module}.md`, `${sections.join("\n")}\n`)
    }
  }
}

/**
 * Everything under `content/`, by path.
 *
 * @since 4.0.0
 * @category generate
 */
export const generate = (repo: string): Map<string, string> => {
  const out = new Map<string, string>()
  const corpus: Array<CorpusEntry> = []
  aiDocs(repo, out, corpus)
  guides(repo, out, corpus)
  api(repo, out, corpus)
  out.set("corpus.jsonl", corpus.map((e) => JSON.stringify(e)).join("\n") + "\n")
  return new Map([...out].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/**
 * How `dir` differs from `files`: changed, missing and extra files, by path.
 *
 * @since 4.0.0
 * @category generate
 */
export const drift = (files: ReadonlyMap<string, string>, dir: string): Array<string> => {
  const existing = fs.existsSync(dir) ? walk(dir, () => false).map((f) => posix(path.relative(dir, f))) : []
  const problems: Array<readonly [string, string]> = []
  for (const [file, text] of files) {
    const full = path.join(dir, file)
    if (!fs.existsSync(full)) problems.push([file, "missing"])
    else if (fs.readFileSync(full, "utf8") !== text) problems.push([file, "changed"])
  }
  for (const file of existing) if (!files.has(file)) problems.push([file, "not generated"])
  return problems.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([file, problem]) => `${file}: ${problem}`)
}
