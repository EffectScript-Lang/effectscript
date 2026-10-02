import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { lspSession } from "./utils/lspScript.ts"

const efx = path.join(import.meta.dirname, "../bin/efx.js")
const env = { ...process.env, EFFECTSCRIPT_DEV: "1" }
const dirs: Array<string> = []
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
})

describe("efx lsp (Plan 11 Task 4, ADR-0040)", () => {
  it("runs @effectscript/language's server over stdio", async () => {
    // inside this package, so @effectscript/language and typescript resolve
    const dir = fs.mkdtempSync(path.join(import.meta.dirname, "../.efx-lsp-"))
    dirs.push(dir)
    const text = "const n: number = 1\nexport effect f() {\n  return n\n}\n"
    fs.writeFileSync(path.join(dir, "a.efx"), text)
    const session = await lspSession(process.execPath, [efx, "lsp", "--stdio"], {
      dir,
      file: "a.efx",
      text,
      offset: text.indexOf("n\n}"),
      env
    })
    expect(session.replies.get(1).result.capabilities.hoverProvider).toBeTruthy()
    expect(JSON.stringify(session.replies.get(2).result.contents)).toContain("const n: number")
    expect(session.status).toBe(0)
  }, 120_000)

  it("says what to install when the project has no @effectscript/language", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-lsp-"))
    dirs.push(dir)
    const session = await lspSession(process.execPath, [efx, "lsp"], {
      dir,
      file: "a.efx",
      text: "",
      offset: 0,
      env
    })
    expect(session.status).toBe(1)
    expect(session.stderr).toMatch(/npm i -D @effectscript\/language/)
  })
})
