import { describe, expect, it } from "vitest"
import { marketplaceVersion } from "../scripts/marketplace.ts"

describe("marketplaceVersion (ADR-0055)", () => {
  it("maps alpha.N to a pre-release patch number below the stable release", () => {
    expect(marketplaceVersion("4.0.0-alpha.0")).toEqual({ version: "4.0.0", preRelease: true })
    expect(marketplaceVersion("4.0.0-alpha.12")).toEqual({ version: "4.0.12", preRelease: true })
    expect(marketplaceVersion("4.0.0")).toEqual({ version: "4.0.999", preRelease: false })
    expect(marketplaceVersion("4.0.2-alpha.3")).toEqual({ version: "4.0.2003", preRelease: true })
  })

  it("keeps the order of the npm versions", () => {
    const order = ["4.0.0-alpha.0", "4.0.0-alpha.1", "4.0.0", "4.0.1-alpha.0", "4.0.1", "4.1.0-alpha.0"]
    const patches = order.map((v) => marketplaceVersion(v).version.split(".").map(Number))
    for (let i = 1; i < patches.length; i++) {
      const [a, b] = [patches[i - 1]!, patches[i]!]
      expect(a[0]! < b[0]! || (a[0] === b[0] && (a[1]! < b[1]! || (a[1] === b[1] && a[2]! < b[2]!)))).toBe(true)
    }
  })

  it("refuses what it can't map", () => {
    expect(() => marketplaceVersion("4.0.0-beta.1")).toThrow(/alpha/)
    expect(() => marketplaceVersion("4.0.0-alpha.999")).toThrow(/999/)
  })
})
