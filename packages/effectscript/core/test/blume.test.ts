import { effectscript, factKind, frontmatter, kindGlyph, markdown, theme } from "effectscript/blume"
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const core = path.join(import.meta.dirname, "..")
const vscode = path.join(core, "../vscode/syntaxes")

describe("effectscript/blume", () => {
  it("ships the VS Code grammars unchanged", () => {
    for (const file of ["effectscript.tmLanguage.json", "effectscript.injection.tmLanguage.json"]) {
      expect(fs.readFileSync(path.join(core, "grammars", file), "utf8")).toBe(
        fs.readFileSync(path.join(vscode, file), "utf8")
      )
    }
  })

  it("registers efx with Shiki through Astro", () => {
    const configs: Array<any> = []
    effectscript().hooks["astro:config:setup"]({ updateConfig: (c) => configs.push(c), injectScript: () => {} })
    const langs = configs[0].markdown.shikiConfig.langs
    expect(langs[0]).toBe("tsx")
    expect(langs[1]).toMatchObject({
      name: "efx-injection",
      scopeName: "effectscript.injection",
      injectTo: ["source.efx"]
    })
    expect(langs[2]).toMatchObject({ name: "efx", scopeName: "source.efx", embeddedLangs: ["tsx"] })
  })

  it("injects the facts enhancer on every page, re-run after client navigation", () => {
    const scripts: Array<[string, string]> = []
    effectscript().hooks["astro:config:setup"]({
      updateConfig: () => {},
      injectScript: (stage, code) => scripts.push([stage, code])
    })
    expect(scripts).toHaveLength(1)
    expect(scripts[0]![0]).toBe("page")
    expect(scripts[0]![1]).toContain("effectscript/blume-facts")
    expect(scripts[0]![1]).toContain("astro:page-load")
  })

  it("exports the theme config: the syntax themes, the kind key and the system mode", async () => {
    expect(theme.mode).toBe("system")
    expect(markdown.code.theme.dark.name).toBe("effectscript-dark")
    expect(markdown.code.theme.light.name).toBe("effectscript-light")
    const kind = frontmatter.extend.kind["~standard"]
    expect(await kind.validate("error")).toEqual({ value: "error" })
    expect(await kind.validate(undefined)).toEqual({ value: undefined })
    expect("issues" in (await kind.validate(3))).toBe(true)
  })

  it("maps facts labels and construct kinds to signals", () => {
    expect(factKind("Returns")).toBe("a")
    expect(factKind("Fails with")).toBe("e")
    expect(factKind("Needs")).toBe("r")
    expect(factKind("id")).toBeUndefined()
    expect(kindGlyph("error")).toEqual({ glyph: "!", signal: "fail" })
    expect(kindGlyph("service")).toEqual({ glyph: "◇", signal: "need" })
    expect(kindGlyph("effect")).toEqual({ glyph: "ƒ" })
    expect(kindGlyph("unknown-thing")).toEqual({ glyph: "·" })
  })
})
