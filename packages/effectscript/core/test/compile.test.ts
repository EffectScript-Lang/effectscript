import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { compileFixture, fixturesDir, listFixtures } from "./utils/fixtures.ts"

describe("golden fixtures", () => {
  for (const file of listFixtures()) {
    it(file, async () => {
      const { outFile, result } = compileFixture(file)
      // fixtures may show discouraged-but-valid code: strict warnings are allowed (ADR-0028)
      expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([])
      await expect(result.code).toMatchFileSnapshot(path.join(fixturesDir, outFile))
    })
  }
})
