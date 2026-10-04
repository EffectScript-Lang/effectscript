import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it, vi } from "vitest"
import { typecheck } from "./utils/typecheck.ts"

// the type-checking tests build a program over Effect's sources, slowly under load
vi.setConfig({ testTimeout: 180_000 })

const compile = (source: string) => toTypeScript(source, { filename: "is.efx" })
const code = (source: string) => {
  const result = compile(source)
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([])
  return result.code
}
const codes = (source: string) => compile(source).diagnostics.map((d) => d.code)
const ab = `declare const s: { readonly _tag: "A" } | { readonly _tag: "B" }\n`

describe("is (ADR-0087)", () => {
  it("compiles a test to the tag comparison", () => {
    expect(code(`${ab}export const a = s is A\n`)).toContain(`export const a = s._tag === "A"\n`)
  })

  it("joins or with || and not with !== and &&", () => {
    const out = code(
      `${ab}export const a = s is A or B\nexport const b = s is not A\nexport const c = s is not (A or B)\nexport const d = s is (A or B)\n`
    )
    expect(out).toContain(`export const a = s._tag === "A" || s._tag === "B"\n`)
    expect(out).toContain(`export const b = s._tag !== "A"\n`)
    expect(out).toContain(`export const c = s._tag !== "A" && s._tag !== "B"\n`)
    expect(out).toContain(`export const d = s._tag === "A" || s._tag === "B"\n`)
  })

  it("compiles a predicate to an arrow", () => {
    expect(code(`${ab}export const p = [s].filter(is not (A or B))\n`)).toContain(
      `export const p = [s].filter((e) => e._tag !== "A" && e._tag !== "B")\n`
    )
  })

  it("takes a local error's declared tag and a dotted name's last segment", () => {
    const out = code(
      `error Late { _tag: "Timeout" }\ndeclare const e: Late | Cause.TimeoutError\nexport const a = e is Late\nexport const b = e is Cause.TimeoutError\n`
    )
    expect(out).toContain(`export const a = e._tag === "Timeout"\n`)
    expect(out).toContain(`export const b = e._tag === "TimeoutError"\n`)
  })

  it("doesn't import the module a tag name is qualified by", () => {
    expect(code(`${ab}export const a = s is Cause.A\n`)).not.toMatch(/import .*\bCause\b/)
  })

  it("adds parentheses only where precedence needs them", () => {
    const out = code(
      `${ab}declare const ok: boolean\nexport const x = ok && s is A\nexport const y = ok && s is A or B\nexport const z = ok === s is A\nexport const w = s is A === ok\nexport const v = ok ?? s is A or B\n`
    )
    expect(out).toContain(`export const x = ok && s._tag === "A"\n`)
    expect(out).toContain(`export const y = ok && (s._tag === "A" || s._tag === "B")\n`)
    expect(out).toContain(`export const z = ok === (s._tag === "A")\n`)
    expect(out).toContain(`export const w = s._tag === "A" === ok\n`)
    expect(out).toContain(`export const v = ok ?? (s._tag === "A" || s._tag === "B")\n`)
  })

  it("parenthesizes a subject that doesn't take ._tag as written", () => {
    expect(
      code(`declare const load: Effect<{ readonly _tag: "A" }>\nexport effect f() {\n  return await load is A\n}\n`)
    ).toContain(
      `return (yield* load)._tag === "A"`
    )
  })

  it("parenthesizes a predicate used as an operand", () => {
    expect(code(`declare const f: (x: unknown) => boolean\nexport const p = is A || f\n`)).toContain(
      `export const p = ((e) => e._tag === "A") || f\n`
    )
  })

  it("reports EFX7002 for or on a subject with a call", () => {
    expect(codes(`declare const f: () => { readonly _tag: "A" }\nexport const x = f() is A or B\n`)).toContain(
      "EFX7002"
    )
  })

  it("reports EFX7003 for not with or and no parentheses", () => {
    expect(codes(`${ab}export const x = s is not A or B\n`)).toContain("EFX7003")
  })

  it("reports EFX7004 for a pattern that isn't a tag name", () => {
    expect(codes(`declare const x: number\nexport const a = x is 404\n`)).toContain("EFX7004")
  })

  it("reports EFX7005 for a predicate on its own as a statement", () => {
    expect(codes(`declare const error: unknown\nconst ok = error\n  is RateLimited\n`)).toContain("EFX7005")
  })

  it("type-checks: a tag the value can't have doesn't compile", () => {
    const errors = typecheck(
      new Map([[
        "is-typo.ts",
        code(`declare const e: Cause.TimeoutError | Cause.NoSuchElementError\nexport const a = e is TimeoutErorr\n`)
      ]])
    )
    expect(errors.join("\n")).toMatch(/have no overlap/)
  })

  it("type-checks: tests narrow in a conditional, in filter and in retry", () => {
    const errors = typecheck(
      new Map([[
        "is-narrow.ts",
        code(`error RateLimited { retryAfter: number }
declare const call: Effect<string, RateLimited | Cause.NoSuchElementError>
declare const e: RateLimited | Cause.TimeoutError
declare const all: Array<RateLimited | Cause.TimeoutError>
export const after: number = e is RateLimited ? e.retryAfter : 0
export const limited: Array<RateLimited> = all.filter(is RateLimited)
export const retried: Effect<string, Cause.NoSuchElementError> = call |> retry({ while: is RateLimited })
`)
      ]])
    )
    expect(errors).toEqual([])
  })
})
