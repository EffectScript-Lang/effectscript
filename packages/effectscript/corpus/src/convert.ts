/**
 * Converts a real Effect project to EffectScript, file by file, and measures it (ADR-0094). The
 * reverse compiler is the one `efx convert` uses: a file comes back as EffectScript where its
 * conversion compiles back to the same code (ADR-0030), and as TypeScript elsewhere, with notes.
 *
 * @since 4.0.0
 */
import { count, vocabularies, type Vocabulary } from "@effectscript/tokens"
import { toEffectScript } from "effectscript/compiler"
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { Worker } from "node:worker_threads"

/**
 * One source file, converted.
 *
 * @since 4.0.0
 * @category models
 */
export interface FileResult {
  readonly path: string
  /** Imports `effect` or an `@effect/` package. */
  readonly effect: boolean
  /** A header says the file is generated; it is reported apart. */
  readonly generated: boolean
  /** The EffectScript differs from the TypeScript. */
  readonly changed: boolean
  /** The reverse compiler threw (a bug, reported with the message). */
  readonly error: string | undefined
  /** Why near matches stayed TypeScript, with names elided. */
  readonly notes: ReadonlyArray<string>
  readonly ts: string
  readonly efx: string
}

/**
 * A project's files, converted, and the commit they came from.
 *
 * @since 4.0.0
 * @category models
 */
export interface RepoResult {
  readonly name: string
  readonly commit: string
  readonly files: ReadonlyArray<FileResult>
}

/** Dependencies, build output, and hidden folders, where projects keep vendored copies (`.repos/effect-smol`). */
const skipped = /(^|\/)(node_modules|dist|build|out|coverage|vendor|\.[^/]+)\//

const isSource = (file: string): boolean =>
  /\.(ts|tsx|mts|cts)$/.test(file) && !/\.d\.[mc]?ts$/.test(file) && !skipped.test(file)

/** A generated file says so in its first lines. */
const isGenerated = (text: string): boolean =>
  /@generated|auto-?generated|this file (is|was) generated|do not edit/i.test(text.slice(0, 600))

const importsEffect = (text: string): boolean => /from\s+["'](effect|@effect\/[^"']+)(\/[^"']*)?["']/.test(text)

/** A note's message without the names in it, so notes group and quote no code. */
export const elide = (message: string): string =>
  message.replace(/`[^`]*`/g, "`…`").replace(/"[^"\n]*"/g, "\"…\"").replace(/'[^'\n]*'/g, "'…'")

const git = (dir: string, ...args: Array<string>): string => {
  const result = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8", maxBuffer: 1 << 28 })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} in ${dir}: ${result.stderr}`)
  return result.stdout
}

/**
 * Converts every tracked TypeScript source file of a project.
 *
 * @since 4.0.0
 * @category convert
 */
export const convertRepo = (
  dir: string,
  name: string,
  options: {
    /** Globs (relative to the project) of files left out, such as vendored or generated code. */
    readonly exclude?: ReadonlyArray<string>
    readonly onFile?: (done: number, total: number) => void
  } = {}
): RepoResult => {
  const commit = git(dir, "rev-parse", "HEAD").trim()
  const excluded = (file: string) => (options.exclude ?? []).some((glob) => path.matchesGlob(file, glob))
  const sources = git(dir, "ls-files", "-z").split("\0").filter((f) => isSource(f) && !excluded(f)).sort()
  const files = sources.map((file, i): FileResult => {
    options.onFile?.(i + 1, sources.length)
    return convertFile(dir, file)
  })
  return { name, commit, files }
}

/**
 * One file, converted.
 *
 * @since 4.0.0
 * @category convert
 */
export const convertFile = (dir: string, file: string): FileResult => {
  const ts = fs.readFileSync(path.join(dir, file), "utf8")
  const base = { path: file, effect: importsEffect(ts), generated: isGenerated(ts), ts }
  if (base.generated || !base.effect) return { ...base, changed: false, error: undefined, notes: [], efx: ts }
  try {
    const result = toEffectScript(ts, { filename: file.replace(/\.[mc]?tsx?$/, ".ts") })
    return {
      ...base,
      changed: result.code !== ts,
      error: undefined,
      notes: result.notes.map((n) => elide(n.message)),
      efx: result.code
    }
  } catch (error) {
    return { ...base, changed: false, error: String(error).split("\n")[0]!, notes: [], efx: ts }
  }
}

/**
 * `convertRepo` over `jobs` worker threads: verification compiles each converted file a few times
 * (ADR-0030), so a large project is CPU-bound. Results are the same, in the same order.
 *
 * @since 4.0.0
 * @category convert
 */
export const convertRepoParallel = async (
  dir: string,
  name: string,
  options: {
    readonly exclude?: ReadonlyArray<string>
    readonly jobs: number
    readonly onFile?: (done: number, total: number) => void
  }
): Promise<RepoResult> => {
  const commit = git(dir, "rev-parse", "HEAD").trim()
  const excluded = (file: string) => (options.exclude ?? []).some((glob) => path.matchesGlob(file, glob))
  const sources = git(dir, "ls-files", "-z").split("\0").filter((f) => isSource(f) && !excluded(f)).sort()
  const chunks = Array.from(
    { length: Math.max(1, Math.min(options.jobs, sources.length)) },
    (_, i) => sources.filter((_, j) => j % options.jobs === i)
  )
  let done = 0
  const results = await Promise.all(chunks.map((files) =>
    new Promise<Array<FileResult>>((resolve, reject) => {
      const worker = new Worker(new URL("./worker.ts", import.meta.url), { workerData: { dir, files } })
      const out: Array<FileResult> = []
      worker.on("message", (result: FileResult) => {
        out.push(result)
        options.onFile?.(++done, sources.length)
      })
      worker.on("error", reject)
      worker.on("exit", (code) => (code === 0 ? resolve(out) : reject(new Error(`worker exited with ${code}`))))
    })
  ))
  const files = results.flat().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return { name, commit, files }
}

/**
 * Writes each converted file next to its TypeScript under `out/<repo>/`.
 *
 * @since 4.0.0
 * @category convert
 */
export const writeSideBySide = (outDir: string, repo: RepoResult): void => {
  for (const file of repo.files) {
    if (!file.effect || file.generated) continue
    const ts = path.join(outDir, repo.name, file.path)
    fs.mkdirSync(path.dirname(ts), { recursive: true })
    fs.writeFileSync(ts, file.ts)
    // an unchanged file is already EffectScript as written: only changed files get an `.efx`
    if (file.changed) fs.writeFileSync(ts.replace(/\.[mc]?tsx?$/, ".efx"), file.efx)
  }
}

/**
 * A project's totals: the Effect files (not generated), and their tokens in every vocabulary.
 *
 * @since 4.0.0
 * @category report
 */
export interface RepoSummary {
  readonly name: string
  readonly commit: string
  readonly sources: number
  readonly generated: number
  readonly effectFiles: number
  readonly converted: number
  readonly errors: number
  readonly tokens: Record<string, { readonly ts: number; readonly efx: number }>
  readonly notes: Record<string, number>
}

const sum = (xs: ReadonlyArray<number>) => xs.reduce((n, x) => n + x, 0)

/**
 * @since 4.0.0
 * @category report
 */
export const summarize = async (
  repo: RepoResult,
  panel: ReadonlyArray<Vocabulary> = vocabularies
): Promise<RepoSummary> => {
  const effect = repo.files.filter((f) => f.effect && !f.generated)
  const tokens: Record<string, { ts: number; efx: number }> = {}
  for (const v of panel) {
    const [ts, efx] = await Promise.all([count(effect.map((f) => f.ts), v), count(effect.map((f) => f.efx), v)])
    tokens[v.id] = { ts: sum(ts), efx: sum(efx) }
  }
  const notes: Record<string, number> = {}
  for (const file of effect) for (const note of new Set(file.notes)) notes[note] = (notes[note] ?? 0) + 1
  return {
    name: repo.name,
    commit: repo.commit,
    sources: repo.files.length,
    generated: repo.files.filter((f) => f.generated).length,
    effectFiles: effect.length,
    converted: effect.filter((f) => f.changed).length,
    errors: effect.filter((f) => f.error !== undefined).length,
    tokens,
    notes
  }
}

const saving = (t: { readonly ts: number; readonly efx: number } | undefined): number | undefined =>
  t === undefined || t.ts === 0 ? undefined : 100 * (1 - t.efx / t.ts)

const saved = (t: { readonly ts: number; readonly efx: number } | undefined) => {
  const s = saving(t)
  return s === undefined ? "–" : `${s.toFixed(1)}%`
}

/** The middle project's saving, so one large project can't stand for all of them. */
const median = (xs: ReadonlyArray<number | undefined>): string => {
  const sorted = xs.filter((x): x is number => x !== undefined).sort((a, b) => a - b)
  if (sorted.length === 0) return "–"
  const mid = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
  return `${value.toFixed(1)}%`
}

/**
 * `REPORT.md`: numbers only, never code (ADR-0094).
 *
 * @since 4.0.0
 * @category report
 */
export const report = (
  summaries: ReadonlyArray<RepoSummary>,
  panel: ReadonlyArray<Vocabulary> = vocabularies
): string => {
  const primary = panel[0]!.id
  const total = (pick: (s: RepoSummary) => number) => sum(summaries.map(pick))
  const totalTokens = (id: string) => ({
    ts: total((s) => s.tokens[id]?.ts ?? 0),
    efx: total((s) => s.tokens[id]?.efx ?? 0)
  })
  const notes = new Map<string, { files: number; repos: number }>()
  for (const s of summaries) {
    for (const [note, files] of Object.entries(s.notes)) {
      // a canonicalized conversion did convert (ADR-0089): it isn't a reason code stays TypeScript
      if (note.startsWith("canonicalized:")) continue
      const entry = notes.get(note) ?? { files: 0, repos: 0 }
      notes.set(note, { files: entry.files + files, repos: entry.repos + 1 })
    }
  }
  const row = (s: RepoSummary) =>
    `| ${s.name} | \`${s.commit.slice(0, 9)}\` | ${s.effectFiles} | ${s.converted} | ${s.errors} | ${
      s.tokens[primary]?.ts ?? 0
    } | ${s.tokens[primary]?.efx ?? 0} | ${saved(s.tokens[primary])} |`
  return [
    "# Real Effect projects in EffectScript: report",
    "",
    "Generated by `pnpm corpus:convert` in `@effectscript/corpus` (ADR-0094). Each project is a",
    "submodule at the commit shown. *Effect files* are tracked `.ts`/`.tsx` sources that import",
    "`effect` or an `@effect/` package, without generated files. A file is *converted* when the",
    "reverse compiler changed it; the rest stay TypeScript, which is valid EffectScript. Tokens are",
    `${primary} tokens (ADR-0093) of the Effect files, before and after. \`corpus.json\` lists what is`,
    "left out of each project (vendored copies, generated code), and why. The median is the middle",
    "project's saving, so the largest projects don't stand for the rest.",
    "",
    "| project | commit | Effect files | converted | errors | TS tokens | EffectScript tokens | saved |",
    "| ------- | ------ | -----------: | --------: | -----: | --------: | ------------------: | ----: |",
    ...summaries.map(row),
    `| **median project** | | | | | | | **${median(summaries.map((s) => saving(s.tokens[primary])))}** |`,
    `| **total** | | **${total((s) => s.effectFiles)}** | **${total((s) => s.converted)}** | **${
      total((s) => s.errors)
    }** | **${totalTokens(primary).ts}** | **${totalTokens(primary).efx}** | **${saved(totalTokens(primary))}** |`,
    "",
    "## Every vocabulary of the panel",
    "",
    "| vocabulary | lab | TS tokens | EffectScript tokens | saved |",
    "| ---------- | --- | --------: | ------------------: | ----: |",
    ...panel.map((v) => {
      const t = totalTokens(v.id)
      return `| ${v.id} | ${v.lab} | ${t.ts} | ${t.efx} | ${saved(t)} |`
    }),
    "",
    "## Why code stays TypeScript",
    "",
    "The reverse compiler's notes, with names elided, by the number of files they occur in. This is",
    "the audit's work list (ADR-0092).",
    "",
    "| files | projects | note |",
    "| ----: | -------: | ---- |",
    ...[...notes].sort((a, b) => b[1].files - a[1].files || a[0].localeCompare(b[0])).map(([note, n]) =>
      `| ${n.files} | ${n.repos} | ${note.replaceAll("|", "\\|")} |`
    ),
    ""
  ].join("\n")
}
