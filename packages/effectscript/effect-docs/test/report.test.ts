import { type CorpusEntry, generate } from "@effectscript/effect-docs/generate"
import { count, vocabularies } from "@effectscript/tokens"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const files = await generate(path.resolve(import.meta.dirname, "../../../.."))
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

  it("reports the o200k tokens of the changed examples before and after (ADR-0092)", async () => {
    const changed = corpus.filter((e) => e.changed)
    const sum = (xs: ReadonlyArray<number>) => xs.reduce((n, x) => n + x, 0)
    const before = sum(await count(changed.map((e) => e.ts)))
    const after = sum(await count(changed.map((e) => e.efx)))
    const [, , , , , , tsTokens, efxTokens, saved] = row("**total**")
    expect(Number(tsTokens.replaceAll("*", ""))).toBe(before)
    expect(Number(efxTokens.replaceAll("*", ""))).toBe(after)
    expect(saved.replaceAll("*", "")).toBe(`${(100 * (1 - after / before)).toFixed(1)}%`)
  })

  it("counts the same examples in every vocabulary of the panel", () => {
    for (const v of vocabularies) {
      const [, id, lab, ts, efx, saved] = report.split("\n").find((line) => line.startsWith(`| ${v.id} |`))!.split("|")
        .map((c) => c.trim())
      expect([id, lab]).toEqual([v.id, v.lab])
      expect(Number(efx)).toBeLessThan(Number(ts))
      expect(saved).toMatch(/^\d+\.\d%$/)
    }
  })
})
