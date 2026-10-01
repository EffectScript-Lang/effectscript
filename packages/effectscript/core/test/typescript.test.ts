import { typeScriptProblem } from "effectscript/cli/typescript"
import { describe, expect, it } from "vitest"

describe("TypeScript version check (ADR-0019, review I7)", () => {
  it("accepts TypeScript 6 and explains anything else", () => {
    expect(typeScriptProblem({ version: "6.0.3", createProgram: () => {} })).toBeUndefined()
    expect(typeScriptProblem({ version: "7.0.2" })).toMatch(/needs TypeScript 6.*found 7\.0\.2/)
    expect(typeScriptProblem(undefined)).toMatch(/needs TypeScript 6/)
  })
})
