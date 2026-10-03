import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { beforeAll, describe, expect, it } from "vitest"

const root = path.join(import.meta.dirname, "..")
const repo = path.join(root, "../../..")
const cli = path.join(root, "node_modules/.bin/tree-sitter")
// compiled parsers go to a cache inside the package, never the user's home
const env = { ...process.env, TREE_SITTER_LIBDIR: path.join(root, ".tree-sitter-cache") }
const run = (args: ReadonlyArray<string>) =>
  spawnSync(cli, [...args], { cwd: root, encoding: "utf8", env, maxBuffer: 1 << 28 })
const typescript = path.join(root, "node_modules/tree-sitter-typescript/typescript")

beforeAll(() => {
  const generated = run(["generate"])
  if (generated.status !== 0) throw new Error(`tree-sitter generate failed:\n${generated.stderr}`)
}, 120_000)

/** Every `.ts` file under `dir`, sorted. */
const tsFiles = (dir: string): Array<string> =>
  (fs.readdirSync(dir, { recursive: true }) as Array<string>)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    .sort()
    .map((f) => path.join(dir, f))

describe("tree-sitter-effectscript (Plan 19, ADR-0058)", () => {
  it("parses TypeScript to the same tree as tree-sitter-typescript (the superset guarantee)", () => {
    const all = tsFiles(path.join(repo, "packages/effect/src"))
    // a spread of the effect sources: every 10th file
    const sample = all.filter((_, i) => i % 10 === 0)
    // where tree-sitter-typescript 0.23 can't parse newer syntax, both grammars are in error
    // recovery, which isn't a contract; everywhere else the trees must be identical
    // (the JSON follows a line per file with errors)
    const summary = JSON.parse(
      /^\{[\s\S]*/m.exec(run(["parse", "-q", "-j", "-p", typescript, ...sample]).stdout)![0]
    ) as {
      readonly parse_summaries: ReadonlyArray<{ readonly file: string; readonly successful: boolean }>
    }
    const clean = summary.parse_summaries.filter((s) => s.successful).map((s) => s.file)
    expect(clean.length).toBeGreaterThan(30)
    const ours = run(["parse", ...clean])
    const theirs = run(["parse", "-p", typescript, ...clean])
    expect(theirs.status, theirs.stderr).toBe(0)
    expect(ours.status, ours.stdout.match(/^.*ERROR.*$/m)?.[0]).toBe(0)
    expect(ours.stdout === theirs.stdout).toBe(true)
  }, 300_000)

  it("parses every .efx file the project ships without errors", () => {
    const efxFiles = (dir: string): Array<string> =>
      (fs.readdirSync(dir, { recursive: true }) as Array<string>)
        .filter((f) => f.endsWith(".efx") && !f.includes("node_modules"))
        .sort()
        .map((f) => path.join(dir, f))
    const packages = path.join(root, "..")
    const files = [
      ...efxFiles(path.join(packages, "core/test/fixtures")),
      ...efxFiles(path.join(packages, "core/src")),
      ...efxFiles(path.join(packages, "examples")),
      ...efxFiles(path.join(packages, "site/src/samples"))
    ]
    expect(files.length).toBeGreaterThan(70)
    const out = run(["parse", "-q", "-j", ...files]).stdout
    const summary = JSON.parse(/^\{[\s\S]*/m.exec(out)![0]) as {
      readonly parse_summaries: ReadonlyArray<{ readonly file: string; readonly successful: boolean }>
    }
    const failed = summary.parse_summaries.filter((s) => !s.successful).map((s) => path.relative(packages, s.file))
    expect(failed).toEqual([])
  }, 300_000)

  it("passes its corpus: each construct's tree, and keywords used as identifiers", () => {
    const result = run(["test"])
    expect(result.stdout).toMatch(/successful parses: (\d+); failed parses: 0/)
    expect(result.status).toBe(0)
  }, 300_000)
})
