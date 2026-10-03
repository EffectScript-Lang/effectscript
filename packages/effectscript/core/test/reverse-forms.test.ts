import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

const head = "import { Effect } from \"effect\"\ndeclare const task: Effect.Effect<number>\n"

/** Converts `body` (after the shared head) and checks the ADR-0030 round trip. */
const convert = (body: string) => {
  const ts = `${head}${body}`
  const back = toEffectScript(ts)
  const again = toTypeScript(back.code)
  expect(again.diagnostics.filter((d) => d.severity === "error")).toEqual([])
  const rest = back.code.replace(/^[\s\S]*?declare const task: .*\n/, "")
  return { code: rest, notes: back.notes.map((n) => n.message), again: again.code, ts }
}

describe("reverse: effect forms (Plan 6 Task 2)", () => {
  it.each([
    [
      "Effect.gen",
      "export const p = Effect.gen(function*() {\n  return yield* task\n})\n",
      "export const p = effect {\n  return await task\n}\n"
    ],
    [
      "Effect.gen with self",
      "class C {\n  n = 1\n  readonly get = Effect.gen({ self: this }, function*() {\n    return this.n\n  })\n}\n",
      "class C {\n  n = 1\n  readonly get = effect {\n    return this.n\n  }\n}\n"
    ],
    [
      "fnUntraced block",
      "export const f = Effect.fnUntraced(function*(n: number) {\n  return n + (yield* task)\n})\n",
      "export const f = effect (n: number) => {\n  return n + await task\n}\n"
    ],
    [
      "fnUntraced expression",
      "export const f = Effect.fnUntraced(function*(n: number) { return (yield* task) + n })\n",
      "export const f = effect (n: number) => await task + n\n"
    ],
    [
      "fnUntraced return type",
      "export const f = Effect.fnUntraced(function*(s: string): Effect.fn.Return<string, never> { return s.trim() })\n",
      "export const f = effect (s: string): string throws never => s.trim()\n"
    ],
    [
      "object property",
      "export const api = {\n  fetch: Effect.fn(\"fetch\")(function*(id: string) {\n    return id.length + (yield* task)\n  })\n}\n",
      "export const api = {\n  effect fetch(id: string) {\n    return id.length + await task\n  }\n}\n"
    ],
    [
      "export default",
      "const main = Effect.fn(\"main\")(function*() {\n  return yield* task\n})\nexport default main\n",
      "export default effect main() {\n  return yield* task\n}\n".replace("yield*", "await")
    ],
    [
      "concurrent all",
      "export const both = Effect.gen(function*() {\n  const [a, b] = yield* Effect.all([task, task], { concurrency: \"unbounded\" })\n  return a + b\n})\n",
      "export const both = effect {\n  const [a, b] = await [task, task]\n  return a + b\n}\n"
    ],
    [
      "nested forms",
      "export const outer = Effect.fn(\"outer\")(function*() {\n  const inner = Effect.gen(function*() { return yield* task })\n  return yield* inner\n})\n",
      "export effect outer() {\n  const inner = effect { return await task }\n  return await inner\n}\n"
    ]
  ])("%s", (_name, body, expected) => {
    const result = convert(body)
    expect(result.code).toBe(expected)
    expect(result.again).toBe(result.ts)
  })

  it("throw expressions inside generators", () => {
    const ts =
      "import { Effect } from \"effect\"\ndeclare const find: (id: string) => Effect.Effect<string | undefined>\nexport const f = Effect.fn(\"f\")(function*(id: string) {\n  return (yield* find(id)) ?? (yield* Effect.fail(new Error(\"missing\")))\n})\n"
    const back = toEffectScript(ts).code
    expect(back).toContain("return await find(id) ?? throw new Error(\"missing\")")
    expect(toTypeScript(back).code).toBe(ts)
  })
})

describe("reverse: blockers (§6.3)", () => {
  it.each([
    [
      "a try statement",
      "export const f = Effect.gen(function*() {\n  try { return yield* task } catch { return 0 }\n})\n",
      /`try`/
    ],
    [
      "a plain yield",
      "export const f = Effect.gen(function*() {\n  yield task\n  return 1\n})\n",
      /`yield` without `\*`/
    ],
    [
      "arguments",
      "export const f = Effect.fn(\"f\")(function*() {\n  return arguments.length + (yield* task)\n})\n",
      /`arguments`/
    ],
    [
      "span options",
      "export const f = Effect.fn(\"f\", { attributes: { a: 1 } })(function*() {\n  return yield* task\n})\n",
      /span/
    ],
    [
      "this in fnUntraced",
      "export class C {\n  n = 1\n  f = Effect.fnUntraced(function*(this: C) {\n    return this.n\n  })\n}\n",
      /`this`/
    ],
    [
      "a using declaration",
      "export const f = Effect.gen(function*() {\n  using r = { [Symbol.dispose]() {} }\n  return yield* task\n})\n",
      /`using`/
    ],
    [
      "ambient console",
      "export const f = Effect.gen(function*() {\n  console.log(\"hi\")\n  return yield* task\n})\n",
      /captured/
    ],
    [
      "ambient Date.now",
      "export const f = Effect.gen(function*() {\n  return Date.now() + (yield* task)\n})\n",
      /captured/
    ]
  ])("%s stays TypeScript with a note", (_name, body, note) => {
    const result = convert(body)
    expect(result.code).toBe(body)
    expect(result.notes.join("\n")).toMatch(note)
  })

  it("converts generators nested inside a blocked one", () => {
    const body =
      "export const f = Effect.gen(function*() {\n  yield task\n  const g = Effect.gen(function*() { return yield* task })\n  return yield* g\n})\n"
    const result = convert(body)
    expect(result.code).toContain("const g = effect { return await task }")
    expect(result.code).toContain("yield task")
    expect(result.again).toBe(result.ts)
  })
})

describe("reverse: a multi-line effect arrow (Plan 18 Task 4)", () => {
  it.each([
    "export const f = effect () =>\n  succeed(1)\n",
    "export const g = effect (n: number) =>\n    succeed(n)\n      |> map((x) => x + 1)\n",
    "export const h = effect (n: number) => succeed(n)\n"
  ])("round-trips %j", (source) => {
    const ts = toTypeScript(source, { filename: "a.efx" })
    expect(ts.diagnostics.filter((d) => d.severity === "error")).toEqual([])
    expect(toEffectScript(ts.code, { filename: "a.efx" }).code).toBe(source)
  })
})
