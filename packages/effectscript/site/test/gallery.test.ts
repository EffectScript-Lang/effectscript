import { constructs } from "@effectscript/site/data/constructs"
import { gallery, tokenPieces } from "@effectscript/site/data/gallery"
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

describe("token pieces (Plan 21)", () => {
  it("split at token boundaries without breaking a character", () => {
    const code = "const s = \"héllo ƒx 🎉 日本語\"\n"
    const pieces = tokenPieces(code)
    expect(pieces.join("")).toBe(code)
    expect(pieces.join("")).not.toContain("\uFFFD")
  })

  it("match each sample's own text", () => {
    for (const scenario of scenarios) {
      for (const pane of scenario.panes) expect(pane.pieces.join(""), `${scenario.id}/${pane.name}`).toBe(pane.code)
    }
  })

  it("tell the same story in every language (errors: three attempts; http: /todos)", () => {
    const byId = (id: string) => scenarios.find((s) => s.id === id)!
    expect(byId("errors").panes[2].code).toContain("times: 2")
    expect(byId("http").panes[2].code).toContain("\"/todos/:id\"")
    // a missing todo answers 404 in each one (ADR-0064)
    expect(byId("http").panes[2].code).toContain("error TodoNotFound status 404")
    expect(byId("http").panes[1].code).toContain("{ httpApiStatus: 404 }")
  })
})

describe("the landing page's exhibition (ADR-0082)", () => {
  it("shows bento and library snippets that compile", async () => {
    const { libraries, tiles } = await import("@effectscript/site/data/stdlib")
    for (const snippet of [...tiles, ...libraries]) {
      const errors = toTypeScript(snippet.code, { filename: "tile.efx" }).diagnostics.filter((d) =>
        d.severity === "error"
      )
      expect(errors, snippet.name).toEqual([])
    }
  })

  it("counts the ceremony from the compiled samples, and shows the compiler's own diagnostics", async () => {
    const { ceremony, mistakes, totals } = await import("@effectscript/site/data/lp")
    const yields = scenarios.map((s) => s.panes[1].code.match(/yield\*/g)?.length ?? 0).reduce((a, b) => a + b)
    expect(ceremony.find((c) => c.label === "yield*")).toEqual({ label: "yield*", effect: yields, efx: 0 })
    expect(totals.efx).toBe(scenarios.reduce((sum, s) => sum + s.panes[2].tokens, 0))
    // each mistake on the page is one the strict rules catch
    expect(mistakes.map((m) => m.diagnostics[0]?.code)).toEqual(["EFX8001", "EFX8111", "EFX8112", "EFX8004"])
  })

  it("keeps extension keywords apart from the language's and from each other", async () => {
    const { keywords } = await import("@effectscript/site/data/stdlib")
    const added = keywords.extensions.flatMap((x) => [...x.adds])
    expect(new Set(added).size).toBe(added.length)
    for (const k of added) expect(keywords.core as ReadonlyArray<string>, k).not.toContain(k)
  })
})
