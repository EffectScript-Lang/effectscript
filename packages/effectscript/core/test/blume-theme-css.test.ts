import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const blume = path.join(import.meta.dirname, "../blume")
const css = fs.readFileSync(path.join(blume, "theme.css"), "utf8")
/** The declarations of the first rule with exactly this selector. */
const block = (selector: string) => {
  const start = css.indexOf(`\n${selector} {`)
  expect(start, selector).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf("\n}", start))
}
const token = (selector: string, name: string) =>
  new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i").exec(block(selector))![1]!
const luminance = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

describe("the EffectScript Blume theme CSS (ADR-0078)", () => {
  const modes = { light: ":root", dark: ":root[data-theme=\"dark\"]" } as const
  for (const [mode, selector] of Object.entries(modes)) {
    it(`${mode}: every text token passes WCAG AA on the background and the muted surface`, () => {
      const grounds = [token(selector, "--blume-background"), token(selector, "--blume-muted")]
      for (
        const name of [
          "--blume-foreground",
          "--blume-muted-foreground",
          "--efx-pass",
          "--efx-fail",
          "--efx-warn",
          "--efx-need"
        ]
      ) {
        for (const ground of grounds) {
          expect(contrast(token(selector, name), ground), `${mode} ${name} on ${ground}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    })
  }

  it("uses the brand's exact signal values", () => {
    expect(token(modes.dark, "--efx-pass").toLowerCase()).toBe("#4ade80")
    expect(token(modes.dark, "--efx-fail").toLowerCase()).toBe("#f87171")
    expect(token(modes.dark, "--efx-warn").toLowerCase()).toBe("#facc15")
    expect(token(modes.dark, "--efx-need").toLowerCase()).toBe("#60a5fa")
    expect(token(modes.light, "--efx-pass").toLowerCase()).toBe("#15803d")
    expect(token(modes.light, "--efx-fail").toLowerCase()).toBe("#b91c1c")
    expect(token(modes.light, "--efx-warn").toLowerCase()).toBe("#854d0e")
    expect(token(modes.light, "--efx-need").toLowerCase()).toBe("#1d4ed8")
  })

  it("turns code ligatures on (ADR-0080)", () => {
    expect(css).toMatch(/font-variant-ligatures:\s*contextual common-ligatures/)
    expect(css).not.toMatch(/font-variant-ligatures:\s*none/)
  })

  it("declares a font face for every font file it ships", () => {
    for (const [, file] of css.matchAll(/url\("\.\/fonts\/([^"]+)"\)/g)) {
      expect(fs.existsSync(path.join(blume, "fonts", file!)), file).toBe(true)
    }
  })

  it("ships subset fonts that still form the |> ligature", async () => {
    const file = fs.readFileSync(path.join(blume, "fonts/JetBrainsMono-Regular.woff2"))
    expect(file.length).toBeLessThan(120_000)
    const fontkit = await import("fontkit")
    const font = fontkit.create(file) as any
    const plain = font.layout("|>", { calt: false, liga: false })
    const ligated = font.layout("|>")
    expect(ligated.glyphs.map((g: any) => g.id)).not.toEqual(plain.glyphs.map((g: any) => g.id))
  })
})
