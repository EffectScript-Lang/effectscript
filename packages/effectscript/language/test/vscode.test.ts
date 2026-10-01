import * as fs from "node:fs"
import * as path from "node:path"
import { createHighlighter } from "shiki"
import { describe, expect, it } from "vitest"

const extensionDir = path.resolve(import.meta.dirname, "../../vscode")
const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, "package.json"), "utf8"))
const languagePackage = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../package.json"), "utf8"))

describe("VS Code extension manifest", () => {
  it("contributes the effectscript language for .efx", () => {
    const [language] = manifest.contributes.languages
    expect(language.id).toBe("effectscript")
    expect(language.extensions).toEqual([".efx"])
    expect(fs.existsSync(path.join(extensionDir, language.configuration))).toBe(true)
  })

  it("wires the TypeScript server plugin from @effectscript/language", () => {
    const [plugin] = manifest.contributes.typescriptServerPlugins
    expect(plugin.name).toBe(languagePackage.name)
    expect(plugin.languages).toEqual(["effectscript"])
    expect(manifest.dependencies[languagePackage.name]).toBeDefined()
  })

  it("references grammar files that exist and declare the right scopes", () => {
    for (const grammar of manifest.contributes.grammars) {
      const file = JSON.parse(fs.readFileSync(path.join(extensionDir, grammar.path), "utf8"))
      expect(file.scopeName).toBe(grammar.scopeName)
    }
  })
})

describe("EffectScript grammar", () => {
  const load = (file: string) => JSON.parse(fs.readFileSync(path.join(extensionDir, "syntaxes", file), "utf8"))
  const highlighter = createHighlighter({
    themes: ["github-dark"],
    langs: [
      "tsx",
      { ...load("effectscript.tmLanguage.json"), name: "efx", embeddedLangs: ["tsx"] },
      { ...load("effectscript.injection.tmLanguage.json"), name: "efx-injection", injectTo: ["source.efx"] }
    ]
  })
  const scopesOf = async (code: string, token: string, occurrence = 0) => {
    // "efx" is the custom grammar loaded above; Shiki's types only know its bundled languages
    const lines = (await highlighter).codeToTokensBase(code, { lang: "efx" as "tsx", includeExplanation: true })
    const matches = lines.flat().flatMap((t) => t.explanation ?? []).filter((e) => e.content.trim() === token)
    return matches[occurrence]?.scopes.map((s) => s.scopeName) ?? []
  }

  it("highlights effect declarations, blocks and arrows", async () => {
    expect(await scopesOf("export effect double(n: number) {\n  return n\n}\n", "effect")).toContain(
      "keyword.control.effect.efx"
    )
    expect(await scopesOf("const f = () => {\n  return effect {\n    return 1\n  }\n}\n", "effect"))
      .toContain("keyword.control.effect.efx")
  })

  it("does not highlight `effect` used as an identifier", async () => {
    expect(await scopesOf("const effect = 1\n", "effect")).not.toContain("keyword.control.effect.efx")
  })

  it("highlights declaration keywords, throws/needs and the pipeline operator", async () => {
    expect(await scopesOf("export schema User { name: string }\n", "schema")).toContain("storage.type.efx")
    expect(await scopesOf("error NotFound { id: string }\n", "error")).toContain("storage.type.efx")
    expect(await scopesOf("effect f(): number throws E {\n  return 1\n}\n", "throws")).toContain(
      "keyword.other.throws.efx"
    )
    expect(await scopesOf("function g() {\n  return x |> f\n}\n", "|>")).toContain("keyword.operator.pipeline.efx")
  })
})
