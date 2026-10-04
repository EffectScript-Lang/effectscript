import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

const head = "import * as Effect from \"effect/Effect\"\ndeclare const close: Effect.Effect<void>\n"

const convert = (body: string) => {
  const ts = `${head}${body}`
  const back = toEffectScript(ts).code
  expect(toTypeScript(back).code).toBe(ts)
  return back.replace(/^[\s\S]*?declare const close: .*\n/, "")
}

describe("reverse: resources (Plan 6 Task 5)", () => {
  it.each([
    [
      "an expression finalizer in a scoped declaration",
      "export const f = Effect.fn(\"f\")(function*() {\n  yield* Effect.addFinalizer(() => close)\n  return 1\n}, Effect.scoped)\n",
      "export effect f() {\n  defer close\n  return 1\n}\n"
    ],
    [
      "a sync block finalizer, other pipes kept",
      "export const f = Effect.fn(\"f\")(function*() {\n  yield* Effect.addFinalizer(() => Effect.sync(() => {\n    globalThis.console.info(\"bye\")\n  }))\n  return 1\n}, Effect.scoped, Effect.orDie)\n",
      "export effect f() {\n  defer {\n    globalThis.console.info(\"bye\")\n  }\n  return 1\n} |> orDie\n"
    ],
    [
      "an effectful block finalizer",
      "export const f = Effect.fn(\"f\")(function*() {\n  yield* Effect.addFinalizer(() => Effect.gen(function*() {\n    yield* close\n  }))\n  return 1\n}, Effect.scoped)\n",
      "export effect f() {\n  defer {\n    await close\n  }\n  return 1\n}\n"
    ],
    [
      "a scoped block",
      "export const b = Effect.scoped(Effect.gen(function*() {\n  yield* Effect.addFinalizer(() => close)\n  return 2\n}))\n",
      "export const b = effect {\n  defer close\n  return 2\n}\n"
    ],
    [
      "a scoped arrow",
      "export const a = Effect.fnUntraced(function*(n: number) {\n  yield* Effect.addFinalizer(() => close)\n  return n\n}, Effect.scoped)\n",
      "export const a = effect (n: number) => {\n  defer close\n  return n\n}\n"
    ]
  ])("%s", (_name, body, expected) => {
    expect(convert(body)).toBe(expected)
  })

  it("keeps a finalizer that has no scope added by the forward compiler", () => {
    const result = convert(
      "export const f = Effect.fn(\"f\")(function*() {\n  yield* Effect.addFinalizer(() => close)\n  return 1\n})\n"
    )
    expect(result).toBe("export effect f() {\n  await addFinalizer(() => close)\n  return 1\n}\n")
  })

  it("keeps an explicit scope when nothing becomes defer", () => {
    expect(convert("export const f = Effect.fn(\"f\")(function*() {\n  return 1\n}, Effect.scoped)\n")).toBe(
      "export effect f() {\n  return 1\n} |> scoped\n"
    )
  })
})
