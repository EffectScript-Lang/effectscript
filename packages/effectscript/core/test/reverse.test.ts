import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

const roundTrip = (efx: string) => toEffectScript(toTypeScript(efx).code).code

describe("ADR-0023: reverse compiler subset", () => {
  it.each([
    "export effect double(n: number): number {\n  const x = await succeed(n)\n  return x * 2\n}\n",
    "error NotFound { id: string }\n\nexport effect find(id: string): string throws NotFound {\n  if (id === \"\") throw new NotFound({ id })\n  return id\n}\n",
    "export schema User {\n  name: string\n  email?: string\n  tags: Array<string>\n}\n",
    "schema Point { x: number; y: number | null }\n",
    "export effect retried(n: number): number {\n  return n\n} |> retry({ times: 3 })\n"
  ])("round-trips %s", (efx) => {
    const back = roundTrip(efx)
    expect(back).toBe(efx)
    expect(roundTrip(back)).toBe(back) // fixed point
  })

  it("keeps unrelated TypeScript and imports that are still used", () => {
    const ts =
      "import { Effect } from \"effect\"\nexport const f = Effect.fn(\"f\")(function*() {\n  return 1\n})\nexport const run = Effect.runSync(f())\n"
    expect(toEffectScript(ts).code).toBe(
      "import { Effect } from \"effect\"\nexport effect f() {\n  return 1\n}\nexport const run = Effect.runSync(f())\n"
    )
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
