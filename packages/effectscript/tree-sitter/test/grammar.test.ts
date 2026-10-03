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
    // a spread of the effect sources: every 20th file
    const sample = all.filter((_, i) => i % 20 === 0)
    expect(sample.length).toBeGreaterThan(20)
    const ours = run(["parse", ...sample])
    const theirs = run(["parse", "-p", typescript, ...sample])
    // (tree-sitter-typescript 0.23 lacks some newer TypeScript syntax: those files have ERROR nodes
    // in both, and the trees still have to match)
    // the summary lines of files with errors carry timings
    const trees = (out: string) => out.replace(/Parse:\s+[\d.]+ ms\s+\d+ bytes\/ms/g, "Parse:")
    expect(theirs.stdout.length).toBeGreaterThan(1000)
    expect(trees(ours.stdout) === trees(theirs.stdout)).toBe(true)
  }, 300_000)
})
