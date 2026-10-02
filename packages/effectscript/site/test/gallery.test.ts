import { constructs } from "@effectscript/site/data/constructs"
import { gallery } from "@effectscript/site/data/gallery"
import { toTypeScript } from "effectscript/compiler"
import { encode } from "gpt-tokenizer/encoding/o200k_base"
import { describe, expect, it, vi } from "vitest"
import { typecheck } from "../../core/test/utils/typecheck.ts"

// the type check blocks the event loop while the other tests in this file wait
vi.setConfig({ testTimeout: 180_000 })

const scenarios = gallery()

describe("the gallery (Plan 16 Task 3, ADR-0054)", () => {
  it("has the ten scenarios of spec §9.2, each in plain TS, Effect TS and EffectScript", () => {
    expect(scenarios.map((s) => s.id)).toEqual([
      "errors",
      "services",
      "schemas",
      "concurrency",
      "resources",
      "matching",
      "http",
      "cli",
      "testing",
      "config"
    ])
    for (const s of scenarios) expect(s.panes.map((p) => p.kind)).toEqual(["plain", "effect", "efx"])
  })

  it("compiles every EffectScript sample without errors", () => {
    for (const s of scenarios) expect(s.diagnostics, s.id).toEqual([])
  })

  it("type-checks every sample's Effect TypeScript against the workspace effect", () => {
    const files = new Map(scenarios.map((s) => [`gallery-${s.id}.ts`, s.panes[1]!.code] as const))
    expect(typecheck(files)).toEqual([])
  }, 180_000)

  it("counts tokens with o200k_base, exactly as shown", () => {
    for (const s of scenarios) {
      for (const pane of s.panes) expect(pane.tokens, `${s.id} ${pane.kind}`).toBe(encode(pane.code).length)
      const [plain, effect, efx] = s.panes
      expect(efx!.tokens).toBeLessThan(effect!.tokens)
      expect(plain!.tokens).toBeGreaterThan(0)
    }
  })
  it("shows construct snippets that compile", () => {
    for (const c of constructs) {
      const errors = toTypeScript(c.code, { filename: "card.efx" }).diagnostics.filter((d) => d.severity === "error")
      expect(errors, c.name).toEqual([])
    }
  })
})
