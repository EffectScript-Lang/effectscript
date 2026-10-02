import { toEffectScript, toTypeScript } from "effectscript/compiler"
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, it } from "vitest"
import { compileFixture, fixturesDir, listFixtures } from "./utils/fixtures.ts"

// ADR-0030: every golden fixture's TypeScript converts back to EffectScript that compiles to the
// same bytes, and the EffectScript is snapshotted next to the fixture.
describe("reverse goldens", () => {
  for (const file of listFixtures()) {
    it(file, async ({ expect }) => {
      const { outFile } = compileFixture(file)
      const ts = fs.readFileSync(path.join(fixturesDir, outFile), "utf8")
      const options = { filename: file, packageName: "fixtures" }
      const back = toEffectScript(ts, options)
      const again = toTypeScript(back.code, options)
      expect(again.diagnostics.filter((d) => d.severity === "error")).toEqual([])
      expect(again.code).toBe(ts)
      expect(back.notes.filter((n) => n.message.startsWith("canonicalized:"))).toEqual([])
      await expect(back.code).toMatchFileSnapshot(path.join(fixturesDir, file.replace(/\.efx$/, ".reverse.efx")))
    })
  }
})
