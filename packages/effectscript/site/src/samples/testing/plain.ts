import { describe, expect, it } from "vitest"

interface Users {
  find(id: string): Promise<string>
}

// Test doubles are wired by hand into every test
const testUsers: Users = { find: async (id) => `user-${id}` }

describe("Users", () => {
  it("finds a user", async () => {
    expect(await testUsers.find("1")).toBe("user-1")
  })

  it("runs requests concurrently", async () => {
    const [a, b] = await Promise.all([testUsers.find("1"), testUsers.find("2")])
    expect([a, b]).toEqual(["user-1", "user-2"])
  })
})
