import { toTypeScript } from "effectscript/compiler"
import { doctestSource } from "effectscript/doc/doctest"
import { describe, expect, it } from "vitest"

describe("doctest statement", () => {
  it("lowers to describe(…) without a layer", () => {
    const { code, diagnostics } = toTypeScript("doctest \"../src/bank.efx\"\n")
    expect(diagnostics).toEqual([])
    expect(code).toBe(
      "import { default as doctest } from \"../src/bank.efx?doctest\"\nimport { describe, it } from \"@effect/vitest\"\n" +
        "describe(\"doctest ../src/bank.efx\", () => doctest(it))\n"
    )
  })

  it("lowers to layer(…)(…) with a layer, and nests in describe … with", () => {
    expect(toTypeScript("doctest \"./a.efx\" with Ledger.layerTest\n").code).toContain(
      "layer(Ledger.layerTest)(\"doctest ./a.efx\", (it) => doctest(it))"
    )
    expect(toTypeScript("describe \"x\" with A {\n  doctest \"./a.efx\" with B\n}\n").code).toContain(
      "it.layer(B)(\"doctest ./a.efx\", (it) => doctest(it))"
    )
  })

  it("rejects non-relative or non-efx/ts paths (EFX9304)", () => {
    expect(toTypeScript("doctest \"bank\"\n").diagnostics.map((d) => d.code)).toEqual(["EFX9304"])
    expect(toTypeScript("doctest \"./bank.md\"\n").diagnostics.map((d) => d.code)).toEqual(["EFX9304"])
  })

  it("leaves identifiers named doctest alone", () => {
    const source = "const doctest = (s: string) => s\nexport const a = doctest(\"x\")\ndoctest\n\"y\"\n"
    expect(toTypeScript(source).code).toBe(source)
  })
})

const bank = [
  "/**",
  " * Bank.",
  " *",
  " * @module",
  " */",
  "",
  "/**",
  " * Doubles.",
  " *",
  " * Twice:",
  " *",
  " * ```efx",
  " * double(2) // => 4",
  " * ```",
  " */",
  "export const double = (n: number) => n * 2",
  "export type N = number",
  ""
].join("\n")

describe("doctestSource", () => {
  it("keeps every example line on its source line and column", () => {
    const { code, diagnostics } = doctestSource("/p/bank.efx", bank)
    expect(diagnostics).toEqual([])
    const lines = code.split("\n")
    expect(lines[0]).toContain("import { double } from \"./bank.efx\"")
    expect(lines[0]).toContain("import type { N } from \"./bank.efx\"")
    expect(lines[0]).toContain("import * as $efxDoctest from \"effectscript/doctest\"")
    expect(lines[11]).toBe("$efxIt.effect(\"double: Twice\", () => effect {")
    expect(lines[12]).toBe("   $efxDoctest.assertDoc(double(2), (4)) // => 4")
    expect(lines[13]).toBe("})")
    expect(lines.at(-1)).toBe("}")
  })

  it("works for CRLF files", () => {
    const { code } = doctestSource("/p/bank.efx", bank.replace(/\n/g, "\r\n"))
    expect(code.split("\n")[12]).toBe("   $efxDoctest.assertDoc(double(2), (4)) // => 4")
  })

  it("refuses targets with main (EFX9307) and warns without examples (EFX9305)", () => {
    expect(doctestSource("/p/m.efx", "main {\n}\n").diagnostics.map((d) => [d.code, d.severity])).toEqual([[
      "EFX9307",
      "error"
    ]])
    const none = doctestSource("/p/n.efx", "export const a = 1\n")
    expect(none.diagnostics.map((d) => [d.code, d.severity])).toEqual([["EFX9305", "warning"]])
    expect(none.code).toContain("$efxIt.skip(")
  })

  it("reports example errors at their source position", () => {
    const broken = bank.replace("double(2) // => 4", "double(2) // =>")
    const d = doctestSource("/p/bank.efx", broken).diagnostics
    expect(d.map((x) => x.code)).toEqual(["EFX9302"])
    expect(broken.slice(d[0]!.start, d[0]!.end)).toBe("// =>")
  })
})
