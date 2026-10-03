import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { generateOnce } from "./utils/generate.ts"

const root = path.join(import.meta.dirname, "..")
const hasHelix = spawnSync("hx", ["--version"]).status === 0 && spawnSync("script", ["-V"]).error === undefined
const work = fs.mkdtempSync(path.join(os.tmpdir(), "efx-ts-helix-"))
afterAll(() => fs.rmSync(work, { recursive: true, force: true }))

describe.skipIf(!hasHelix)("Helix compiles the grammar and its queries (Plan 19 review I3)", () => {
  it("opens an .efx file without query errors, in a throwaway config", async () => {
    await generateOnce()
    const grammar = path.join(work, "grammar")
    const exported = spawnSync(process.execPath, [path.join(root, "scripts/export.mjs"), "--out", grammar], {
      encoding: "utf8"
    })
    expect(exported.status, exported.stderr).toBe(0)
    const config = path.join(work, "config/helix")
    fs.mkdirSync(path.join(config, "runtime/queries/effectscript"), { recursive: true })
    fs.mkdirSync(path.join(config, "runtime/grammars"), { recursive: true })
    for (const file of ["highlights.scm", "indents.scm"]) {
      fs.copyFileSync(path.join(root, "queries/helix", file), path.join(config, "runtime/queries/effectscript", file))
    }
    fs.writeFileSync(
      path.join(config, "languages.toml"),
      `use-grammars = { only = ["effectscript"] }

[[language]]
name = "effectscript"
scope = "source.efx"
file-types = ["efx"]
roots = []
grammar = "effectscript"

[[grammar]]
name = "effectscript"
source = { path = ${JSON.stringify(grammar)} }
`
    )
    const env = {
      ...process.env,
      HOME: path.join(work, "home"),
      XDG_CONFIG_HOME: path.join(work, "config"),
      XDG_CACHE_HOME: path.join(work, "cache"),
      XDG_DATA_HOME: path.join(work, "data")
    }
    fs.mkdirSync(env.HOME, { recursive: true })
    const built = spawnSync("hx", ["--grammar", "build"], { env, encoding: "utf8" })
    expect(built.status, built.stdout + built.stderr).toBe(0)
    const file = path.join(work, "app.efx")
    fs.copyFileSync(path.join(root, "../core/test/fixtures/service/basic.efx"), file)
    const log = path.join(work, "hx.log")
    // Helix needs a terminal: `script` gives it one, and `:q!` closes it
    const command = `(sleep 3; printf ':q!\\r'; sleep 1) | script -q ${
      process.platform === "darwin" ? `/dev/null hx --log ${log} ${file}` : `-c "hx --log ${log} ${file}" /dev/null`
    }`
    spawnSync("sh", ["-c", command], { env, encoding: "utf8", timeout: 30_000 })
    const written = fs.existsSync(log) ? fs.readFileSync(log, "utf8") : ""
    expect(written).not.toMatch(/Failed to compile/)
  }, 600_000)
})
