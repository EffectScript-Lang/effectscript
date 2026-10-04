import { drift, generate } from "@effectscript/effect-docs/generate"
import { compilesBackModuloImports, verdict } from "effectscript/compiler/reverse/verify"
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
  }, 60_000)

  it("mirrors LLMS.md: the same headings in the same order, with EffectScript code", () => {
    const llms = fs.readFileSync(path.join(repo, "LLMS.md"), "utf8")
    const efx = files.get("LLMS.efx.md")!
    expect(headings(efx)).toEqual(headings(llms))
    expect(efx).toContain("```efx")
    expect(efx).toContain("](./ai-docs/")
  }, 60_000)

  it("is up to date (pnpm codegen)", () => {
    expect(drift(files, content)).toEqual([])
  }, 60_000)

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
  }, 60_000)

  it("runs as a CLI with --check", () => {
    const result = spawnSync(
      process.execPath,
      [path.resolve(import.meta.dirname, "../scripts/generate.ts"), "--check"],
      {
        encoding: "utf8"
      }
    )
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
  }, 120_000)
  it("labels only examples that compile back as EffectScript (review I2)", () => {
    const corpus = files.get("corpus.jsonl")!.trim().split("\n").map((line) => JSON.parse(line))
    const valid = corpus.filter((e: { valid: boolean }) => e.valid)
    expect(valid.length).toBeGreaterThan(3500)
    for (const e of valid) {
      // or canonicalized: imports from the effect index come back naming module files (ADR-0089)
      const back = verdict(e.ts, e.efx, { filename: "example.ts" }) > 0 ||
        compilesBackModuloImports(e.ts, e.efx, { filename: "example.ts" })
      expect(back, e.source).toBe(true)
    }
  }, 120_000)
})

describe("Plan 21: the generator's inputs and pages", () => {
  const fixture = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "efx-docs-gen-"))
    const write = (file: string, text: string) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
      fs.writeFileSync(path.join(root, file), text)
    }
    const example = (code: string) => `/**\n * **Example**\n *\n * \`\`\`ts\n * ${code}\n * \`\`\`\n */\n`
    write("ai-docs/src/index.md", "# Docs\n")
    write("migration/README.md", "# Migration\n")
    write("packages/effect/README.md", "# effect\n")
    write("packages/x/package.json", "{ \"name\": \"@scope/x\" }\n")
    write(
      "packages/x/src/a.ts",
      `${example("const a = 1")}export interface Foo {}\n${example("const b = 2")}export const bar = 1\n${
        example("const c = 3")
      }export const Foo = 1\n`
    )
    write("packages/x/README.md", "# x\n\n```ts\nconst x = 1\n```\n")
    write("packages/x/test/fixtures/README.md", "# fixture\n\n```ts\nconst y = 1\n```\n")
    const git = (...args: Array<string>) =>
      spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: root, encoding: "utf8" })
    git("init", "-q")
    git("add", "-A")
    git("commit", "-qm", "init")
    // not tracked: never an input
    write("packages/x/scratch/README.md", "# scratch\n\n```ts\nconst z = 1\n```\n")
    return root
  }

  it("reads tracked files only, and skips test and fixture folders", () => {
    const out = generate(fixture())
    expect([...out.keys()].filter((f) => f.startsWith("guides/"))).toEqual(["guides/packages/x/README.md"])
  })

  it("puts each symbol's examples under one heading", () => {
    const page = generate(fixture()).get("api/@scope/x/a.md")!
    expect(page.match(/^## Foo$/gm)).toHaveLength(1)
  })

  it("ignores dotfiles when checking for drift", () => {
    const root = fixture()
    const files = generate(root)
    const dir = path.join(root, "content")
    for (const [file, text] of files) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
      fs.writeFileSync(path.join(dir, file), text)
    }
    fs.writeFileSync(path.join(dir, ".DS_Store"), "")
    expect(drift(files, dir)).toEqual([])
  })
})
