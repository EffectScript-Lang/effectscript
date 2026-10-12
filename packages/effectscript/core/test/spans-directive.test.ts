import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

const compile = (efx: string) => {
  const result = toTypeScript(efx, { filename: "auth.efx" })
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([])
  return result.code
}
const back = (ts: string) => toEffectScript(ts, { filename: "auth.ts" }).code

describe("// @efx spans (ADR-0305)", () => {
  const efx = `// @efx spans CodexAuth
export effect poll(id: string) {
  return id
}

export const api = {
  effect refresh(token: string) {
    return token
  }
}
`

  it("names spans Prefix.name, and leaves no comment behind", () => {
    const code = compile(efx)
    expect(code).toContain("export const poll = Effect.fn(\"CodexAuth.poll\")(")
    expect(code).toContain("refresh: Effect.fn(\"CodexAuth.refresh\")(")
    expect(code).not.toContain("@efx")
  })

  it("leaves service and layer spans named after their service", () => {
    const code = compile(
      `// @efx spans App\nservice Users {\n  effect find(id: string): string\n  layer = { effect find(id) { return id } }\n}\n`
    )
    expect(code).toContain("Effect.fn(\"Users.find\")")
  })

  it("is written back when every span is Prefix.binding with one prefix, and round-trips", () => {
    expect(back(compile(efx))).toBe(efx)
  })

  it("is written for the prefix most spans share; the others stay TypeScript (Amendment 2)", () => {
    const fn = (name: string, span: string) =>
      `export const ${name} = Effect.fn("${span}")(function*() {\n  return 1\n})\n`
    const mixed = `import * as Effect from "effect/Effect"\n${fn("a", "Auth.a")}${fn("b", "Auth.b")}${
      fn("c", "Auth.usage.c")
    }${fn("d", "d")}`
    const code = back(mixed)
    expect(code.startsWith("// @efx spans Auth\n")).toBe(true)
    expect(code).toContain("export effect a() {")
    expect(code).toContain("export effect b() {")
    expect(code).toContain("export const c = Effect.fn(\"Auth.usage.c\")")
    expect(code).toContain("export const d = Effect.fn(\"d\")")
    expect(compile(code)).toBe(mixed)
  })

  it("isn't written when the plain binding is as common, or two prefixes tie", () => {
    const mixed = `import * as Effect from "effect/Effect"
export const a = Effect.fn("Auth.a")(function*() {
  return 1
})
export const b = Effect.fn("b")(function*() {
  return 2
})
`
    const code = back(mixed)
    expect(code).not.toContain("@efx spans")
    expect(code).toContain("export const a = Effect.fn(\"Auth.a\")")
    expect(code).toContain("export effect b() {")
  })
})
