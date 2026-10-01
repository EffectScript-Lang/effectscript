import { toTypeScript } from "effectscript/compiler"
import { resolveOptions } from "effectscript/compiler/options"
import { describe, expect, it } from "vitest"

const diagnostics = (source: string, options: Parameters<typeof toTypeScript>[1] = {}) =>
  toTypeScript(source, options).diagnostics.map((d) => `${d.code}:${d.severity}`)

describe("options contract (ADR-0017)", () => {
  it("has documented defaults", () => {
    expect(resolveOptions({})).toMatchObject({ ambient: true, strict: false, effectVersion: undefined })
  })

  it("EFX1003: the @effect header disagrees with the installed effect", () => {
    expect(diagnostics("// @effect 3.19\nexport const a = 1\n", { effectVersion: "4.0.2" })).toEqual([
      "EFX1003:warning"
    ])
    expect(diagnostics("// @effect 4.0\nexport const a = 1\n", { effectVersion: "4.0.2" })).toEqual([])
    expect(diagnostics("// @effect 3.19\nexport const a = 1\n")).toEqual([])
  })

  it("strict (option or directive) promotes warnings to errors", () => {
    const source = "service S {\n  effect pipe(): void\n}\n"
    expect(diagnostics(source)).toEqual(["EFX4003:warning"])
    expect(diagnostics(source, { strict: true })).toEqual(["EFX4003:error"])
    expect(diagnostics(`// @efx strict\n${source}`)).toEqual(["EFX4003:error"])
  })
})
