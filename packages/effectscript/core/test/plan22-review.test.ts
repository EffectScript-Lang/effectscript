import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it, vi } from "vitest"
import { runCompiled } from "./utils/run.ts"
import { typecheck } from "./utils/typecheck.ts"

vi.setConfig({ testTimeout: 180_000 })

const check = (source: string) => {
  const result = toTypeScript(source, { filename: "review.efx" })
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([])
  return typecheck(new Map([["plan22-review.ts", result.code]]))
}

describe("Plan 22 final review", () => {
  it("C1: a service with a default gives no accessor to a name the reference owns", async () => {
    const source = `export service User {
  effect name(): string
  effect use(x: string): string
  default = { name: effect () => "anon", use: effect (x: string) => x }
}
`
    expect(toTypeScript(source).diagnostics.map((d) => d.code)).toEqual(["EFX4003", "EFX4003"])
    const mod = await runCompiled(`${source}
import { Effect } from "effect"
export const name = await Effect.runPromise(effect { return await (await User).name() })
`)
    expect(mod.name).toBe("anon")
  })

  it("I1: a service field named default with no value is a field, not a default", () => {
    const result = toTypeScript("service Settings {\n  readonly default: string\n  effect get(): string\n}\n")
    expect(result.diagnostics).toEqual([])
    expect(result.code).toContain("readonly default: string")
  })

  it("I2: a one-line effect method with defer is scoped inside the span", async () => {
    const mod = await runCompiled(`
import { Effect } from "effect"
const log: Array<string> = []
class A { effect short(): number { defer { log.push("x") }; return 1 } }
export const result = await Effect.runPromise(new A().short())
export { log }
`)
    expect([mod.result, mod.log]).toEqual([1, ["x"]])
  })

  it("I3: super and arguments in an effect method are refused", () => {
    const codes = (body: string) =>
      toTypeScript(`class Base { n() { return 1 } }\nclass Child extends Base {\n  effect m(): number { ${body} }\n}\n`)
        .diagnostics.map((d) => d.code)
    expect(codes("return super.n()")).toEqual(["EFX2009"])
    expect(codes("return arguments.length")).toEqual(["EFX2009"])
    // an arrow inherits them, a function doesn't
    expect(codes("const f = () => super.n(); return f()")).toEqual(["EFX2009"])
    expect(codes("function g() { return arguments.length }; return g()")).toEqual([])
  })

  it("I4: guards check that the value is an object with the field before reading it", async () => {
    expect(check(`declare const res: { status: number; body: string } | null
export const a = match (res) {
  when { status: 404, body } if body !== "": body
  default: "o"
}
type Ev = { type: "click"; x: number } | { type: "key"; key: string }
declare const ev: Ev
export const b = match (ev) {
  when { x: 0 } if ev.type === "click": "origin"
  default: ""
}
schema Shape =
  | Circle { radius: number }
  | Square { side: number }
declare const shape: Shape | null
export const c = match (shape) {
  when Circle(c) if c.radius > 1: c.radius
  default: 0
}
`)).toEqual([])
    const mod = await runCompiled(`
const f = (res: { status: number; body: string } | null) => match (res) {
  when { status: 404, body } if body !== "": body
  default: "other"
}
export const result = [f(null), f({ status: 404, body: "x" })]
`)
    expect(mod.result).toEqual(["other", "x"])
  })

  it("I5: an object pattern's bindings keep navigation from the source", () => {
    for (
      const source of [
        "declare const r: { status: number; body: string }\nexport const a = match (r) { when { status: 500, body }: body; default: \"\" }\n",
        "declare const r: { status: number; body: string }\nexport const a = match (r) { when { status: 500, body } if body !== \"\": body; default: \"\" }\n"
      ]
    ) {
      const { mappings } = toTypeScript(source)
      const offset = source.indexOf("body }")
      const covering = mappings.find((m) =>
        m.sourceOffsets[0]! <= offset && offset < m.sourceOffsets[0]! + m.lengths[0]!
      )
      expect(covering?.data.navigation, source).toBe(true)
    }
  })

  it("keeps `effect * f(x)` then a block on the next line as TypeScript", () => {
    const source =
      "declare let effect: number, y: number\ndeclare const scale: (n: number) => number\neffect * scale(2)\n{ y = 1 }\n"
    const result = toTypeScript(source)
    expect(result.diagnostics).toEqual([])
    expect(result.code).toBe(source)
  })

  it("refuses a reserved word as an object pattern's binding", () => {
    const result = toTypeScript(
      "declare const o: { default: number }\nconst a = match (o) { when { default }: 1; default: 2 }\n"
    )
    expect(result.diagnostics[0]?.message).toMatch(/`default` can't be a binding/)
  })
})
