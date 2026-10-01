import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

describe("smoke", () => {
  it("returns plain TypeScript unchanged", () => {
    const source = "const answer: number = 42\n"
    expect(toTypeScript(source).code).toBe(source)
  })
})
