import { toTypeScript } from "effectscript/compiler"
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const root = path.join(import.meta.dirname, "..")
const skill = path.join(root, "skills/effectscript")
const read = (file: string) => fs.readFileSync(path.join(skill, file), "utf8")
const fences = (markdown: string) => [...markdown.matchAll(/^```efx\n([\s\S]*?)^```$/gm)].map((m) => m[1]!)

describe("the generated skill references (Plan 14 Task 1, ADR-0051)", () => {
  it("are up to date (pnpm codegen)", () => {
    const result = spawnSync(process.execPath, [path.join(root, "scripts/generate-skill.ts"), "--check"], {
      encoding: "utf8"
    })
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
  }, 120_000)

  it("give every fixture directory a section in syntax.md", () => {
    const syntax = read("references/syntax.md")
    const dirs = fs.readdirSync(path.join(root, "test/fixtures"), { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => d.name)
    for (const dir of dirs) expect(syntax, dir).toContain(`<!-- fixtures/${dir} -->`)
  })

  it("show code that compiles", () => {
    for (const file of ["references/syntax.md", "references/effect-docs.md"]) {
      for (const code of fences(read(file))) {
        const errors = toTypeScript(code, { filename: "example.efx" }).diagnostics.filter((d) => d.severity === "error")
        expect(errors, `${file}:\n${code}`).toEqual([])
      }
    }
  })
})
