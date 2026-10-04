import { count, panel, pieces, primary, vocabularies } from "@effectscript/tokens"
import { describe, expect, it } from "vitest"

// the first run downloads each vocabulary (pinned and checked, ADR-0092)
const timeout = 120_000

describe("token counts (ADR-0092)", () => {
  it("count o200k tokens as GPT-4o's tokenizer does", async () => {
    expect(primary.id).toBe("o200k")
    expect(await count(["const a = 1\n", "x |> f\n", ""])).toEqual([6, 4, 0])
  }, timeout)

  it("count every text in every vocabulary of the panel", async () => {
    const counts = await panel(["export effect f() {\n  return await g()\n}\n"])
    expect(Object.keys(counts)).toEqual(vocabularies.map((v) => v.id))
    for (const id of Object.keys(counts)) expect(counts[id]![0], id).toBeGreaterThan(5)
  }, timeout)

  it("split text at token boundaries without breaking a character", async () => {
    const code = "const s = \"héllo ƒx 🎉 日本語\"\nx |> f\n"
    const split = await pieces(code)
    expect(split.join("")).toBe(code)
    expect(split).toContain(" |>")
    expect(split.some((p) => p.includes("🎉"))).toBe(true)
    expect(split.length).toBeLessThan((await count([code]))[0]!)
  }, timeout)
})
