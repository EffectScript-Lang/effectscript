import { type CorpusEntry, generate } from "@effectscript/effect-docs/generate"
import { tokens } from "@effectscript/effect-docs/translate"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const files = generate(path.resolve(import.meta.dirname, "../../../.."))
const corpus: Array<CorpusEntry> = files.get("corpus.jsonl")!.trim().split("\n").map((line) => JSON.parse(line))
const report = files.get("REPORT.md")!
const row = (label: string) =>
  report.split("\n").find((line) => line.startsWith(`| ${label} |`))!.split("|").map((c) => c.trim())

describe("REPORT.md (Plan 13 Task 3, ADR-0050)", () => {
  it("counts every corpus entry once, per area and in total", () => {
    for (const area of ["ai-docs", "guides", "api"] as const) {
      const entries = corpus.filter((e) => e.area === area)
      const [, , blocks, changed, unchanged, ts] = row(area)
      expect(Number(blocks)).toBe(entries.length)
      expect(Number(changed)).toBe(entries.filter((e) => e.changed).length)
      expect(Number(unchanged)).toBe(entries.filter((e) => e.valid && !e.changed).length)
      expect(Number(ts)).toBe(entries.filter((e) => !e.valid).length)
    }
    const [, , total] = row("**total**")
    expect(Number(total.replaceAll("*", ""))).toBe(corpus.length)
  })

  it("reports the tokens of the changed examples before and after", () => {
    const changed = corpus.filter((e) => e.changed)
    const before = changed.reduce((n, e) => n + tokens(e.ts), 0)
    const after = changed.reduce((n, e) => n + tokens(e.efx), 0)
    const [, , , , , , tsTokens, efxTokens, saved] = row("**total**")
    expect(Number(tsTokens.replaceAll("*", ""))).toBe(before)
    expect(Number(efxTokens.replaceAll("*", ""))).toBe(after)
    expect(saved.replaceAll("*", "")).toBe(`${(100 * (1 - after / before)).toFixed(1)}%`)
  })
})
