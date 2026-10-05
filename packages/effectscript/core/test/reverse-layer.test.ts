import { describe, expect, it } from "vitest"
import { expectSafe, roundTrip } from "./utils/reverse.ts"

const services = "declare const A: Layer<never>\ndeclare const B: Layer<never>\ndeclare const C: Layer<never>\n\n"

describe("reverse: top-level layer (Plan 7 Task 3)", () => {
  it.each([
    ["a merge", "export layer AppLive = A & B & C\n"],
    ["a merge with pipes", "export layer Provided = A & B |> provide(C) |> orDie\n"],
    ["a multi-line merge", "layer Big = A &\n  B &\n  C\n"],
    [
      "a background layer with defer",
      "export layer Worker = effect {\n  defer log(\"worker stopped\")\n  console.log(\"worker started\")\n}\n"
    ]
  ])("%s", (_name, efx) => {
    expect(roundTrip(`${services}${efx}`)).toBe(`${services}${efx}`)
  })

  it.each([
    ["a single-argument merge", "export const X = Layer.mergeAll(A)\n"],
    ["a conditional operand", "export const X = Layer.mergeAll(c ? A : B, C)\n"]
  ])("keeps %s as TypeScript", (_name, body) => {
    const ts = `import * as Layer from "effect/Layer"\ndeclare const c: boolean\n${
      services.replaceAll("Layer<never>", "Layer.Layer<never>")
    }${body}`
    expect(expectSafe(ts).code).toContain("Layer.mergeAll(")
  })
})
