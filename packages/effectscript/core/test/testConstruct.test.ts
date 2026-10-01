import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

describe("test / describe (§4.14)", () => {
  it("compiles to @effect/vitest", () => {
    const { code, diagnostics } = toTypeScript(
      "describe \"A\" {\n  test \"x\" {\n    assert.ok(true)\n  } |> provide(L)\n  test.only \"y\" {\n    expect(1).toBe(1)\n  }\n}\n"
    )
    expect(diagnostics).toEqual([])
    expect(code).toBe(
      "import { assert, describe, expect, it } from \"@effect/vitest\"\nimport { Effect } from \"effect\"\n" +
        "describe(\"A\", () => {\n  it.effect(\"x\", () => Effect.gen(function*() {\n    assert.ok(true)\n  }).pipe(Effect.provide(L)))\n" +
        "  it.effect.only(\"y\", () => Effect.gen(function*() {\n    expect(1).toBe(1)\n  }))\n})\n"
    )
  })

  it("passes a shared layer through layer(…)(name, (it) => …)", () => {
    const { code } = toTypeScript("describe \"A\" with L {\n  test \"x\" {\n    await succeed(1)\n  }\n}\n")
    expect(code).toContain("layer(L)(\"A\", (it) => {\n  it.effect(\"x\", () => Effect.gen(function*() {")
    expect(code).not.toContain("Effect.scoped")
  })

  it("leaves identifiers named describe and test alone", () => {
    const source =
      "const describe = (s: string) => s\nconst test = { live: 1 }\nexport const a = describe(\"x\") + test.live\n"
    expect(toTypeScript(source).code).toBe(source)
  })
})
