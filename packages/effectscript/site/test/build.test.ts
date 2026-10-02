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
