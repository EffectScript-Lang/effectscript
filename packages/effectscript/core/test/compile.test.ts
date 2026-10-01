import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { compileFixture, fixturesDir, listFixtures } from "./utils/fixtures.ts"

describe("golden fixtures", () => {
  for (const file of listFixtures()) {
    it(file, async () => {
      const { outFile, result } = compileFixture(file)
      expect(result.diagnostics).toEqual([])
      await expect(result.code).toMatchFileSnapshot(path.join(fixturesDir, outFile))
    })
  }
})
