import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

const roundTrip = (ts: string) => {
  const back = toEffectScript(ts).code
  expect(toTypeScript(back).code).toBe(ts)
  return back
}

describe("reverse: types, service tags and prelude imports (Plan 6 Task 3)", () => {
  it("writes bare types and drops the imports the prelude restores", () => {
    const ts =
      "import * as Effect from \"effect/Effect\"\nimport * as Option from \"effect/Option\"\nexport const f = (o: Option.Option<string>): Effect.Effect<number> => Effect.succeed(o.length)\n"
    expect(roundTrip(ts)).toBe("export const f = (o: Option<string>): Effect<number> => succeed(o.length)\n")
  })

  it("awaits bare service tags", () => {
    const ts =
      "import * as Effect from \"effect/Effect\"\nimport * as FileSystem from \"effect/FileSystem\"\nexport const read = Effect.fn(\"read\")(function*(path: string) {\n  const fs = yield* FileSystem.FileSystem\n  return yield* fs.readFileString(path)\n})\n"
    expect(roundTrip(ts)).toContain("const fs = await FileSystem\n")
  })

  it("keeps qualified types when the import must stay", () => {
    const ts =
      "import \"./polyfill\"\nimport * as Effect from \"effect/Effect\"\nexport const f = (): Effect.Effect<number> => Effect.succeed(1)\n"
    const back = roundTrip(ts)
    expect(back).toContain("import * as Effect from \"effect/Effect\"")
    expect(back).toContain("Effect.Effect<number>")
  })

  it("keeps a builtin qualified when its name is bound locally", () => {
    const ts =
      "import * as Effect from \"effect/Effect\"\nconst succeed = 1\nexport const f = Effect.succeed(succeed)\n"
    expect(roundTrip(ts)).toContain("Effect.succeed(succeed)")
  })

  it("leaves a type named like a bare type alone when it is a local declaration", () => {
    const ts =
      "import * as Effect from \"effect/Effect\"\ntype Option = string\nexport const f = (o: Option): Effect.Effect<Option> => Effect.succeed(o)\n"
    const back = roundTrip(ts)
    expect(back).toContain("(o: Option): Effect<Option>")
  })
})
