import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it, vi } from "vitest"
import { typecheck } from "./utils/typecheck.ts"

// each test type-checks against Effect's sources: the first builds the program, slowly under load
vi.setConfig({ testTimeout: 180_000 })

const shapes = `schema Shape =
  | Circle { radius: number }
  | Square { side: number }
declare const shape: Shape
`
const check = (source: string) => {
  const result = toTypeScript(source, { filename: "guards.efx" })
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([])
  return typecheck(new Map([["match-guards.ts", result.code]]))
}

describe("match guards and object patterns (ADR-0063)", () => {
  it("doesn't count a guarded arm as handling its case", () => {
    const errors = check(`${shapes}export const size = match (shape) {
  when Circle(c) if c.radius > 10: "big"
  when Square: "square"
}
`)
    expect(errors.join("\n")).toMatch(/Circle/)
  })

  it("is exhaustive once an unguarded arm handles the case", () => {
    expect(check(`${shapes}export const size = match (shape) {
  when Circle(c) if c.radius > 10: "big"
  when Circle: "small"
  when Square: "square"
}
`)).toEqual([])
  })

  it("types a guard's binding and its body as the case, destructured or not", () => {
    expect(check(`${shapes}export const size = (s: Shape): number => match (s) {
  when Circle({ radius }) if radius > 10 || radius < 0: radius
  when Circle(c) if c.radius === 1 || c.radius === 2: c.radius
  default: 0
}
`)).toEqual([])
  })

  it("narrows a union of objects by an object pattern", () => {
    expect(check(`type Event = { type: "click"; x: number } | { type: "key"; key: string }
declare const event: Event
export const text: string = match (event) {
  when { type: "click", x } if x > 0: x.toFixed()
  when { type: "click" }: "origin"
  when { type: "key", key }: key
}
`)).toEqual([])
  })

  it("matches nested patterns and quoted keys, guarded or not", () => {
    expect(check(`declare const req: { "content-type": string; user?: { role: string; name: string } | undefined }
export const who: string = match (req) {
  when { "content-type": "text/html", user: { role: "admin", name } } if name !== "": name
  when { user: { role: "guest" } }: "guest"
  default: "anonymous"
}
`)).toEqual([])
  })

  it("refuses await in a guard and a name as an object pattern's value", () => {
    const awaited = toTypeScript("effect f(s: string) { return match (s) { when \"a\" if await g(): 1; default: 2 } }")
    expect(awaited.diagnostics.map((d) => d.message)).toEqual(["A guard is a predicate: it can't `await`"])
    const named = toTypeScript(
      "const ok = 200\nconst a = (r: { status: number }) => match (r) { when { status: ok }: 1; default: 2 }"
    )
    expect(named.diagnostics[0]?.message).toMatch(/write `\{ key \}` to bind a field/)
  })

  it("keeps if, when and objects meaning what they did elsewhere", () => {
    const result = toTypeScript("const when = (x: number) => x\nif (when(1)) { const o = { status: 1 } }\n")
    expect(result.diagnostics).toEqual([])
    expect(result.code).toBe("const when = (x: number) => x\nif (when(1)) { const o = { status: 1 } }\n")
  })
})

describe("match guards and object patterns convert back (ADR-0063, ADR-0030)", () => {
  const roundTrip = (efx: string) => {
    const ts = toTypeScript(efx, { filename: "a.efx" }).code
    const back = toEffectScript(ts, { filename: "a.ts" })
    expect(back.code).toBe(efx)
  }

  it("gives back guards on tags, literals and objects, with loose guards parenthesized only in TypeScript", () => {
    roundTrip(`declare const s: { _tag: "A"; n: number } | { _tag: "B" }
export const a = match (s) {
  when A(x) if x.n > 1 || x.n < -1: 1
  when A({ n }) if n === 0: 2
  when A if Math.random() > 0.5: 3
  default: 4
}
`)
    roundTrip(`declare const r: { status: number; user?: { role: string; name: string } }
export const b = match (r) {
  when { status: 200, user: { role: "admin", name } } if name !== "": name
  when { status: 404 } if r.user === undefined: "missing"
  when { user: { name } }: name
  default: "?"
}
`)
  })

  it("leaves a hand-written predicate as TypeScript", () => {
    const ts = `import { Match } from "effect"
declare const n: number
export const c = Match.value(n).pipe(Match.when((x) => x > 1, () => "big"), Match.orElse(() => "small"))
`
    expect(toEffectScript(ts, { filename: "c.ts" }).code).toContain("Match.when((x) => x > 1")
  })
})
