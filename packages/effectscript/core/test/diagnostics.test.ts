import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

const codes = (source: string) => toTypeScript(source).diagnostics.map((d) => d.code)

describe("effect diagnostics", () => {
  it("EFX2001: effect arrows cannot use this", () => {
    expect(codes("class A { x = 1; f = effect () => this.x }\n")).toEqual(["EFX2001"])
  })

  it("EFX2002: effect class methods are not supported yet", () => {
    expect(codes("class A {\n  effect m() { return 1 }\n}\n")).toEqual(["EFX2002"])
  })

  it("EFX2003: unused effect block statement", () => {
    expect(codes("effect {\n  1\n}\n")).toEqual(["EFX2003"])
  })

  it("EFX2005: effect declaration without body", () => {
    expect(codes("effect f(): void\n")).toEqual(["EFX2005"])
  })
})
