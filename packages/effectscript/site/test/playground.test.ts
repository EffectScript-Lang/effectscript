import {
  compile,
  createTracker,
  createWatchdog,
  decodeHash,
  encodeHash,
  maxSource,
  paneToUpdate
} from "@effectscript/site/playground/protocol"
import { describe, expect, it, vi } from "vitest"

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

  it("Plan 18: the watchdog fires only when a compile outlives its limit", () => {
    vi.useFakeTimers()
    try {
      const fired: Array<string> = []
      const dog = createWatchdog(5000, () => fired.push("restart"))
      dog.start()
      vi.advanceTimersByTime(4999)
      dog.stop()
      vi.advanceTimersByTime(10_000)
      expect(fired).toEqual([])
      dog.start()
      vi.advanceTimersByTime(3000)
      dog.start() // a newer request restarts the clock
      vi.advanceTimersByTime(3000)
      expect(fired).toEqual([])
      vi.advanceTimersByTime(2000)
      expect(fired).toEqual(["restart"])
      // `running` lets the page arm it once per burst of requests, not on every keystroke
      expect(dog.running()).toBe(false)
      dog.start()
      expect(dog.running()).toBe(true)
      dog.stop()
      expect(dog.running()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
