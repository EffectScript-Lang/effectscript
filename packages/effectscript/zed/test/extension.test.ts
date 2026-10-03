import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { parse } from "smol-toml"
import { afterAll, describe, expect, it, vi } from "vitest"
import { generateOnce } from "../../tree-sitter/test/utils/generate.ts"

// the grammar is generated and compiled alongside other tests
vi.setConfig({ testTimeout: 120_000 })

const root = path.join(import.meta.dirname, "..")
const grammar = path.join(root, "../tree-sitter")
const languages = path.join(root, "languages/effectscript")
const hasCargo = spawnSync("cargo", ["--version"]).status === 0
const hasWasm = spawnSync("rustup", ["target", "list", "--installed"], { encoding: "utf8" }).stdout?.includes(
  "wasm32-wasip2"
)

describe("the Zed extension (Plan 19 Task 5, ADR-0058)", () => {
  it("declares the EffectScript language, its grammar and the efx language server", () => {
    const manifest = parse(fs.readFileSync(path.join(root, "extension.toml"), "utf8")) as {
      id: string
      version: string
      language_servers: Record<string, { languages: Array<string> }>
      grammars: Record<string, { repository: string }>
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
    expect(manifest.id).toBe("effectscript")
    expect(manifest.version).toBe(pkg.version)
    expect(manifest.language_servers.efx!.languages).toEqual(["EffectScript"])
    expect(manifest.grammars.effectscript!.repository).toBe(
      "https://github.com/EffectScript-Lang/tree-sitter-effectscript"
    )
    const config = parse(fs.readFileSync(path.join(languages, "config.toml"), "utf8")) as Record<string, unknown>
    expect(config).toMatchObject({ name: "EffectScript", grammar: "effectscript", path_suffixes: ["efx"] })
    const cargo = parse(fs.readFileSync(path.join(root, "Cargo.toml"), "utf8")) as { package: { version: string } }
    expect(cargo.package.version).toBe(pkg.version)
  })

  it("uses the grammar's own queries, and every query compiles against the grammar", async () => {
    for (const file of ["highlights.scm", "injections.scm"]) {
      expect(fs.readFileSync(path.join(languages, file), "utf8"), file).toBe(
        fs.readFileSync(path.join(grammar, "queries", file), "utf8")
      )
    }
    const cli = path.join(grammar, "node_modules/.bin/tree-sitter")
    const env = { ...process.env, TREE_SITTER_LIBDIR: path.join(grammar, ".tree-sitter-cache") }
    await generateOnce()
    const sample = path.join(grammar, "../core/test/fixtures/service/basic.efx")
    for (const file of fs.readdirSync(languages).filter((f) => f.endsWith(".scm"))) {
      const query = spawnSync(cli, ["query", path.join(languages, file), sample], {
        cwd: grammar,
        env,
        encoding: "utf8"
      })
      expect(query.status, `${file}: ${query.stderr}`).toBe(0)
    }
    // the outline finds the service and its effects
    const outline = spawnSync(cli, ["query", path.join(languages, "outline.scm"), sample], {
      cwd: grammar,
      env,
      encoding: "utf8"
    }).stdout
    expect(outline).toContain("text: `Users`")
    expect(outline).toContain("text: `find`")
  }, 300_000)

  it.skipIf(!hasCargo)("starts `efx lsp` from the project, else from PATH (cargo test)", () => {
    const result = spawnSync("cargo", ["test", "--quiet"], { cwd: root, encoding: "utf8" })
    expect(result.stdout).toMatch(/3 passed/)
    expect(result.status).toBe(0)
  }, 600_000)

  it.skipIf(!hasCargo || !hasWasm)("builds for Zed (wasm32-wasip2)", () => {
    const result = spawnSync("cargo", ["build", "--release", "--target", "wasm32-wasip2"], {
      cwd: root,
      encoding: "utf8"
    })
    expect(result.status, result.stderr).toBe(0)
  }, 600_000)

  it("builds a dev extension whose grammar is a local repository (scripts/dev.mjs)", async () => {
    await generateOnce()
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "efx-zed-dev-"))
    afterAll(() => fs.rmSync(work, { recursive: true, force: true }))
    const result = spawnSync(process.execPath, [path.join(root, "scripts/dev.mjs"), "--out", work], {
      encoding: "utf8"
    })
    expect(result.stderr).toBe("")
    const extension = result.stdout.trim()
    const manifest = parse(fs.readFileSync(path.join(extension, "extension.toml"), "utf8")) as {
      grammars: { effectscript: { repository: string; rev: string } }
    }
    const grammarRepo = path.join(work, "tree-sitter-effectscript")
    expect(manifest.grammars.effectscript.repository).toBe(`file://${grammarRepo}`)
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: grammarRepo, encoding: "utf8" }).stdout.trim()
    expect(manifest.grammars.effectscript.rev).toBe(head)
    expect(fs.existsSync(path.join(extension, "languages/effectscript/highlights.scm"))).toBe(true)
  }, 600_000)
})
