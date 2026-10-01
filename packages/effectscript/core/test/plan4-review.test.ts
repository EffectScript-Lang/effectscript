import { toTypeScript } from "effectscript/compiler"
import * as ts from "typescript"
import { describe, expect, it } from "vitest"

const compile = (source: string) => toTypeScript(source)
const syntaxErrors = (code: string): Array<string> => {
  const file = ts.createSourceFile("out.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  return ((file as unknown as { parseDiagnostics: Array<ts.Diagnostic> }).parseDiagnostics ?? []).map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, "\n")
  )
}

describe("Plan 4 final review", () => {
  it.each([
    ["layer X = (a) & b\n", "Layer.mergeAll((a), b)"],
    ["layer X = a & (b)\n", "Layer.mergeAll(a, (b))"],
    ["layer X = a // first\n  & b\n", "Layer.mergeAll(a // first\n  , b)"]
  ])("C1/M7: & operands keep their parentheses and comments: %j", (source, expected) => {
    const { code } = compile(source)
    expect(code).toContain(expected)
    expect(syntaxErrors(code)).toEqual([])
  })

  it("C2: describe … with never captures a user binding named it", () => {
    const { code } = compile(
      "const it = 41\ndescribe \"s\" with L {\n  test \"t\" {\n    expect(typeof it).toBe(\"number\")\n  }\n}\n"
    )
    expect(code).toContain("(it2) => {\n  it2.effect(\"t\"")
    expect(code).toContain("expect(typeof it)")
  })

  it("C3: a nested describe … with keeps the outer layer", () => {
    const { code } = compile(
      "describe \"a\" with A {\n  describe \"b\" with B {\n    test \"t\" {\n      await succeed(1)\n    }\n  }\n}\n"
    )
    expect(code).toContain("layer(A)(\"a\", (it) => {\n  it.layer(B)(\"b\", (it) => {")
  })

  it("I1: test.live inside describe … with is reported", () => {
    const { diagnostics } = compile("describe \"a\" with A {\n  test.live \"t\" {\n    await succeed(1)\n  }\n}\n")
    expect(diagnostics.map((d) => d.code)).toContain("EFX2030")
  })

  it.each([
    "export effect f(x = Date.now()) {\n  return x\n}\n",
    "export effect f(x = process.env.X) {\n  return x\n}\n",
    "export const g = effect (x = Math.random()) => x\n"
  ])("I2: parameter defaults are not captured: %j", (source) => {
    const { code } = compile(source)
    expect(code).not.toContain("yield*")
    expect(syntaxErrors(code)).toEqual([])
  })

  it.each([
    "effect f() {\n  ;[process.env.A] = [\"1\"]\n}\n",
    "effect f(o: { x: string }) {\n  ;({ x: process.env.B } = o)\n}\n",
    "effect f(xs: Array<string>) {\n  for (process.env.E of xs) {}\n}\n"
  ])("I3: process.env targets in patterns are writes: %j", (source) => {
    const { code } = compile(source)
    expect(code).not.toContain("Config.String")
    expect(syntaxErrors(code)).toEqual([])
  })

  it("M4: a config key that isn't an identifier is EFX3010, not a crash", () => {
    expect(compile("config C {\n  \"a-b\": string\n}\n").diagnostics.map((d) => d.code)).toEqual(["EFX3010"])
  })

  it("M9: directives and the @effect header only count in the leading comments", () => {
    const strictInTemplate = compile("export const s = `\n// @efx strict\n`\nexport const a: any = 1\n")
    expect(strictInTemplate.diagnostics.map((d) => d.severity)).toEqual(["warning"])
    const lateHeader = toTypeScript("export const a = 1\n// @effect 3.19\n", { effectVersion: "4.0.0" })
    expect(lateHeader.diagnostics).toEqual([])
    const header = toTypeScript("#!/usr/bin/env node\n// @effect 3.19\nexport const a = 1\n", {
      effectVersion: "4.0.0"
    })
    expect(header.diagnostics.map((d) => d.code)).toEqual(["EFX1003"])
  })
})
