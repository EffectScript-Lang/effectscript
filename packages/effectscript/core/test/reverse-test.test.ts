import { describe, expect, it } from "vitest"
import { expectSafe, roundTrip } from "./utils/reverse.ts"

describe("reverse: test and describe (Plan 7 Task 5)", () => {
  it("converts describe, tests with modifiers and pipes, and describe with a layer", () => {
    const efx = `service Users {
  effect find(id: string): string
  layer test = { find: effect (id: string) => \`user-\${id}\` }
}

describe "Users" {
  test "finds a user" {
    const user = await Users.find("1")
    assert.strictEqual(user, "user-1")
  } |> provide(Users.layerTest)

  test "scopes resources to the test" {
    defer log("done")
    assert.strictEqual(1, 1)
  }

  test.live "runs on the live clock" {
    expect(Date.now()).toBeGreaterThan(0)
  }

  test.skip "is skipped" {
    return await fail("never runs")
  }
}

describe "with a shared layer" with Users.layerTest {
  test "provides the layer to every test" {
    expect(await Users.find("2")).toBe("user-2")
  }
}
`
    expect(roundTrip(efx, { filename: "users.test.efx" })).toBe(efx)
  })

  it("keeps it.effect with a non-generator body as TypeScript", () => {
    const ts =
      "import { it } from \"@effect/vitest\"\nimport * as Effect from \"effect/Effect\"\nit.effect(\"plain\", () => Effect.succeed(1))\n"
    expect(expectSafe(ts).code).toContain("it.effect(")
  })

  it("keeps tests that call a user-defined it", () => {
    const ts =
      "import * as Effect from \"effect/Effect\"\nconst it = { effect: (_: string, f: () => unknown) => f() }\nit.effect(\"mine\", () => Effect.gen(function*() {\n  return 1\n}))\n"
    expect(expectSafe(ts).code).toContain("it.effect(")
  })
})
