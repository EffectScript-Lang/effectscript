import { drift, generate } from "@effectscript/docs/generate"
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const repo = path.resolve(import.meta.dirname, "../../../..")
const content = path.resolve(import.meta.dirname, "../content")
const files = generate(repo)
const headings = (markdown: string) => markdown.split("\n").filter((line) => /^#{1,6} /.test(line))

describe("the generated docs (Plan 13 Task 2, ADR-0050)", () => {
  it("covers every area: ai-docs, LLMS.efx.md, guides, API examples and the corpus", () => {
    const paths = [...files.keys()]
    expect(paths).toContain("LLMS.efx.md")
    expect(paths).toContain("corpus.jsonl")
    expect(paths).toContain("ai-docs/01_effect/01_basics/10_creating-effects.efx")
    expect(paths).toContain("guides/packages/effect/SCHEMA.md")
    expect(paths).toContain("guides/migration/services.md")
    expect(paths).toContain("api/effect/Effect.md")
    expect(paths.some((p) => p.includes("CHANGELOG"))).toBe(false)
    expect(paths.some((p) => p.includes("fixtures"))).toBe(false)
  })

  it("mirrors LLMS.md: the same headings in the same order, with EffectScript code", () => {
    const llms = fs.readFileSync(path.join(repo, "LLMS.md"), "utf8")
    const efx = files.get("LLMS.efx.md")!
    expect(headings(efx)).toEqual(headings(llms))
    expect(efx).toContain("```efx")
    expect(efx).toContain("](./ai-docs/")
  })

  it("is up to date (pnpm codegen)", () => {
    expect(drift(files, content)).toEqual([])
  })

  it("detects a changed, a missing and an extra file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-docs-"))
    try {
      const sample = new Map([["a.md", "a\n"], ["b/c.md", "c\n"], ["d.md", "d\n"]])
      for (const [file, text] of sample) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
        fs.writeFileSync(path.join(dir, file), text)
      }
      fs.writeFileSync(path.join(dir, "a.md"), "changed\n")
      fs.rmSync(path.join(dir, "d.md"))
      fs.writeFileSync(path.join(dir, "extra.md"), "x\n")
      expect(drift(sample, dir)).toEqual(["a.md: changed", "d.md: missing", "extra.md: not generated"])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("runs as a CLI with --check", () => {
    const result = spawnSync(process.execPath, [path.resolve(import.meta.dirname, "../scripts/generate.ts"), "--check"], {
      encoding: "utf8"
    })
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
  }, 120_000)
})
