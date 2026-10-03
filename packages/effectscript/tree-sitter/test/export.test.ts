import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { generateOnce } from "./utils/generate.ts"

const root = path.join(import.meta.dirname, "..")
const cli = path.join(root, "node_modules/.bin/tree-sitter")
const work = fs.mkdtempSync(path.join(os.tmpdir(), "efx-ts-export-"))
afterAll(() => fs.rmSync(work, { recursive: true, force: true }))

describe("the publishable grammar repository (Plan 19 Task 6, ADR-0058)", () => {
  it("holds the generated parser and queries, and builds and parses on its own", async () => {
    await generateOnce()
    const out = path.join(work, "tree-sitter-effectscript")
    const exported = spawnSync(process.execPath, [path.join(root, "scripts/export.mjs"), "--out", out, "--git"], {
      encoding: "utf8"
    })
    expect(exported.stderr).toBe("")
    expect(exported.stdout.trim()).toMatch(/^[0-9a-f]{40}$/)
    for (
      const file of ["src/parser.c", "src/scanner.c", "src/scanner.h", "queries/highlights.scm", "LICENSE", "README.md"]
    ) {
      expect(fs.existsSync(path.join(out, file)), file).toBe(true)
    }
    expect(fs.existsSync(path.join(out, "node_modules"))).toBe(false)
    expect(fs.existsSync(path.join(out, "queries/src"))).toBe(false)
    // a clean checkout needs only a C compiler: no npm install, no generate
    const env = { ...process.env, TREE_SITTER_LIBDIR: path.join(work, "cache") }
    const sample = path.join(root, "../core/test/fixtures/service/basic.efx")
    const parsed = spawnSync(cli, ["parse", "-q", "-p", out, sample], { cwd: work, encoding: "utf8", env })
    expect(parsed.stdout + parsed.stderr).not.toMatch(/ERROR|MISSING/)
    expect(parsed.status).toBe(0)
  }, 600_000)

  it("keeps an existing clone's history, and replaces only its files (review I8)", async () => {
    await generateOnce()
    const out = path.join(work, "clone")
    const export_ = () =>
      spawnSync(process.execPath, [path.join(root, "scripts/export.mjs"), "--out", out, "--git"], { encoding: "utf8" })
    const first = export_().stdout.trim()
    fs.writeFileSync(path.join(out, "stale.txt"), "from an older release\n")
    const second = spawnSync(process.execPath, [path.join(root, "scripts/export.mjs"), "--out", out, "--git"], {
      encoding: "utf8"
    })
    // the export is unchanged: nothing new to commit, and the same commit is reported
    expect(second.stderr).toBe("")
    expect(second.stdout.trim()).toBe(first)
    const log = spawnSync("git", ["log", "--format=%H"], { cwd: out, encoding: "utf8" }).stdout
    expect(log).toContain(first)
    expect(fs.existsSync(path.join(out, "stale.txt"))).toBe(false)
  }, 600_000)
})
