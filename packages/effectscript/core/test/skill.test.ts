import { toTypeScript } from "effectscript/compiler"
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { typecheck } from "./utils/typecheck.ts"

const root = path.join(import.meta.dirname, "..")
const skill = path.join(root, "skills/effectscript")
const read = (file: string) => fs.readFileSync(path.join(skill, file), "utf8")
/** `efx` fences, indented ones (inside list items) included, with the indentation removed. */
const fences = (markdown: string) =>
  [...markdown.matchAll(/^( *)```efx\n([\s\S]*?)^\1```$/gm)].map((m) =>
    m[2]!.split("\n").map((line) => line.slice(m[1]!.length)).join("\n")
  )

describe("the generated skill references (Plan 14 Task 1, ADR-0051)", () => {
  it("are up to date (pnpm codegen)", () => {
    const result = spawnSync(process.execPath, [path.join(root, "scripts/generate-skill.ts"), "--check"], {
      encoding: "utf8"
    })
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
  }, 120_000)

  it("cite no spec section numbers: an installed skill has no spec to resolve them (Plan 21)", () => {
    expect(read("references/syntax.md")).not.toContain("§")
  })

  it("give every fixture directory a section in syntax.md", () => {
    const syntax = read("references/syntax.md")
    const dirs = fs.readdirSync(path.join(root, "test/fixtures"), { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => d.name)
    for (const dir of dirs) expect(syntax, dir).toContain(`<!-- fixtures/${dir} -->`)
  }, 60_000)

  it("show code that compiles", () => {
    for (const file of ["references/syntax.md", "references/effect-docs.md"]) {
      for (const code of fences(read(file))) {
        const errors = toTypeScript(code, { filename: "example.efx" }).diagnostics.filter((d) => d.severity === "error")
        expect(errors, `${file}:\n${code}`).toEqual([])
      }
    }
  }, 60_000)
})

const handWritten = ["SKILL.md", "references/patterns.md", "references/pitfalls.md"]

describe("the hand-written skill (Plan 14 Task 2, ADR-0051)", () => {
  it("only shows good code that compiles and type-checks against effect", () => {
    const files = new Map<string, string>()
    for (const file of handWritten) {
      fences(read(file)).forEach((code, i) => {
        // good examples are clean even in strict mode: no errors and no warnings (review I7)
        const result = toTypeScript(code, { filename: "example.efx", strict: true })
        expect(result.diagnostics, `${file} #${i}:\n${code}`).toEqual([])
        files.set(`skill-${file.replace(/\W/g, "-")}-${i}.ts`, result.code)
      })
    }
    expect(files.size).toBeGreaterThan(20)
    expect([...files.keys()].filter((f) => f.startsWith("skill-SKILL-md")).length).toBeGreaterThan(0)
    expect(typecheck(files)).toEqual([])
  }, 180_000)

  it("teaches match in SKILL.md, and SQL in the patterns (Plan 21)", () => {
    expect(fences(read("SKILL.md")).some((code) => /\bmatch \(/.test(code))).toBe(true)
    const patterns = read("references/patterns.md")
    expect(patterns).toMatch(/^## SQL$/m)
    expect(fences(patterns).some((code) => code.includes("from \"effect/sql\"") && code.includes("sql`"))).toBe(true)
  })

  it("shows each mistake with the diagnostic it names", () => {
    let wrong = 0
    for (const file of handWritten) {
      for (const [, code, body] of read(file).matchAll(/^```efx wrong (EFX\d+)\n([\s\S]*?)^```$/gm)) {
        wrong++
        const codes = toTypeScript(body!, { filename: "example.efx", strict: true }).diagnostics.map((d) => d.code)
        expect(codes, `${file}:\n${body}`).toContain(code)
      }
    }
    expect(wrong).toBeGreaterThan(2)
  })

  it("links only to files inside the skill, or to the web (review I2)", () => {
    for (const file of [...handWritten, "references/syntax.md", "references/effect-docs.md"]) {
      for (const [, target] of read(file).matchAll(/\]\(([^)#]+)\)/g)) {
        expect(
          target!.startsWith("http") || fs.existsSync(path.join(skill, path.dirname(file), target!)),
          `${file} → ${target}`
        )
          .toBe(true)
      }
    }
  })

  it("has the frontmatter agents load skills by", () => {
    expect(read("SKILL.md")).toMatch(/^---\nname: effectscript\ndescription: .*\.efx.*\n---\n/)
  })
})
