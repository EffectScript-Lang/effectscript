import { parseDocComment } from "effectscript/doc/comment"
import { doctestSource } from "effectscript/doc/doctest"
import { docModule } from "effectscript/doc/model"
import { renderModule } from "effectscript/doc/render"
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const efx = path.join(import.meta.dirname, "../bin/efx.js")
const dirs: Array<string> = []
const project = (files: Record<string, string>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-docs-review-"))
  dirs.push(dir)
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), content)
  }
  return dir
}
const docs = (dir: string, ...args: Array<string>) =>
  spawnSync(process.execPath, [efx, "docs", ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, EFFECTSCRIPT_DEV: "1" }
  })
const header = (source: string) => doctestSource("/p/m.ts", source).code.split("\n")[0]!

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

const a = "/** A. */\nexport const a = 1\n"

describe("Plan 12 final review", { timeout: 30_000 }, () => {
  it("C1 never deletes a directory it didn't generate", () => {
    const dir = project({ "src/a.ts": a, "docs/guide.md": "mine", "docs/blume.config.ts": "mine" })
    const result = docs(dir, "--out", "docs")
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("wasn't written by efx docs")
    expect(fs.readFileSync(path.join(dir, "docs/guide.md"), "utf8")).toBe("mine")
    for (const out of [".", "src", ".."]) {
      expect(docs(dir, "--out", out).status).toBe(1)
      expect(fs.existsSync(path.join(dir, "src/a.ts"))).toBe(true)
    }
  })

  it("C1 replaces only what it wrote before", () => {
    const dir = project({ "src/a.ts": a, "src/b.ts": "/** B. */\nexport const b = 2\n" })
    expect(docs(dir).status).toBe(0)
    fs.writeFileSync(path.join(dir, "docs/api/notes.md"), "mine")
    fs.rmSync(path.join(dir, "src/b.ts"))
    expect(docs(dir).status).toBe(0)
    expect(fs.readdirSync(path.join(dir, "docs/api")).filter((f) => !f.startsWith(".")).sort()).toEqual([
      "a.md",
      "index.md",
      "notes.md"
    ])
  })

  it("C2 keeps pages inside the output directory and reports page collisions", () => {
    const dir = project({ "app/src/a.ts": a, "outside.ts": "/** O. */\nexport const o = 1\n" })
    const cwd = path.join(dir, "app")
    expect(docs(cwd, "src", "../outside.ts").status).toBe(0)
    expect(fs.existsSync(path.join(cwd, "docs/outside.md"))).toBe(false)
    expect(fs.existsSync(path.join(cwd, "docs/api/outside.md"))).toBe(true)
    const clash = project({ "src/users.ts": a, "src/users/index.ts": a })
    const result = docs(clash)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("users.md")
  })

  it("I2 doesn't import a name twice when it is both a value and a type", () => {
    const line = header(
      "/**\n * ```efx\n * 1 // => 1\n * ```\n */\nexport const Money = 1\nexport type Money = number\nexport type T = string\n"
    )
    expect(line).toContain("import { Money }")
    expect(line).toContain("import type { T }")
    expect(line).not.toMatch(/import type \{[^}]*Money/)
  })

  it("I3 merges overloads into one declaration", () => {
    const source =
      "/** F. */\nexport function f(x: string): string\nexport function f(x: number): number\nexport function f(x: any) { return x }\n"
    const { module } = docModule("/p/f.ts", "f", source)
    expect(module.declarations.map((d) => d.name)).toEqual(["f"])
    expect(module.declarations[0]!.signature).toBe("function f(x: string): string\nfunction f(x: number): number")
    expect(module.declarations[0]!.doc?.summary).toBe("F.")
    expect(header(`${source}/**\n * \`\`\`efx\n * f(1) // => 1\n * \`\`\`\n */\nexport const g = 1\n`)).toContain(
      "import { f, g }"
    )
  })

  it("I4 documents and imports `export { a as b }` under its public name", () => {
    const source =
      "/** A. */\nconst a = 1\nexport { a as b }\n/**\n * ```efx\n * b // => 1\n * ```\n */\nexport const c = 2\n"
    expect(docModule("/p/m.ts", "m", source).module.declarations.map((d) => d.name)).toEqual(["b", "c"])
    expect(header(source)).toContain("import { b, c }")
  })

  it("I5 puts the target's own imports in scope of its examples", () => {
    const line = header(
      "import { AccountId } from \"./accounts.efx\"\nimport * as Option from \"effect/Option\"\n/**\n * ```efx\n * AccountId.make(\"a\") // => \"a\"\n * ```\n */\nexport const x = 1\n"
    )
    expect(line).toContain("import { AccountId } from \"./accounts.efx\";")
    expect(line).toContain("import * as Option from \"effect/Option\";")
  })

  it("I6 runs fences under a TSDoc @example tag and renders them as examples", () => {
    const source =
      "/**\n * Doubles.\n *\n * @example Twice\n * ```efx\n * double(2) // => 4\n * ```\n * @since 1.0.0\n */\nexport const double = (n: number) => n * 2\n"
    const doc = parseDocComment(source, 0, source.indexOf("*/") + 2)
    expect(doc.examples.map((e) => [e.title, e.code])).toEqual([["Twice", "double(2) // => 4"]])
    expect(doc.tags.map((t) => t.name)).toEqual(["example", "since"])
    const page = renderModule({ modules: [] }, docModule("/p/d.ts", "d", source).module)
    expect(page).toContain("**Twice**\n\n```efx\ndouble(2) // => 4\n```")
    expect(page).not.toContain("**@example**")
    expect(doctestSource("/p/d.ts", source).code).toContain("$efxIt.effect(\"double: Twice\"")
  })

  it("I7 doesn't read a scoped package name in prose as a tag", () => {
    const text = "/** Uses @effect/vitest and @scope/pkg here. @since 2 */"
    const doc = parseDocComment(text, 0, text.length)
    expect(doc.summary).toBe("Uses @effect/vitest and @scope/pkg here.")
    expect(doc.tags).toEqual([{ name: "since", text: "2" }])
  })
})
