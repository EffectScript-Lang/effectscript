import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { generateOnce } from "./utils/generate.ts"

const root = path.join(import.meta.dirname, "..")
const cli = path.join(root, "node_modules/.bin/tree-sitter")
const env = { ...process.env, TREE_SITTER_LIBDIR: path.join(root, ".tree-sitter-cache") }
const hasNvim = spawnSync("nvim", ["--version"]).status === 0
const work = fs.mkdtempSync(path.join(os.tmpdir(), "efx-ts-nvim-"))
afterAll(() => fs.rmSync(work, { recursive: true, force: true }))

const sample = `export effect greet(id: string): string throws NotFound {
  return await find(id) |> orDie
}

const effect = 1
console.log(effect)
`

describe.skipIf(!hasNvim)("Neovim highlights EffectScript (Plan 19 Task 4, ADR-0058)", () => {
  it("loads the built parser and the queries, with keyword, function and operator captures", async () => {
    await generateOnce()
    const runtime = path.join(work, "runtime")
    fs.mkdirSync(path.join(runtime, "parser"), { recursive: true })
    fs.mkdirSync(path.join(runtime, "queries/effectscript"), { recursive: true })
    const built = spawnSync(cli, ["build", "-o", path.join(runtime, "parser/effectscript.so")], {
      cwd: root,
      encoding: "utf8",
      env
    })
    expect(built.status, built.stderr).toBe(0)
    for (const file of ["highlights.scm", "locals.scm", "injections.scm", "folds.scm"]) {
      fs.copyFileSync(path.join(root, "queries", file), path.join(runtime, "queries/effectscript", file))
    }
    const file = path.join(work, "app.efx")
    fs.writeFileSync(file, sample)
    const lines = sample.split("\n")
    const at = (text: string, row = 0) => [row, lines[row]!.indexOf(text)]
    const probes = {
      effect: at("effect"),
      greet: at("greet"),
      throws: at("throws"),
      pipe: at("|>", 1),
      plainEffect: at("effect", 4),
      console: at("console", 5)
    }
    const script = path.join(work, "probe.lua")
    fs.writeFileSync(
      script,
      `vim.opt.rtp:prepend(${JSON.stringify(runtime)})
vim.filetype.add({ extension = { efx = "effectscript" } })
vim.cmd.edit(${JSON.stringify(file)})
vim.treesitter.start(0, "effectscript")
local tree = vim.treesitter.get_parser(0, "effectscript"):parse()[1]
local out = { error = tree:root():has_error(), captures = {} }
for name, pos in pairs(vim.json.decode(${JSON.stringify(JSON.stringify(probes))})) do
  out.captures[name] = vim.tbl_map(function(c) return c.capture end, vim.treesitter.get_captures_at_pos(0, pos[1], pos[2]))
end
-- the effect's body folds (review I10)
out.fold = vim.treesitter.foldexpr(2)
io.stdout:write(vim.json.encode(out))
`
    )
    const home = path.join(work, "home")
    const result = spawnSync("nvim", ["--clean", "--headless", "-l", script], {
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: path.join(home, "config"),
        XDG_DATA_HOME: path.join(home, "data"),
        XDG_STATE_HOME: path.join(home, "state"),
        XDG_CACHE_HOME: path.join(home, "cache")
      }
    })
    expect(result.stderr).toBe("")
    const out = JSON.parse(result.stdout) as {
      error: boolean
      fold: string
      captures: Record<string, ReadonlyArray<string>>
    }
    expect(Number(out.fold.replace(">", ""))).toBeGreaterThan(0)
    expect(out.error).toBe(false)
    expect(out.captures.effect).toContain("keyword")
    expect(out.captures.greet).toContain("function")
    expect(out.captures.throws).toContain("keyword")
    expect(out.captures.pipe).toContain("operator")
    // `const effect = 1` is valid TypeScript: a variable, not a keyword
    expect(out.captures.plainEffect).not.toContain("keyword")
    // JavaScript's builtin globals, without predicates Neovim doesn't have (review C2)
    expect(out.captures.console).toContain("variable.builtin")
  }, 300_000)
})
