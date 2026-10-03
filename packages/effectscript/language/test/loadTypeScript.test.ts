import { loadTypeScript } from "@effectscript/language/languageServer"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type * as ts from "typescript"
import { afterAll, describe, expect, it } from "vitest"

const work = fs.mkdtempSync(path.join(os.tmpdir(), "efx-load-ts-"))
afterAll(() => fs.rmSync(work, { recursive: true, force: true }))

describe("loadTypeScript (Plan 21)", () => {
  it("says which TypeScript it skipped, and why", () => {
    const lib = path.join(work, "node_modules/typescript/lib")
    fs.mkdirSync(lib, { recursive: true })
    fs.writeFileSync(path.join(lib, "typescript.js"), "module.exports = { version: \"7.0.2\" }\n")
    const own = { version: "6.0.3" } as unknown as typeof ts
    const loaded = loadTypeScript(
      {
        processId: null,
        rootUri: `file://${work}`,
        capabilities: {},
        workspaceFolders: [{ uri: `file://${work}`, name: "w" }]
      },
      () => own
    )
    expect(loaded.typescript).toBe(own)
    expect(loaded.skipped).toEqual([`the workspace (${lib}): TypeScript 7.0.2, not 6`])
  })
})
