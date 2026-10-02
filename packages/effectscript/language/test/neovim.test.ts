import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it } from "vitest"

const hasNvim = spawnSync("nvim", ["--version"]).status === 0
const server = path.resolve(import.meta.dirname, "../bin/efx-language-server.js")
const dirs: Array<string> = []
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
})

const source =
  "const n: number = 1\nexport effect f() {\n  const x = await succeed(n)\n  return x\n}\neffect {\n  1\n}\n"

describe.skipIf(!hasNvim)("Neovim (Plan 11 Task 4, ADR-0040)", () => {
  it("attaches efx-language-server through vim.lsp.config and shows hovers and diagnostics", () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "efx-nvim-")))
    dirs.push(dir)
    fs.writeFileSync(path.join(dir, "a.efx"), source)
    fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, types: [] } }))
    const out = path.join(dir, "out.json")
    // the documented setup (README): filetype, config, enable
    fs.writeFileSync(
      path.join(dir, "init.lua"),
      `vim.filetype.add({ extension = { efx = "effectscript" } })
vim.lsp.config("efx", {
  cmd = { ${JSON.stringify(process.execPath)}, ${JSON.stringify(server)}, "--stdio" },
  cmd_env = { EFFECTSCRIPT_DEV = "1" },
  filetypes = { "effectscript" },
  root_markers = { "tsconfig.json", "package.json", ".git" },
})
vim.lsp.enable("efx")
`
    )
    fs.writeFileSync(
      path.join(dir, "check.lua"),
      `local attached = vim.wait(60000, function()
  local clients = vim.lsp.get_clients({ bufnr = 0 })
  return #clients > 0 and clients[1].initialized
end, 100)
if not attached then io.stderr:write("no client\\n") vim.cmd("cquit 2") end
local hover = vim.lsp.buf_request_sync(0, "textDocument/hover", {
  textDocument = { uri = vim.uri_from_bufnr(0) },
  position = { line = 2, character = 13 },
}, 60000)
vim.wait(60000, function() return #vim.diagnostic.get(0) > 0 end, 100)
local result = { hover = hover, diagnostics = vim.tbl_map(function(d) return d.message end, vim.diagnostic.get(0)) }
local file = io.open(${JSON.stringify(out)}, "w")
file:write(vim.json.encode(result))
file:close()
vim.cmd("qall!")
`
    )
    const state = path.join(dir, "state")
    const result = spawnSync("nvim", [
      "--headless",
      "--clean",
      "-i",
      "NONE",
      "-u",
      "init.lua",
      "a.efx",
      "-c",
      "luafile check.lua"
    ], {
      cwd: dir,
      encoding: "utf8",
      timeout: 150_000,
      env: {
        ...process.env,
        XDG_STATE_HOME: state,
        XDG_CACHE_HOME: state,
        XDG_DATA_HOME: state,
        XDG_CONFIG_HOME: state
      }
    })
    expect(result.stderr).not.toContain("no client")
    const { diagnostics, hover } = JSON.parse(fs.readFileSync(out, "utf8"))
    expect(JSON.stringify(hover)).toContain("Effect bind")
    expect(diagnostics).toEqual(expect.arrayContaining([expect.stringContaining("EFX2003")]))
  }, 180_000)
})

describe.skipIf(!hasNvim)("Neovim with the README's config (review I3)", () => {
  it("starts `efx lsp` in the project even when Neovim runs elsewhere", () => {
    const readme = fs.readFileSync(path.resolve(import.meta.dirname, "../README.md"), "utf8")
    const snippet = /```lua\n([\s\S]*?)```/.exec(readme)![1]!
    const efx = path.resolve(import.meta.dirname, "../../core/bin/efx.js")
    // a project that has @effectscript/language (inside the core package), opened from elsewhere
    const project = fs.realpathSync(fs.mkdtempSync(path.resolve(import.meta.dirname, "../../core/.efx-nvim-")))
    const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "efx-nvim-cwd-")))
    dirs.push(project, elsewhere)
    fs.writeFileSync(path.join(project, "a.efx"), source)
    fs.writeFileSync(
      path.join(project, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { strict: true, types: [] } })
    )
    const out = path.join(elsewhere, "out.json")
    fs.writeFileSync(
      path.join(elsewhere, "init.lua"),
      snippet.replaceAll("\"efx\", \"lsp\"", `${JSON.stringify(process.execPath)}, ${JSON.stringify(efx)}, "lsp"`)
    )
    fs.writeFileSync(
      path.join(elsewhere, "check.lua"),
      `local attached = vim.wait(60000, function()
  local clients = vim.lsp.get_clients({ bufnr = 0 })
  return #clients > 0 and clients[1].initialized
end, 100)
local hover = attached and vim.lsp.buf_request_sync(0, "textDocument/hover", {
  textDocument = { uri = vim.uri_from_bufnr(0) },
  position = { line = 2, character = 13 },
}, 60000) or {}
local file = io.open(${JSON.stringify(out)}, "w")
file:write(vim.json.encode({ attached = attached, hover = hover }))
file:close()
vim.cmd("qall!")
`
    )
    const state = path.join(elsewhere, "state")
    spawnSync("nvim", [
      "--headless",
      "--clean",
      "-i",
      "NONE",
      "-u",
      "init.lua",
      path.join(project, "a.efx"),
      "-c",
      "luafile check.lua"
    ], {
      cwd: elsewhere,
      encoding: "utf8",
      timeout: 150_000,
      env: {
        ...process.env,
        EFFECTSCRIPT_DEV: "1",
        XDG_STATE_HOME: state,
        XDG_CACHE_HOME: state,
        XDG_DATA_HOME: state,
        XDG_CONFIG_HOME: state
      }
    })
    const result = JSON.parse(fs.readFileSync(out, "utf8"))
    expect(result.attached).toBe(true)
    expect(JSON.stringify(result.hover)).toContain("Effect bind")
  }, 180_000)
})
