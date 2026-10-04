import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const dir = path.join(import.meta.dirname, "../blume/shiki")
const theme = (mode: "dark" | "light") =>
  JSON.parse(fs.readFileSync(path.join(dir, `effectscript-${mode}.json`), "utf8"))
const signals = {
  dark: { pass: "#4ade80", fail: "#f87171", need: "#60a5fa" },
  light: { pass: "#15803d", fail: "#b91c1c", need: "#1d4ed8" }
}
/** Whether a colour has a hue, rather than being a grey. */
const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return Math.max(r!, g!, b!) - Math.min(r!, g!, b!) > 16
}

describe("effectscript syntax themes (ADR-0078)", () => {
  for (const mode of ["dark", "light"] as const) {
    it(`${mode}: colours only the three signature clauses`, () => {
      const t = theme(mode)
      expect(t.name).toBe(`effectscript-${mode}`)
      const colourOf = (scope: string) =>
        t.tokenColors.find((c: any) => [c.scope].flat().includes(scope))?.settings.foreground?.toLowerCase()
      expect(colourOf("meta.return-type.efx")).toBe(signals[mode].pass)
      expect(colourOf("meta.throws-clause.efx")).toBe(signals[mode].fail)
      expect(colourOf("meta.needs-clause.efx")).toBe(signals[mode].need)
      const coloured = t.tokenColors.filter((c: any) => c.settings.foreground && hue(c.settings.foreground))
      expect(coloured.flatMap((c: any) => [c.scope].flat()).sort()).toEqual(
        ["meta.needs-clause.efx", "meta.return-type.efx", "meta.throws-clause.efx"]
      )
    })
  }
})
