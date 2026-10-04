import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { compilesBackModuloImports } from "effectscript/compiler/reverse/verify"
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, it } from "vitest"
import { compileFixture, fixturesDir, listFixtures } from "./utils/fixtures.ts"

// ADR-0030: every golden fixture's TypeScript converts back to EffectScript that compiles to the
// same bytes, and the EffectScript is snapshotted next to the fixture. A fixture that imports from the
// effect index itself is canonicalized to module-file imports instead (ADR-0089).
describe("reverse goldens", () => {
  for (const file of listFixtures()) {
    it(file, async ({ expect }) => {
      const { outFile } = compileFixture(file)
      const ts = fs.readFileSync(path.join(fixturesDir, outFile), "utf8")
      const options = { filename: file, packageName: "fixtures" }
      const back = toEffectScript(ts, options)
      const again = toTypeScript(back.code, options)
      expect(again.diagnostics.filter((d) => d.severity === "error")).toEqual([])
      const canonicalized = back.notes.filter((n) => n.message.startsWith("canonicalized:"))
      // a source that imports from the effect index itself comes back importing module files
      if (/^import \{(?:(?! as )[^}])*\} from "effect"$/m.test(compileFixture(file).source)) {
        expect(canonicalized.map((n) => n.message)).toEqual([
          "canonicalized: imports from the effect index come back as imports of each module's own file (ADR-0089)"
        ])
        expect(compilesBackModuloImports(ts, back.code, options)).toBe(true)
      } else {
        expect(again.code).toBe(ts)
        expect(canonicalized).toEqual([])
      }
      await expect(back.code).toMatchFileSnapshot(path.join(fixturesDir, file.replace(/\.efx$/, ".reverse.efx")))
    })
  }
})
