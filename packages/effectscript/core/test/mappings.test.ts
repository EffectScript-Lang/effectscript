import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

describe("mappings", () => {
  it("maps an unchanged file with a single identity mapping", () => {
    const source = "export const a = 1\n"
    const result = toTypeScript(source)
    expect(result.mappings).toEqual([{
      sourceOffsets: [0],
      generatedOffsets: [0],
      lengths: [source.length],
      data: { verification: true, completion: true, semantic: true, navigation: true, structure: true, format: false }
    }])
    expect(result.map?.sources).toEqual(["input.efx"])
  })
})
