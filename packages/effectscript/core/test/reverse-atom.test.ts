import { describe, expect, it } from "vitest"
import { expectSafe, roundTrip } from "./utils/reverse.ts"

describe("reverse: atom (Plan 7 Task 4)", () => {
  it("converts atoms, derived atoms, pipes and effect atoms", () => {
    const efx =
      "export atom count = 0\n\nexport atom doubled = (get) => get(count) * 2\n\nexport atom session = 1 |> keepAlive\n\nexport atom greeting = effect {\n  return await succeed(\"hello\")\n}\n"
    expect(roundTrip(efx)).toBe(efx)
  })

  it("keeps Atom.make with options as TypeScript", () => {
    const ts = "import { Atom } from \"effect/reactivity\"\nexport const a = Atom.make(0, { initialValue: 1 } as any)\n"
    expect(expectSafe(ts).code).toContain("Atom.make(")
  })
})
