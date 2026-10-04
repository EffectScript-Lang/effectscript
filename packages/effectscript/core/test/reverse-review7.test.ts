import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"
import { expectSafe } from "./utils/reverse.ts"

const head =
  "import * as Clock from \"effect/Clock\"\nimport * as Config from \"effect/Config\"\nimport * as Effect from \"effect/Effect\"\nimport * as Layer from \"effect/Layer\"\nimport * as Atom from \"effect/reactivity/Atom\"\nimport * as Command from \"effect/cli/Command\"\nimport * as Flag from \"effect/cli/Flag\"\nimport * as HttpApiEndpoint from \"effect/http-api/HttpApiEndpoint\"\nimport * as HttpApiGroup from \"effect/http-api/HttpApiGroup\"\nimport { describe, it } from \"@effect/vitest\"\ndeclare const n: Effect.Effect<number>\ndeclare const A: Layer.Layer<never>\ndeclare const B: Layer.Layer<never>\n"

describe("Plan 7 final review", () => {
  it.each([
    [
      "C1 ambient parens across a line break",
      "export const f = Effect.gen(function*() {\n  return (\n    yield* Clock.currentTimeMillis\n  ) * 2\n})\n"
    ],
    [
      "C1 await parens across a line break",
      "export const f = Effect.gen(function*() {\n  return (\n    yield* n\n  ) * 2\n})\n"
    ],
    ["I4 config with a semicolon", "export const C = Config.all({ port: Config.Port(\"PORT\") });\n"],
    ["I4 layer with a semicolon", "export const L = Layer.mergeAll(A, B);\n"],
    ["I4 atom with a semicolon", "export const a = Atom.make(0);\n"],
    [
      "I4 command with a semicolon",
      "export const c = Command.make(\"c\", {}, Effect.fn(\"c\")(function*() {\n  return 1\n}));\n"
    ],
    [
      "I5 single-quoted env name",
      "export const f = Effect.gen(function*() {\n  return yield* Config.String('A').pipe(Config.withDefault(undefined))\n})\n"
    ],
    [
      "I5 single-quoted endpoint",
      "export class G extends HttpApiGroup.make('g').add(\n  HttpApiEndpoint.get('one', '/')\n) {}\n"
    ],
    [
      "I5 single-quoted command",
      "export const c = Command.make('c', {}, Effect.fn('c')(function*() {\n  return 1\n}))\n"
    ],
    [
      "I6 struct payload",
      "export class G extends HttpApiGroup.make(\"g\").add(\n  HttpApiEndpoint.post(\"one\", \"/\", { payload: Schema.Struct({ a: Schema.String }) })\n) {}\n"
    ],
    [
      "I6 union error",
      "export class G extends HttpApiGroup.make(\"g\").add(\n  HttpApiEndpoint.get(\"one\", \"/\", { error: Schema.Union([Schema.String, Schema.Number]) })\n) {}\n"
    ],
    [
      "M8 a hole in Config.Literals",
      "export const C = Config.all({ mode: Config.Literals([\"a\", , \"b\"] as any, \"MODE\") })\n"
    ],
    [
      "M8 a hole in Flag.Literals",
      "export const c = Command.make(\"c\", { mode: Flag.Literals(\"mode\", [\"a\", , \"b\"] as any) }, Effect.fn(\"c\")(function*({ mode }) {\n  return mode\n}))\n"
    ],
    [
      "M9 layer operand in the Layer namespace",
      "export const L = Layer.mergeAll(A, Layer.succeedContext(Context.empty()))\n"
    ]
  ])("%s", (name, body) => {
    const ts = `${head}import * as Context from "effect/Context"\nimport * as Schema from "effect/Schema"\n${body}`
    const back = expectSafe(ts)
    // these shapes must re-sugar, not just stay TypeScript
    const converted: Record<string, RegExp> = {
      "I4 config with a semicolon": /^export config C/m,
      "I4 layer with a semicolon": /^export layer L/m,
      "I4 atom with a semicolon": /^export atom a/m,
      "I4 command with a semicolon": /^export command c/m,
      // the forward compiler writes `Config.String("A")`, so the read stays; its generator still converts
      "I5 single-quoted env name": /await Config\.String\('A'\)/,
      "M9 layer operand in the Layer namespace": /^export layer L/m
    }
    if (converted[name] !== undefined) expect(back.code).toMatch(converted[name]!)
  })

  it("I3 tests inside it.layer use the callback's it", () => {
    const ts =
      `${head}it.layer(A)("suite", (it) => {\n  it.effect("a", () => Effect.gen(function*() {\n    return 1\n  }))\n})\n`
    // the outer `it.layer` has no EffectScript form at the top level; its tests stay calls on the
    // callback's `it`, and the generator inside still converts
    expect(expectSafe(ts).code).toContain("it.effect(\"a\", () => effect {")
  })

  it("M8 never throws: a failure returns the source with a note", () => {
    const ts = `${head}export const f = Effect.gen(function*() {\n  return 1\n})\n`
    expect(() => toEffectScript(ts)).not.toThrow()
  })

  it("I7 impl returns stop at nested effect blocks (forward)", () => {
    const { code } = toTypeScript(
      "group UsersApi {\n  get one \"/\": number\n}\napi Api { UsersApi }\nexport const H = impl Api.users {\n  const n = await effect {\n    return 1\n  }\n  return { one: () => succeed(n) }\n}\n"
    )
    expect(code).toContain("return 1\n")
    expect(code).not.toContain("handleAll(1)")
  })
})

describe("Plan 7 final review: fallback cost (I2)", () => {
  it("isolates a failing statement in a large file without re-converting it per statement", () => {
    const lines = [
      "import { Config, Effect } from \"effect\"",
      // a default that doesn't compile back the same way: this statement falls back
      "export const C = Config.all({ a: Config.String(\"A\").pipe(Config.withDefault((1, \"a\"))) })"
    ]
    for (let i = 0; i < 400; i++) lines.push(`export const f${i} = Effect.gen(function*() {\n  return ${i}\n})`)
    const start = performance.now()
    const back = toEffectScript(`${lines.join("\n")}\n`)
    const elapsed = performance.now() - start
    expect(back.code).toContain("export const f399 = effect {")
    expect(back.notes.filter((n) => n.message.includes("doesn't compile back"))).toHaveLength(1)
    // one conversion per statement took ~7 s here; bisection takes well under a second
    expect(elapsed).toBeLessThan(3000)
  })
})
