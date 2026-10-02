import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

const head =
  "import { Effect, pipe } from \"effect\"\ndeclare const name: (id: string) => Effect.Effect<string, Error>\n"

const convert = (body: string) => {
  const ts = `${head}${body}`
  const back = toEffectScript(ts).code
  expect(toTypeScript(back).code).toBe(ts)
  return back.replace(/^[\s\S]*?declare const name: .*\n/, "")
}

describe("reverse: pipelines (Plan 6 Task 4)", () => {
  it.each([
    [
      "an effect block head",
      "export const p = Effect.gen(function*() {\n  return yield* name(\"1\")\n}).pipe(Effect.retry({ times: 3 }), Effect.orElseSucceed(() => \"anonymous\"))\n",
      "export const p = effect {\n  return await name(\"1\")\n} |> retry({ times: 3 }) |> orElseSucceed(() => \"anonymous\")\n"
    ],
    [
      "a multi-line pipe on a known effect",
      "const load = Effect.fn(\"load\")(function*(id: string) {\n  return yield* name(id)\n})\nexport const p = load(\"2\").pipe(\n  Effect.timeout(\"1 second\"),\n  Effect.orDie)\n",
      "effect load(id: string) {\n  return await name(id)\n}\nexport const p = load(\"2\")\n  |> timeout(\"1 second\")\n  |> orDie\n"
    ],
    [
      "pipe() on an unknown head",
      "export const p = pipe(name(\"3\"), Effect.map((n) => n.length))\n",
      "export const p = name(\"3\") |> map((n) => n.length)\n"
    ],
    [
      "a later function step becomes a topic step",
      "const load = Effect.fn(\"load\")(function*(id: string) {\n  return yield* name(id)\n})\nexport const p = load(\"5\").pipe(Effect.orDie, ($) => Effect.map($, (s) => s.length), Effect.asVoid)\n",
      "effect load(id: string) {\n  return await name(id)\n}\nexport const p = load(\"5\") |> orDie |> map(%, (s) => s.length) |> asVoid\n"
    ]
  ])("%s", (_name, body, expected) => {
    expect(convert(body)).toBe(expected)
  })

  it("keeps .pipe on values not known to be Effects", () => {
    const body =
      "import { Readable, Writable } from \"node:stream\"\ndeclare const r: Readable\ndeclare const w: Writable\nexport const piped = r.pipe(w)\n"
    expect(convert(body)).toBe(body)
  })

  it("keeps a pipe function that isn't Effect's", () => {
    const ts =
      "import { Effect } from \"effect\"\nconst pipe = (a: number, f: (n: number) => number) => f(a)\nexport const n = pipe(1, (x) => x + 1)\nexport const e = Effect.succeed(n)\n"
    expect(toEffectScript(ts).code).toContain("pipe(1, (x) => x + 1)")
  })

  it("keeps .pipe on an Effect.gen that stays TypeScript", () => {
    const body = "export const p = Effect.gen(function*() {\n  yield name(\"1\")\n}).pipe(Effect.orDie)\n"
    expect(convert(body)).toContain(").pipe(orDie)")
  })
})
