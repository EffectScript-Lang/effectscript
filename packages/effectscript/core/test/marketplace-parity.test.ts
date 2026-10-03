import { extensionVersionFor, marketplaceVersion } from "effectscript/setup/marketplace"
import { describe, expect, it } from "vitest"
import { marketplaceVersion as packaged } from "../../vscode/scripts/marketplace.ts"

describe("the .vsix version efx setup expects (Plan 20 Task 1)", () => {
  it("is undefined for a version the mapping can't express, so efx setup still runs (Plan 21)", () => {
    expect(extensionVersionFor("4.0.0-beta.1")).toBeUndefined()
    expect(extensionVersionFor("4.0.0-alpha.1")).toBe("4.0.1")
  })

  it("is the version the extension is packaged with", () => {
    for (const version of ["4.0.0-alpha.0", "4.0.0-alpha.12", "4.0.0", "4.0.3-alpha.1", "4.1.2"]) {
      expect(marketplaceVersion(version)).toEqual(packaged(version))
    }
  })
})
