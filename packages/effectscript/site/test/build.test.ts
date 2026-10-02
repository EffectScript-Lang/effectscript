import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { beforeAll, describe, expect, it } from "vitest"

const site = path.resolve(import.meta.dirname, "..")
const dist = path.join(site, "dist")
const read = (file: string) => fs.readFileSync(path.join(dist, file), "utf8")
/** A page's text, without markup (highlighted code is split into spans). */
const text = (file: string) => read(file).replace(/<[^>]+>/g, "")

beforeAll(() => {
  const result = spawnSync("pnpm", ["run", "build"], { cwd: site, encoding: "utf8" })
  if (result.status !== 0) {
    throw new Error(`site build failed:\n${result.stdout.slice(-4000)}${result.stderr.slice(-4000)}`)
  }
}, 600_000)

describe("the site build (Plan 16 Task 1, ADR-0054)", () => {
  it("writes the landing page and the docs", () => {
    expect(read("index.html")).toContain("All of Effect. None of the ceremony.")
    expect(read("docs/index.html")).toContain("EffectScript documentation")
    expect(text("docs/start/install/index.html")).toContain("efx setup")
  })

  it("ships the brand: fonts, favicons, palette", () => {
    for (const file of ["fonts/InterDisplay-Bold.otf", "favicon.svg", "og-image.jpg", "site.webmanifest"]) {
      expect(fs.existsSync(path.join(dist, file)), file).toBe(true)
    }
    const css = fs.readdirSync(path.join(dist, "_astro")).filter((f) => f.endsWith(".css"))
      .map((f) => fs.readFileSync(path.join(dist, "_astro", f), "utf8")).join("\n")
    expect(css).toMatch(/#09090b/i)
    expect(css).toContain("Inter Display")
  })

  it("highlights EffectScript code with the efx grammar", () => {
    // Expressive Code renders the efx keywords with the grammar's scopes
    expect(read("docs/index.html")).toMatch(/class="ec-line"/)
    expect(read("docs/index.html")).not.toContain("Unknown language")
  })
})

const fixtures = path.resolve(site, "../core/test/fixtures")
const htmlFiles = (dir: string): Array<string> =>
  (fs.readdirSync(dir, { recursive: true }) as Array<string>).filter((f) => f.endsWith(".html"))

describe("the generated docs (Plan 16 Task 2, ADR-0054)", () => {
  it("has a reference page per construct, with the compiled TypeScript and a playground link", () => {
    const dirs = fs.readdirSync(fixtures, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    for (const dir of dirs) {
      const page = path.join("docs/reference", dir, "index.html")
      expect(fs.existsSync(path.join(dist, page)), page).toBe(true)
      expect(read(page)).toContain("/playground/#code=")
    }
  })

  it("turns the skill's patterns and pitfalls into guides", () => {
    expect(text("docs/guides/patterns/services-and-layers/index.html")).toContain("layer test")
    expect(text("docs/guides/pitfalls/index.html")).toContain("EFX8112")
  })

  it("publishes the Effect docs in EffectScript", () => {
    expect(text("docs/effect/guide/index.html")).toContain("EffectScript edition")
    expect(fs.existsSync(path.join(dist, "docs/effect/guides/packages/effect/schema/index.html"))).toBe(true)
    expect(fs.existsSync(path.join(dist, "docs/effect/api/effect/option/index.html"))).toBe(true)
  })

  it("writes llms.txt and llms-full.txt", () => {
    const llms = read("llms.txt")
    expect(llms).toMatch(/^# EffectScript\n\n> /)
    expect(llms).toContain("https://effectscript.dev/docs/reference/effect/")
    expect(read("llms-full.txt")).toContain("name: effectscript")
  })

  it("has no broken internal links", () => {
    const broken: Array<string> = []
    for (const file of htmlFiles(dist)) {
      for (const [, href] of read(file).matchAll(/href="(\/[^"#?]*)/g)) {
        const target = path.join(dist, decodeURIComponent(href!))
        const exists = fs.existsSync(target) || fs.existsSync(path.join(target, "index.html")) ||
          fs.existsSync(`${target}.html`)
        if (!exists) broken.push(`${file} → ${href}`)
      }
    }
    expect(broken.slice(0, 20)).toEqual([])
  })
})
