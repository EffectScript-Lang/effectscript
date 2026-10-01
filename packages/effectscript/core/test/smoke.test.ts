import { toTypeScript } from "effectscript/compiler"
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

describe("smoke", () => {
  it("returns plain TypeScript unchanged", () => {
    const source = "const answer: number = 42\n"
    expect(toTypeScript(source).code).toBe(source)
  })

  it("is versioned in lockstep with Effect (ADR-0015)", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "package.json"), "utf8"))
    expect(pkg.version).toMatch(/^4\.0\.0-alpha\.\d+$/)
  })

  it("warnings never fail a compile (ADR-0017)", () => {
    const result = toTypeScript("service S {\n  effect pipe(): void\n}\n")
    expect(result.diagnostics.map((d) => d.severity)).toEqual(["warning"])
    expect(result.code).toContain("Context.Service")
  })
})
