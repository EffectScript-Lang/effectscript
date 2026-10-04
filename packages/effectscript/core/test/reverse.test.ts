import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

const roundTrip = (efx: string) => toEffectScript(toTypeScript(efx).code).code

describe("ADR-0023: reverse compiler subset", () => {
  it.each([
    "export effect double(n: number): number {\n  const x = await succeed(n)\n  return x * 2\n}\n",
    "error NotFound { id: string }\n\nexport effect find(id: string): string throws NotFound {\n  if (id === \"\") throw new NotFound({ id })\n  return id\n}\n",
    "export schema User {\n  name: string\n  email?: string\n  tags: Array<string>\n}\n",
    "schema Point { x: number; y: number | null }\n",
    "export effect retried(n: number): number {\n  return n\n} |> retry({ times: 3 })\n",
    "export schema User {\n  name: string // display name, may change\n  email?: string // optional, may be absent\n}\n"
  ])("round-trips %s", (efx) => {
    const back = roundTrip(efx)
    expect(back).toBe(efx)
    expect(roundTrip(back)).toBe(back) // fixed point
  })

  it("keeps unrelated TypeScript and drops imports the prelude restores", () => {
    const ts =
      "import * as Effect from \"effect/Effect\"\nexport const f = Effect.fn(\"f\")(function*() {\n  return 1\n})\nexport const run = Effect.runSync(f())\n"
    const back = toEffectScript(ts).code
    expect(back).toBe("export effect f() {\n  return 1\n}\nexport const run = runSync(f())\n")
    expect(toTypeScript(back).code).toBe(ts)
  })

  it("keeps an import the prelude would move (ADR-0030)", () => {
    const ts =
      "import \"./polyfill\"\nimport * as Effect from \"effect/Effect\"\nexport const f = Effect.fn(\"f\")(function*() {\n  return 1\n})\n"
    const back = toEffectScript(ts).code
    expect(back).toContain("import * as Effect from \"effect/Effect\"")
    expect(toTypeScript(back).code).toBe(ts)
  })

  it("keeps comments between Effect.fn and the generator, and between pipes", () => {
    const ts =
      "import * as Effect from \"effect/Effect\"\nexport const f = Effect.fn(\"f\")(\n  // the doc\n  function*() {\n    return 1\n  },\n  // retry it\n  Effect.retry({ times: 2 })\n)\n"
    const back = toEffectScript(ts).code
    expect(back).toBe(
      "// the doc\nexport effect f() {\n    return 1\n  }\n  // retry it\n  |> retry({ times: 2 })\n"
    )
  })

  it("ignores commas inside comments between fields (review I9)", () => {
    const ts =
      "import * as Schema from \"effect/Schema\"\nclass A extends Schema.Class<A>(\"A\")({ a: Schema.String /* x, y */, b: Schema.Number }) {}\n"
    expect(toEffectScript(ts).code).toBe("schema A { a: string /* x, y */; b: number }\n")
  })

  it("throws only for error declarations; other yieldable errors stay awaited", () => {
    const ts =
      "import * as Data from \"effect/Data\"\nimport * as Effect from \"effect/Effect\"\nclass E extends Data.TaggedError(\"E\")<{}> {}\nexport const f = Effect.fn(\"f\")(function*() {\n  return yield* new E()\n})\n"
    const back = toEffectScript(ts).code
    expect(back).toContain("return await new E()")
    expect(toTypeScript(back).code).toBe(ts)
  })

  it("never re-sugars a user object named Effect", () => {
    const ts =
      "const Effect = { fn: (_: string) => (f: unknown) => f }\nexport const f = Effect.fn(\"f\")(function*() { return 1 })\n"
    expect(toEffectScript(ts).code).toBe(ts)
  })

  it("recognizes an aliased import and explains near misses", () => {
    const source =
      "import { Effect as E } from \"effect\"\nexport const g = E.fn(\"other\")(function*() { return 1 })\n"
    const result = toEffectScript(source)
    expect(result.code).toBe(source)
    expect(result.notes.map((n) => n.message).join("\n")).toMatch(/span name/)
  })
})
