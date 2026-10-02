import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const packages = path.join(import.meta.dirname, "../..")

describe("GitHub coordinates (ADR-0036)", () => {
  it("every EffectScript package points at the EffectScript-Lang repository", () => {
    const found: Array<string> = []
    for (const dir of fs.readdirSync(packages)) {
      const file = path.join(packages, dir, "package.json")
      if (!fs.existsSync(file)) continue
      const pkg = JSON.parse(fs.readFileSync(file, "utf8"))
      if (pkg.repository === undefined) continue
      found.push(dir)
      expect(pkg.repository.url, dir).toBe("https://github.com/EffectScript-Lang/effect-lang.git")
      if (pkg.homepage !== undefined) {
        expect(pkg.homepage, dir).toMatch(/^https:\/\/(effectscript\.dev|github\.com\/EffectScript-Lang\/effect-lang)/)
      }
    }
    expect(found).toEqual(expect.arrayContaining(["core", "language", "vscode"]))
  })
})
