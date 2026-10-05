/**
 * `pnpm corpus:convert` (ADR-0093): checks every project of `corpus.json` out at its pinned commit
 * (cloning it the first time), converts it, writes each converted file next to its TypeScript in
 * `out/` (gitignored), and `REPORT.md` and `report.json` (numbers only). `--only <name>` converts
 * one project.
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { convertRepo, report, type RepoSummary, summarize, writeSideBySide } from "../src/convert.ts"
import { checkout, type Manifest } from "../src/projects.ts"

const root = path.join(import.meta.dirname, "..")
const outDir = path.join(root, "out")
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : undefined
const reportFile = path.join(root, "report.json")
const config = JSON.parse(fs.readFileSync(path.join(root, "corpus.json"), "utf8")) as Manifest
const names = config.projects.map((p) => p.name)
const previous: Array<RepoSummary> = only !== undefined && fs.existsSync(reportFile)
  ? JSON.parse(fs.readFileSync(reportFile, "utf8"))
  : []

const summaries = new Map(previous.map((s) => [s.name, s]))
for (const project of config.projects) {
  const name = project.name
  if (only !== undefined && name !== only) continue
  const started = performance.now()
  const repo = convertRepo(checkout(project), name, {
    exclude: config.exclude[name]?.globs ?? [],
    onFile: (done, total) => {
      if (done % 200 === 0 || done === total) process.stdout.write(`\r${name}: ${done}/${total} files`)
    }
  })
  fs.rmSync(path.join(outDir, name), { recursive: true, force: true })
  writeSideBySide(outDir, repo)
  const summary = await summarize(repo)
  summaries.set(name, summary)
  process.stdout.write(
    `\r${name}: ${summary.effectFiles} Effect files, ${summary.converted} converted, ${summary.errors} errors (${
      ((performance.now() - started) / 1000).toFixed(1)
    }s)\n`
  )
}
const all = [...summaries.values()].filter((s) => names.includes(s.name)).sort((a, b) => a.name.localeCompare(b.name))
fs.writeFileSync(reportFile, `${JSON.stringify(all, null, 2)}\n`)
fs.writeFileSync(path.join(root, "REPORT.md"), report(all))
process.stdout.write(`wrote REPORT.md and report.json; side by side in ${path.relative(process.cwd(), outDir)}/\n`)
