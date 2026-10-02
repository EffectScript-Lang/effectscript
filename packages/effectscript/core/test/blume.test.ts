import { effectscript } from "effectscript/blume"
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
    effectscript().hooks["astro:config:setup"]({ updateConfig: (c) => configs.push(c) })
    const langs = configs[0].markdown.shikiConfig.langs
    expect(langs[0]).toBe("tsx")
    expect(langs[1]).toMatchObject({
      name: "efx-injection",
      scopeName: "effectscript.injection",
      injectTo: ["source.efx"]
    })
    expect(langs[2]).toMatchObject({ name: "efx", scopeName: "source.efx", embeddedLangs: ["tsx"] })
  })
})
