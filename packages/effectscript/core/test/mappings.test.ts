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

  it("maps user code inside effect bodies back to its source position", () => {
    const source = "declare const value: Effect.Effect<number>\neffect f() {\n  return await value\n}\n"
    const result = toTypeScript(source)
    const generated = result.code.indexOf("yield* value") + "yield* ".length
    const original = source.indexOf("await value") + "await ".length
    const mapping = result.mappings.find((m) =>
      m.generatedOffsets[0]! <= generated &&
      generated < m.generatedOffsets[0]! + (m.generatedLengths?.[0] ?? m.lengths[0]!)
    )
    expect(mapping).toBeDefined()
    expect(mapping!.sourceOffsets[0]! + (generated - mapping!.generatedOffsets[0]!)).toBe(original)
  })
})
