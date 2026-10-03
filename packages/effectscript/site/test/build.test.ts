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
    for (const file of ["fonts/InterDisplay-Bold.woff2", "favicon.svg", "og-image.jpg", "site.webmanifest"]) {
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

  it("has no broken internal links, anchors included (Plan 21)", () => {
    const broken: Array<string> = []
    const ids = new Map<string, Set<string>>()
    const idsOf = (page: string) => {
      if (!ids.has(page)) {
        ids.set(
          page,
          new Set([...fs.readFileSync(page, "utf8").matchAll(/ id="([^"]+)"/g)].map((m) => m[1]!))
        )
      }
      return ids.get(page)!
    }
    const pageOf = (target: string) =>
      [target, path.join(target, "index.html"), `${target}.html`].find((p) =>
        fs.existsSync(p) && fs.statSync(p).isFile()
      )
    for (const file of htmlFiles(dist)) {
      for (const [, href] of read(file).matchAll(/href="(\/[^"?]*|#[^"]+)"/g)) {
        const [route, anchor] = href!.split("#") as [string, string | undefined]
        const page = route === "" ? path.join(dist, file) : pageOf(path.join(dist, decodeURIComponent(route)))
        if (page === undefined) broken.push(`${file} → ${href}`)
        // the playground reads `#code=` itself: it isn't a heading
        else if (
          anchor !== undefined && anchor !== "" && !route.startsWith("/playground") && page.endsWith(".html") &&
          !idsOf(page).has(decodeURIComponent(anchor))
        ) {
          broken.push(`${file} → ${href} (no #${anchor})`)
        }
      }
    }
    expect(broken.slice(0, 20)).toEqual([])
  })
})

describe("the landing page (Plan 16 Task 3, ADR-0054)", () => {
  it("shows all ten scenarios, each pane with its exact token count", async () => {
    const { gallery } = await import("@effectscript/site/data/gallery")
    const page = read("index.html")
    for (const scenario of gallery()) {
      expect(page).toContain(`id="scenario-${scenario.id}"`)
      for (const pane of scenario.panes) expect(page).toContain(`data-count="${pane.tokens}"`)
    }
    expect(text("index.html")).toMatch(/\d+% fewer tokens/)
    expect(text("index.html")).toContain("o200k_base")
  })

  it("credits @gunta85 in the hero, after the playground and in the footer", () => {
    expect(read("index.html").match(/x\.com\/gunta85/g)!.length).toBeGreaterThanOrEqual(2)
    expect(read("playground/index.html")).toContain("Follow @gunta85")
  })
})

/** WCAG relative luminance and contrast of two `#rrggbb` colours. */
const contrast = (a: string, b: string) => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}
const generatedDocs = path.join(site, "src/content/docs/docs")

describe("Plan 16 final review fixes", () => {
  it("I1: the docs logo has a light-mode variant", () => {
    const page = read("docs/index.html")
    expect(page).toMatch(/lockup-black[^"]*\.svg/)
    expect(page).toMatch(/lockup-white[^"]*\.svg/)
  })

  it("I2: wrong examples are marked visibly, and the intro says how", () => {
    const pitfalls = fs.readFileSync(path.join(generatedDocs, "guides/pitfalls.md"), "utf8")
    expect(pitfalls).not.toMatch(/```efx wrong/)
    const marked = pitfalls.match(/```efx title="Wrong/g)?.length ?? 0
    expect(marked).toBeGreaterThan(0)
    expect(pitfalls).not.toContain("marked `efx wrong`")
    expect(text("docs/guides/pitfalls/index.html").match(/Wrong/g)!.length).toBeGreaterThanOrEqual(marked)
  })

  it("I3: /install serves the install script, byte for byte", () => {
    expect(fs.readFileSync(path.join(dist, "install"))).toEqual(
      fs.readFileSync(path.join(site, "../core/distribution/install.sh"))
    )
  })

  it("I4, I5: each number names how it was counted, and the hero makes no hand-written claim", () => {
    const page = text("index.html")
    // the page's own words, not the code samples
    expect(read("index.html").replace(/<pre[\s\S]*?<\/pre>/g, "").replace(/<[^>]+>/g, "")).not.toContain("by hand")
    expect(page).toContain("than the Effect TypeScript it compiles to")
    expect(page).toMatch(/re-sugared examples, counted with the EffectScript parser/)
    expect(page).not.toMatch(/Tokens are counted with the GPT-4o tokenizer \(o200k_base\) on the exact code shown/)
  })

  it("I6: the tools list claims only what is tested", () => {
    const page = text("index.html")
    expect(page).not.toContain("Astro")
    expect(page).not.toContain("any LSP editor")
  })

  it("I8: small muted text meets WCAG AA on every background it sits on", () => {
    const brand = fs.readFileSync(path.join(site, "src/styles/brand.css"), "utf8")
    const muted = /--color-muted:\s*(#[0-9a-f]{6})/i.exec(brand)![1]!
    for (const background of ["#09090b", "#18181a", "#181818", "#1e1e1e"]) {
      expect(contrast(muted, background), `${muted} on ${background}`).toBeGreaterThanOrEqual(4.5)
    }
    const starlight = fs.readFileSync(path.join(site, "src/styles/starlight.css"), "utf8")
    const gray3 = /--sl-color-gray-3:\s*(#[0-9a-f]{6})/i.exec(starlight)![1]!
    expect(contrast(gray3, "#09090b")).toBeGreaterThanOrEqual(4.5)
  })

  it("I9: the scenario tabs follow the ARIA tabs pattern", () => {
    const page = read("index.html")
    const tablist = /<div[^>]*role="tablist"[^>]*>([\s\S]*?)<\/div>/.exec(page)![1]!
    expect(tablist).not.toContain("token-toggle")
    const tabs = [...tablist.matchAll(/<button[^>]*>/g)].map((m) => m[0])
    expect(tabs.length).toBe(10)
    for (const [i, tab] of tabs.entries()) {
      const id = /id="(tab-[\w-]+)"/.exec(tab)![1]!
      expect(tab).toContain(i === 0 ? `tabindex="0"` : `tabindex="-1"`)
      expect(page).toContain(`aria-labelledby="${id}"`)
    }
    const scripts = [...page.matchAll(/src="(\/_astro\/[^"]+\.js)"/g)].map((m) => read(m[1]!.slice(1))).join("\n")
    expect(page + scripts).toContain("ArrowRight")
  })

  it("I10: fonts are subset WOFF2, and their licences ship with them", () => {
    const fonts = fs.readdirSync(path.join(dist, "fonts"))
    expect(fonts.filter((f) => /\.(otf|ttf)$/.test(f))).toEqual([])
    const woff2 = fonts.filter((f) => f.endsWith(".woff2"))
    expect(woff2.length).toBeGreaterThanOrEqual(4)
    for (const f of woff2) expect(fs.statSync(path.join(dist, "fonts", f)).size, f).toBeLessThan(80_000)
    expect(fonts).toEqual(expect.arrayContaining(["Inter-OFL.txt", "JetBrainsMono-OFL.txt"]))
    const css = fs.readdirSync(path.join(dist, "_astro")).filter((f) => f.endsWith(".css"))
      .map((f) => fs.readFileSync(path.join(dist, "_astro", f), "utf8")).join("\n")
    expect(css).not.toMatch(/\.(otf|ttf)\b/)
  })

  it("I11: the editor setup, strict rules and migration guides exist", () => {
    expect(text("docs/guides/editor-setup/index.html")).toContain("efx lsp")
    expect(text("docs/guides/migrating/index.html")).toContain("efx convert")
    const strict = text("docs/guides/strict-rules/index.html")
    const codes = [
      ...new Set(
        fs.readFileSync(path.join(site, "../core/src/compiler/transform/strict.ts"), "utf8").match(/EFX8\d{3}/g)
      )
    ]
    for (const code of codes) expect(strict, code).toContain(code)
  })

  it("I12: republished Effect pages carry no Effectful calls to action, and credit Effect", () => {
    for (const file of htmlFiles(path.join(dist, "docs/effect"))) {
      const page = text(path.join("docs/effect", file))
      for (const phrase of ["contact@effectful.co", "adoption partners", "talk to the core team", "Let's talk"]) {
        expect(page, `${file}: ${phrase}`).not.toContain(phrase)
      }
    }
    expect(text("docs/effect/guide/index.html")).toContain("Effectful Technologies")
    expect(text("docs/effect/guides/packages/vitest/readme/index.html")).toContain("Effectful Technologies")
  })

  it("I13: titles have no literal backticks", () => {
    expect(/<title>([^<]*)<\/title>/.exec(read("docs/reference/effect/index.html"))![1]).not.toContain("`")
    expect(read("llms.txt")).not.toContain("[`")
  })
})

describe("Plan 18 Task 6: site polish", () => {
  it("highlights the install block as shell, so the URL isn't a comment", () => {
    const comments = [...read("index.html").matchAll(/<span style="color:#6A9955">([^<]*)<\/span>/g)].map((m) => m[1]!)
    expect(comments.filter((c) => c.includes("effectscript.dev/install"))).toEqual([])
    expect(comments.some((c) => c.includes("# editors and coding agents"))).toBe(true)
  })

  it("labels the playground's editors and handles same-page share links", () => {
    const page = read("playground/index.html")
    const scripts = (fs.readdirSync(path.join(dist, "_astro")) as Array<string>).filter((f) => f.endsWith(".js"))
      .map((f) => fs.readFileSync(path.join(dist, "_astro", f), "utf8")).join("\n")
    expect(page).toContain("playground")
    expect(scripts.includes("EffectScript editor"), "ariaLabel").toBe(true)
    expect(scripts.includes("hashchange"), "hashchange").toBe(true)
  })
})

describe("Plan 21: site polish", () => {
  it("links Effect pages to each other on the site, and gives their examples playground links", () => {
    expect(read("docs/effect/guides/migration/schema/index.html")).toContain(
      "href=\"/docs/effect/guides/packages/effect/arbitrary/\""
    )
    expect(read("docs/effect/guide/index.html")).toContain("/playground/#code=")
  })

  it("capitalizes sidebar groups and draws |> without a ligature", () => {
    const page = read("docs/index.html")
    expect(page).toMatch(/>Patterns</)
    expect(page).not.toMatch(/>patterns</)
    // the Effect guides' own folders too; package and module folders keep their names (review)
    expect(page).toMatch(/>Migration</)
    expect(page).toMatch(/>Packages</)
    expect(page).not.toMatch(/>(migration|packages)</)
    const css = fs.readdirSync(path.join(dist, "_astro")).filter((f) => f.endsWith(".css"))
      .map((f) => fs.readFileSync(path.join(dist, "_astro", f), "utf8")).join("\n")
    expect(css).toMatch(/font-variant-ligatures:\s*none/)
  })

  it("keeps the copy measured", () => {
    const page = text("index.html")
    expect(page).not.toContain("most common complaint")
    expect(read("index.html").replace(/<[^>]+>/g, "")).not.toContain("--write --ai")
  })
})
