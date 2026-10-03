import {
  compile,
  createTracker,
  decodeHash,
  encodeHash,
  maxSource,
  paneToUpdate
} from "@effectscript/site/playground/protocol"
import { describe, expect, it } from "vitest"

describe("the playground protocol (Plan 16 Task 4, ADR-0054)", () => {
  it("compiles EffectScript to TypeScript, with diagnostics at line and column", () => {
    const ok = compile({ seq: 1, direction: "toTypeScript", source: "effect f() {\n  return await succeed(1)\n}\n" })
    expect(ok.code).toContain("Effect.fn(\"f\")")
    expect(ok.diagnostics).toEqual([])
    const bad = compile({ seq: 2, direction: "toTypeScript", source: "effect f() {\n  const x = \n}\n" })
    expect(bad.diagnostics[0]).toMatchObject({ code: "EFX1001", severity: "error", line: 3 })
  })

  it("converts TypeScript back to EffectScript, with the notes", () => {
    const ts =
      "import { Effect } from \"effect\"\nexport const two = Effect.fn(\"two\", { attributes: { a: 1 } })(function*() {\n  return 2\n})\nexport const one = Effect.fn(\"one\")(function*() {\n  return 1\n})\n"
    const result = compile({ seq: 3, direction: "toEffectScript", source: ts })
    expect(result.code).toContain("export effect one()")
    expect(result.notes[0]).toMatchObject({ line: 2, message: expect.stringContaining("span options") })
  })

  it("never throws, and refuses sources over the size limit", () => {
    expect(compile({ seq: 4, direction: "toTypeScript", source: "@@@ effect {{{" }).diagnostics.length).toBeGreaterThan(
      0
    )
    const huge = compile({ seq: 5, direction: "toTypeScript", source: "x".repeat(maxSource + 1) })
    expect(huge.diagnostics[0]!.message).toMatch(/too large/)
  })

  it("drops results older than the newest request", () => {
    const tracker = createTracker()
    const first = tracker.next()
    const second = tracker.next()
    expect(tracker.accept(first)).toBe(false)
    expect(tracker.accept(second)).toBe(true)
  })

  it("shares code in the URL hash, and rejects malformed or oversized hashes", () => {
    const code = "effect f() {\n  return \"héllo ƒx 🎉\"\n}\n"
    expect(decodeHash(encodeHash(code))).toBe(code)
    expect(encodeHash(code)).toMatch(/^#code=[A-Za-z0-9_-]+$/)
    expect(decodeHash("#code=%%%")).toBeUndefined()
    expect(decodeHash("#nothing")).toBeUndefined()
    expect(decodeHash(`#code=${"A".repeat(Math.ceil((maxSource * 4) / 3) + 100)}`)).toBeUndefined()
  })

  it("review I7: a refusal or an internal error never overwrites the other pane", () => {
    const huge = compile({ seq: 6, direction: "toEffectScript", source: "x".repeat(maxSource + 1) })
    expect(huge.code).toBeUndefined()
    expect(paneToUpdate(huge)).toBeUndefined()
    expect(paneToUpdate(compile({ seq: 7, direction: "toEffectScript", source: "const a = 1\n" }))).toBe("efx")
    expect(paneToUpdate(compile({ seq: 8, direction: "toTypeScript", source: "const a = 1\n" }))).toBe("ts")
  })
})
