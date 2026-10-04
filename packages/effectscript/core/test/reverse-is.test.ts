import { toEffectScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"
import { expectSafe, roundTrip } from "./utils/reverse.ts"

const head = `declare const failure: Cause.TimeoutError | Cause.NoSuchElementError
declare const failures: Array<Cause.TimeoutError | Cause.NoSuchElementError>
declare const ok: boolean
`
const tsHead = `import { Schema } from "effect"
declare const node: { readonly _tag: "Leaf" } | { readonly _tag: "Branch" } | { readonly _tag: "String" }
declare const nodes: Array<typeof node>
`
/** Converts TypeScript, checks ADR-0030, and returns the EffectScript. */
const back = (ts: string) => expectSafe(`${tsHead}${ts}`).code

describe("reverse: is (ADR-0087)", () => {
  it.each([
    ["a test", "export const a = failure is TimeoutError\n"],
    ["or", "export const a = failure is TimeoutError or NoSuchElementError\n"],
    ["not", "export const a = failure is not TimeoutError\n"],
    ["not with or", "export const a = failure is not (TimeoutError or NoSuchElementError)\n"],
    ["a predicate", "export const a = failures.filter(is TimeoutError)\n"],
    ["a test inside a wider condition", "export const a = ok && failure is TimeoutError\n"]
  ])("gives back %s", (_, efx) => {
    expect(roundTrip(`${head}${efx}`)).toContain(efx)
  })

  it("keeps the parentheses around or inside a wider condition", () => {
    expect(roundTrip(`${head}export const a = ok && failure is TimeoutError or NoSuchElementError\n`)).toContain(
      "export const a = ok && (failure is TimeoutError or NoSuchElementError)\n"
    )
  })

  it("converts hand-written comparisons", () => {
    const efx = back(`export const a = node._tag === "Leaf"
export const b = node._tag !== "Leaf"
export const c = node._tag === "Leaf" || node._tag === "Branch"
export const d = nodes.filter((e) => e._tag === "Leaf")
export const f = nodes.filter((n) => n._tag === "Leaf")
export const g = (node._tag === "Leaf") || node._tag === "Branch"
export const h = node._tag === "Leaf" || nodes[0]!._tag === "Branch"
`)
    expect(efx).toContain("export const a = node is Leaf\n")
    expect(efx).toContain("export const b = node is not Leaf\n")
    expect(efx).toContain("export const c = node is Leaf or Branch\n")
    expect(efx).toContain("export const d = nodes.filter(is Leaf)\n")
    expect(efx).toContain("export const f = nodes.filter((n) => n is Leaf)\n")
    // not chains (a parenthesized operand, two subjects): each test converts on its own
    expect(efx).toContain("export const g = (node is Leaf) || node is Branch\n")
    expect(efx).toContain("export const h = node is Leaf || nodes[0]! is Branch\n")
  })

  it("names a tag after the one class that has it", () => {
    const efx = back(`export class Late extends Schema.TaggedError<Late>()("Timeout", {}) {}
declare const late: Late | { readonly _tag: "Late" }
export const a = late._tag === "Timeout"
export const b = late._tag === "Late"
`)
    expect(efx).toContain("export const a = late is Late\n")
    expect(efx).toContain(`export const b = late._tag === "Late"\n`)
  })

  it.each([
    ["a primitive's name", `export const a = node._tag === "String"\n`],
    ["a reserved word", `export const a = node._tag === "default"\n`],
    ["a tag that isn't a name", `export const a = node._tag === "not-found"\n`],
    ["a reversed comparison", `export const a = "Leaf" === node._tag\n`]
  ])("leaves %s as TypeScript", (_, ts) => {
    expect(back(ts)).toContain(ts)
  })

  it("is a no-op without an effect import", () => {
    const ts = `declare const n: { readonly _tag: "Leaf" }\nexport const a = n._tag === "Leaf"\n`
    expect(toEffectScript(ts).code).toBe(ts)
  })
})
