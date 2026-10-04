import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

// The forward compiler is the oracle: compile EffectScript, convert back, expect the same text.
const roundTrip = (efx: string) => {
  const ts = toTypeScript(efx).code
  const back = toEffectScript(ts).code
  expect(toTypeScript(back).code).toBe(ts)
  return back
}

describe("reverse: schema forms (Plan 6 Task 7)", () => {
  it.each([
    ["a tagged class", "schema Event {\n  _tag: \"Event\"\n  at: Date\n  payload: Record<string, unknown>\n}\n"],
    [
      "an error whose tag differs, with a getter",
      "error Timeout {\n  _tag: \"RequestTimeout\"\n  ms: number\n  get summary() { return `timed out after ${this.ms}ms` }\n}\n"
    ],
    ["an alias", "export schema Point = { x: number; y: number }\n"],
    ["a branded alias", "schema UserId = string & Brand<\"UserId\">\n"],
    ["an ADT", "export schema Shape =\n  | Circle { radius: number }\n  | Square { side: number }\n"],
    [
      "a class with a schema field and a getter",
      "export schema User {\n  name: string\n  age = Int.check(isGreaterThan(0))\n  get label() {\n    return `${this.name}`\n  }\n}\n"
    ]
  ])("%s", (_name, efx) => {
    expect(roundTrip(efx)).toBe(efx)
  })

  it("keeps a class with an instance property as TypeScript", () => {
    const ts =
      "import * as Schema from \"effect/Schema\"\nexport class A extends Schema.Class<A>(\"A\")({ a: Schema.String }) {\n  readonly cache = new Map()\n}\n"
    const result = toEffectScript(ts)
    expect(result.code).toBe(ts)
    expect(result.notes.map((n) => n.message).join("\n")).toMatch(/instance property/)
  })

  it("keeps an alias whose type alias doesn't match", () => {
    const ts =
      "import * as Schema from \"effect/Schema\"\nexport const P = Schema.Struct({ x: Schema.Number })\nexport type P = { x: number }\n"
    expect(toEffectScript(ts).code).toBe(ts)
  })
})
