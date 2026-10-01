import { describe, expect, it } from "vitest"
import { compileFixture, listFixtures } from "./utils/fixtures.ts"
import { typecheck } from "./utils/typecheck.ts"

describe("typecheck", () => {
  it("every golden output type-checks against the workspace effect", () => {
    const files = new Map(
      listFixtures().map((file) => {
        const { outFile, result } = compileFixture(file)
        return [outFile, result.code] as const
      })
    )
    expect(typecheck(files)).toEqual([])
  }, 180_000)
})
