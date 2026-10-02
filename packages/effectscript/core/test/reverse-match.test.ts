import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

const head = `schema Shape =
  | Circle { radius: number }
  | Square { side: number }

declare const shape: Shape
declare const status: "active" | "banned" | "pending"
declare const scale: (n: number) => Effect<number>

`

const roundTrip = (efx: string) => {
  const ts = toTypeScript(`${head}${efx}`).code
  const back = toEffectScript(ts).code
  expect(toTypeScript(back).code).toBe(ts)
  return back.slice(back.indexOf("declare const scale")).replace(/^declare const scale: .*\n\n/, "")
}

describe("reverse: match (Plan 6 Task 9)", () => {
  it.each([
    [
      "tags, multi-line",
      "export const area = match (shape) {\n  when Circle({ radius }): Math.PI * radius ** 2\n  when Square({ side }): side ** 2\n}\n"
    ],
    ["tags, inline", "export const kind = match (shape) { when Circle: \"c\"; when Square(s): s.side }\n"],
    [
      "values with a default, inline",
      "export const label = match (status) { when \"active\": \"✓\"; when \"banned\": \"✗\"; default: \"?\" }\n"
    ],
    [
      "values, exhaustive, multi-line",
      "export const code = match (status) {\n  when \"active\": 1\n  when \"banned\": 2\n  when \"pending\": 3\n}\n"
    ],
    [
      "effectful arms",
      "export effect scaled() {\n  return match (shape) {\n    when Circle(c): await scale(c.radius)\n    when Square: 0\n  }\n}\n"
    ],
    [
      "a comment inside an arm",
      "export const area = match (shape) {\n  when Circle({ radius }): radius // the radius\n  when Square({ side }): side\n}\n"
    ]
  ])("%s", (_name, efx) => {
    expect(roundTrip(efx)).toBe(efx)
  })

  it("keeps a predicate arm as TypeScript", () => {
    const ts =
      "import { Match } from \"effect\"\ndeclare const n: number\nexport const sign = Match.value(n).pipe(Match.when((x: number) => x > 0, () => \"+\"), Match.orElse(() => \"-\"))\n"
    expect(toEffectScript(ts).code).toBe(ts)
  })
})
