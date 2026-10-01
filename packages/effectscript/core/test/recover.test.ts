import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

describe("ADR-0020: recovery", () => {
  it("keeps the half-typed line and compiles the rest", () => {
    const source = "export effect f(n: number) {\n  const x = n.\n  return 1\n}\n"
    const result = toTypeScript(source, { recover: true })
    expect(result.recovered).toBe(true)
    expect(result.diagnostics.map((d) => d.code)).toContain("EFX1001")
    expect(result.code).toContain("Effect.fn(\"f\")(function*(n: number) {\n  const x = n.\n")
    const offset = source.indexOf("n.\n") + 1
    const mapping = result.mappings.find((m) =>
      m.sourceOffsets[0]! <= offset && offset < m.sourceOffsets[0]! + m.lengths[0]!
    )
    expect(mapping?.data.completion).toBe(true)
  })

  it("returns the source verbatim when nothing can be recovered", () => {
    const source = "effect f() {\n  const a = [\n    1,\n    2,\n    3,\n"
    const result = toTypeScript(source, { recover: true })
    expect(result.code).toBe(source)
    expect(result.recovered).toBe(false)
  })

  it("keeps TSX mode when the neutralized line holds the only JSX (review I8)", () => {
    const source = "export const x = 1\nexport const view = (name: string) => <b>{name.}</b>\n"
    const result = toTypeScript(source, { recover: true })
    expect(result.recovered).toBe(true)
    expect(result.mode).toBe("tsx")
  })

  it("does not recover unless asked", () => {
    expect(toTypeScript("effect f() {\n  const x = .\n}\n").code).toBe("")
  })
})
