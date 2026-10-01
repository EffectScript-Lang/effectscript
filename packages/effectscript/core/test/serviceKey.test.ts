import { resolveOptions } from "effectscript/compiler/options"
import { serviceKey } from "effectscript/compiler/serviceKey"
import { describe, expect, it } from "vitest"

const key = (filename: string, name: string, packageRoot?: string) =>
  serviceKey(resolveOptions({ filename, packageName: "app", packageRoot }), name)

describe("ADR-0014: service keys", () => {
  it.each([
    ["/w/app/src/a.efx", "app/a/Users"],
    ["/w/app/src/b.efx", "app/b/Users"],
    ["/w/app/src/users/Users.efx", "app/users/Users"],
    ["/w/app/src/users/users.efx", "app/users/Users"],
    ["/w/app/src/users/index.efx", "app/users/Users"],
    ["/w/app/src/users/live.efx", "app/users/live/Users"],
    ["/w/app/lib/Users.efx", "app/lib/Users"]
  ])("%s → %s", (filename, expected) => {
    expect(key(filename, "Users", "/w/app")).toBe(expected)
  })

  it("normalizes Windows separators", () => {
    expect(key("C:\\w\\app\\src\\users\\live.efx", "Users", "C:\\w\\app\\")).toBe("app/users/live/Users")
  })

  it("never leaks absolute directories without a packageRoot", () => {
    expect(key("/home/me/proj/src/users/live.efx", "Users")).toBe("app/live/Users")
    expect(key("/home/me/proj/src/Users.efx", "Users")).toBe("app/Users")
  })

  it("a relative filename keeps its directories (ADR-0018)", () => {
    expect(key("src/db/Database.efx", "Database")).toBe("app/db/Database")
    expect(key("./src/db/live.efx", "Database")).toBe("app/db/live/Database")
  })

  it("keeps the bare name without package information", () => {
    expect(serviceKey(resolveOptions({ filename: "/x/a.efx" }), "Users")).toBe("Users")
  })
})
