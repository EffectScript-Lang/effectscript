import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"
import { tokensAndComments } from "./utils/tokens.ts"

/**
 * ADR-0030 on the Plan 6 final review's inputs: the EffectScript compiles, and back to the same
 * tokens and comments. Each input once produced efx that failed to parse or meant something else.
 */
const expectSafe = (ts: string, options: { runtime?: "node" | "browser" } = {}) => {
  const back = toEffectScript(ts, options)
  const again = toTypeScript(back.code, options)
  expect(again.diagnostics.filter((d) => d.severity === "error")).toEqual([])
  const before = tokensAndComments(ts)
  const after = tokensAndComments(again.code)
  expect(after.tokens.join(" ")).toBe(before.tokens.join(" "))
  expect(after.comments).toEqual(before.comments)
  return back
}

/** The shape itself is handled (it converts or stays TypeScript), without the guard's fallback. */
const fallbacks = (back: { readonly notes: ReadonlyArray<{ readonly message: string }> }) =>
  back.notes.filter((n) => n.message.includes("doesn't compile back"))

const effect = "import { Effect, Layer, Match, Schema, pipe } from \"effect\"\n"
const decls =
  "declare const c: boolean\nlet x = 0\ndeclare const f: (a: unknown) => unknown\ndeclare const a: Effect.Effect<number>\n"

describe("Plan 6 final review: reverse output always compiles back (ADR-0030)", () => {
  it.each([
    ["C1 conditional pipe head", "export const p = pipe(c ? 1 : 2, String)\n"],
    ["C1 assignment pipe head", "export const p = () => pipe(x = 1, String)\n"],
    ["C1 await pipe head", "export const p = async () => pipe(await 1, String)\n"],
    ["C1 array head after a line without semicolon", "const n = 1\npipe([1, 2], f)\n"],
    ["C1 parenthesized head", "export const p = pipe((1), f)\n"],
    ["C1 object head statement", "pipe({ a: 1 }, f)\n"],
    ["C1 arrow head", "export const p = pipe(() => 1, f)\n"],
    ["C1 as head", "export const p = pipe(1 as any, f)\n"],
    [
      "C2 pipe inside a dropped paren",
      "export const p = Effect.gen(function*() {\n  const n = 1 + (yield* pipe(a, Effect.map((n) => n)))\n  return n\n})\n"
    ],
    [
      "C3 literal of an identifier",
      "const KIND = \"a\"\nconst X = Schema.Literal(KIND)\ntype X = typeof X.Type\nexport { X }\n"
    ],
    [
      "C3 literals with an identifier",
      "const KIND = \"a\"\nconst X = Schema.Literals([KIND, \"b\"])\ntype X = typeof X.Type\nexport { X }\n"
    ],
    [
      "C4 brand on a union",
      "const X = Schema.Union([Schema.String, Schema.Number]).pipe(Schema.brand(\"X\"))\ntype X = typeof X.Type\nexport { X }\n"
    ],
    [
      "C5 throw of a sequence",
      "export const p = Effect.gen(function*() {\n  if (x > 1) throw (x++, new Error(\"y\"))\n  return 1\n})\n"
    ],
    [
      "C6 conditional main pipe",
      "NodeRuntime.runMain(Effect.gen(function*() {\n  yield* a\n}).pipe(c ? Effect.orDie : Effect.orDie, Effect.provide(NodeServices.layer)))\n"
    ],
    [
      "I7 arrow last step",
      "const g = Effect.gen(function*() { return 1 })\nexport const p = g.pipe(Effect.asVoid, (e) => e)\n"
    ],
    ["I7 arrow declaration pipe", "export const h = Effect.fn(\"h\")(function*() { return 1 }, (e) => e)\n"],
    [
      "I7 as step before another",
      "export const h = Effect.fn(\"h\")(function*() { return 1 }, Effect.asVoid as any, Effect.orDie)\n"
    ],
    ["I8 yield in a pipe head", "export const p = Effect.gen(function*() {\n  return pipe(yield* a, f)\n})\n"],
    ["I8 yield in a pipe step", "export const p = Effect.gen(function*() {\n  return pipe(1, f(yield* a))\n})\n"],
    ["I9 nested topic binder", "export const p = pipe(a, Effect.orDie, ($) => f([$, ($: number) => $]))\n"],
    ["I9 topic as a property name", "export const p = pipe(a, Effect.orDie, ($) => f({ $: $ }))\n"],
    [
      "I10 function type in a return type",
      "export const h = Effect.fn(\"h\")(function*(): Effect.fn.Return<() => void, Error> {\n  return () => {}\n})\n"
    ],
    [
      "I10 generator return type",
      "export const h = Effect.fn(\"h\")(function*(): Generator<never, number, never> {\n  return 1\n})\n"
    ],
    [
      "I11 mismatched type argument",
      "class B {}\nexport class A extends Schema.Class<B>(\"A\")({ a: Schema.String }) {}\n"
    ],
    ["I11 abstract class", "export abstract class A extends Schema.Class<A>(\"A\")({ a: Schema.String }) {}\n"],
    [
      "I11 implements",
      "interface I {}\nexport class A extends Schema.Class<A>(\"A\")({ a: Schema.String }) implements I {}\n"
    ],
    ["I11 export default", "export default class A extends Schema.Class<A>(\"A\")({ a: Schema.String }) {}\n"],
    [
      "I11 comment before the body",
      "export class A extends Schema.Class<A>(\"A\")({\n  a: Schema.String\n}) /* c */ {\n  get b() { return 1 }\n}\n"
    ],
    [
      "I12 scoped declaration called as a statement",
      "const s = Effect.fn(\"s\")(function*() {\n  yield* Effect.addFinalizer(() => Effect.void)\n  return 1\n}, Effect.scoped)\nexport const p = Effect.gen(function*() {\n  s()\n  return 1\n})\nexport const q = pipe(s(), Effect.orDie)\n"
    ],
    [
      "I13 comment in a match arm",
      "declare const k: { _tag: \"A\" } | { _tag: \"B\" }\nexport const m = Match.valueTags(k, { A: () => 1, B: /* b */ () => 0 })\n"
    ],
    [
      "I13 comment in a schema field",
      "export class A extends Schema.Class<A>(\"A\")({ a: /* c */ Schema.String }) {}\n"
    ],
    [
      "I13 comment in an alias",
      "const X = Schema.Struct({ a: Schema.String })\ntype X = /* c */ typeof X.Type\nexport { X }\n"
    ],
    [
      "I13 comment in type arguments",
      "export const h = Effect.fn(\"h\")(function*(): Effect.fn.Return</* c */ number> {\n  return 1\n})\n"
    ],
    ["I13 comment before a pipe head", "export const p = pipe(/* head */ 1, f)\n"],
    [
      "I13 comment in a failure",
      "export const h = Effect.fn(\"h\")(function*() {\n  return yield* Effect.fail(\n    new Error() // why\n  )\n})\n"
    ],
    [
      "I14 a tag named like a type keyword",
      "export const h = Effect.fn(\"h\")(function*() {\n  return yield* Effect.gen(function*() {\n    return 1\n  }).pipe(Effect.catchTag(\"string\", (e) => Effect.gen(function*() {\n    return 2\n  })))\n})\n"
    ],
    [
      "M17 comment before generator parameters",
      "export const u = Effect.fnUntraced(function* /* (c) */ (n: number) { return n })\n"
    ],
    [
      "M17 comment between function and star",
      "export const u = Effect.fnUntraced(function /* a*b */ *(n: number) { return n })\n"
    ]
  ])("%s", (_name, body) => {
    const imports = body.includes("NodeRuntime")
      ? "import { NodeRuntime, NodeServices } from \"@effect/platform-node\"\n"
      : ""
    expect(fallbacks(expectSafe(`${imports}${effect}${decls}${body}`))).toEqual([])
  })

  it("C6 conditional layer pipe", () => {
    const ts = toTypeScript(
      "service S {\n  effect f(): number\n  layer = effect {\n    return { f: effect () => 1 }\n  } |> Layer.orDie\n}\n"
    ).code
      .replace(".pipe(Layer.orDie)", ".pipe(true ? Layer.orDie : Layer.orDie)")
    expect(fallbacks(expectSafe(ts))).toEqual([])
  })

  it("converts the statements that verify when another one can't", () => {
    // a one-member union has no distinct EffectScript spelling (it comes back as the member)
    const back = expectSafe(
      `${effect}const X = Schema.Union([Schema.String])\ntype X = typeof X.Type\nexport { X }\nexport const g = Effect.gen(function*() {\n  return 1\n})\n`
    )
    expect(back.code).toContain("export const g = effect {")
    expect(back.code).toContain("Schema.Union([Schema.String])")
  })
})
