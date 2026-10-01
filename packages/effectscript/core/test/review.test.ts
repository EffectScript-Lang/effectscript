import { toTypeScript } from "effectscript/compiler"
import * as ts from "typescript"
import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

const compile = (source: string, options: Parameters<typeof toTypeScript>[1] = {}): string => {
  const result = toTypeScript(source, options)
  const errors = result.diagnostics.filter((d) => d.severity === "error")
  if (errors.length > 0) throw new Error(errors.map((d) => `${d.code} ${d.message}`).join("\n"))
  return result.code
}

/** The output must at least be syntactically valid TypeScript. */
const syntaxErrors = (code: string): Array<string> => {
  const file = ts.createSourceFile("out.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  return ((file as unknown as { parseDiagnostics: Array<ts.Diagnostic> }).parseDiagnostics ?? []).map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, "\n")
  )
}

describe("C1: closers at shared offsets", () => {
  it.each([
    ["const r = effect () => !await x\n", "{ return !(yield* x) })"],
    ["const n = effect (x: number) => x |> Effect.succeed\n", "{ return pipe(x, Effect.succeed) })"],
    ["const f = effect () => effect { return 1 }\n", "{ return Effect.gen(function*() { return 1 }) })"]
  ])("%s", (source, expected) => {
    const code = compile(source)
    expect(code).toContain(expected)
    expect(syntaxErrors(code)).toEqual([])
  })

  it("service-tag suffix stays inside the yield* parentheses", () => {
    const code = compile("effect f(fb: unknown) {\n  return await Path ?? fb\n}\n")
    expect(code).toContain("(yield* Path.Path) ?? fb")
  })
})

describe("C2: pipelines and parentheses", () => {
  it.each([
    ["const a = (x + y) |> String\n", "const a = pipe((x + y), String)"],
    ["const b = x |> (% + 1)\n", "const b = (x + 1)"],
    ["const c = [1, 2] |> ((xs) => xs.length)\n", "const c = pipe([1, 2], ((xs) => xs.length))"]
  ])("%s", (source, expected) => {
    const code = compile(source)
    expect(code).toContain(expected)
    expect(syntaxErrors(code)).toEqual([])
  })

  it("chained Hack steps compile without throwing", () => {
    const code = compile("const v = x |> f(%) |> g(%)\n")
    expect(syntaxErrors(code)).toEqual([])
    expect(code).toContain("f(x)")
  })

  it("do-expression completion does not leak into an inlined topic", () => {
    const code = compile("const v = do {\n  x |> f(%)\n}\n")
    expect(code).toContain("return f(x)")
    expect(syntaxErrors(code)).toEqual([])
  })
})

describe("C3: Hack inlining preserves evaluation", () => {
  it("does not inline into nested functions or short-circuit branches", () => {
    expect(compile("const a = getX() |> [1, 2].map((y) => y + %)\n")).not.toContain("y + getX()")
    expect(compile("const b = getX() |> ok && f(%)\n")).not.toContain("ok && f(getX())")
  })
})

describe("C4: match bindings are scoped", () => {
  it("does not rewrite arm bindings to Effect builtins", () => {
    const code = compile(
      "declare const job: { _tag: \"Done\"; result: number } | { _tag: \"Failed\"; timeout: number }\n" +
        "const v = match (job) {\n  when Done(result): result\n  when Failed({ timeout }): timeout\n}\n"
    )
    expect(code).not.toContain("Effect.result")
    expect(code).not.toContain("Effect.timeout")
  })
})

describe("I1: untyped catch does not catch errors raised by typed clauses", () => {
  it("passes the untyped clause as orElse", async () => {
    const mod = await runCompiled(`
      import { Data, Effect, Exit } from "effect"
      class NotFound extends Data.TaggedError("NotFound")<{}> {}
      class Fatal extends Data.TaggedError("Fatal")<{}> {}
      effect run() {
        try {
          return await Effect.fail(new NotFound())
        } catch (e: NotFound) {
          throw new Fatal()
        } catch (e) {
          return "swallowed"
        }
      }
      export const failed = Exit.isFailure(Effect.runSyncExit(run()))
    `)
    expect(mod.failed).toBe(true)
  })
})

describe("I2: generated imports and type-only imports", () => {
  it("upgrades a type-only import instead of duplicating it", () => {
    const code = compile("import type { Effect } from \"effect\"\nexport const p = effect { return 1 }\n")
    expect(code.match(/from "effect"/g)).toHaveLength(1)
    expect(code).toContain("import { Effect } from \"effect\"")
  })

  it("upgrades an inline type specifier", () => {
    const code = compile("import { type Effect, type Option } from \"effect\"\nexport const p = effect { return 1 }\n")
    expect(code).toContain("import { Effect, type Option } from \"effect\"")
  })

  it("aliases pipe when it is shadowed", () => {
    const code = compile("export const f = (pipe: string) => pipe.length |> String\n")
    expect(code).toContain("import { pipe as pipe$ } from \"effect\"")
    expect(code).toContain("pipe$(pipe.length, String)")
  })
})

describe("I3: superset", () => {
  it.each([
    "declare const effect: (n: number) => number\ndeclare const flag: boolean\nexport const a = flag ? effect(1) : (n: number) => n\n",
    "declare const defer: (s: TemplateStringsArray) => void\ndefer`x`\n",
    "declare const error: unknown\nerror as Error\n",
    "declare const effect: unknown\neffect satisfies unknown\n"
  ])("valid TS stays unchanged: %s", (source) => {
    const result = toTypeScript(source)
    expect(result.diagnostics).toEqual([])
    expect(result.code).toBe(source)
  })
})

describe("I4: accessors with destructured parameters", () => {
  it("forwards generated argument names", () => {
    const code = compile("service S {\n  effect find({ id }: { id: string }, ...rest: Array<number>): string\n}\n")
    expect(code).toContain(
      "static readonly find = (_a0: { id: string }, ...rest: Array<number>) => S.use((_) => _.find(_a0, ...rest))"
    )
  })
})

describe("I5: the compiler never throws", () => {
  it("reports untyped ADT fields as EFX3004", () => {
    const result = toTypeScript("schema Bad = | Circle { radius }\n")
    expect(result.diagnostics.map((d) => d.code)).toContain("EFX3004")
  })
})

describe("I6: comments survive alias and ADT schemas", () => {
  it("keeps variant and field comments", () => {
    const code = compile(
      "schema Shape =\n  // a round one\n  | Circle { radius: number }\n  /** four sides */\n  | Square { side: number }\n" +
        "schema Point = {\n  // horizontal\n  x: number\n  y: number\n}\n"
    )
    expect(code).toContain("// a round one")
    expect(code).toContain("/** four sides */")
    expect(code).toContain("// horizontal")
  })
})

describe("D02: catch clauses are visited once", () => {
  it("builtins inside a single catch are qualified once (effect code)", () => {
    const code = compile("effect f() {\n  try { return await succeed(1) } catch { return await succeed(2) }\n}\n")
    expect(code).not.toContain("Effect.Effect.")
  })

  it("builtins inside a plain top-level catch are qualified once", () => {
    const code = compile("try { x() } catch { log(\"x\") }\n")
    expect(code).toContain("Effect.log(\"x\")")
    expect(code).not.toContain("Effect.Effect.")
  })
})

describe("Plan 2 final review", () => {
  it("F1: EFX5002 also covers throw expressions and effectful do in a function stage", () => {
    const codes = (source: string) => toTypeScript(source).diagnostics.map((d) => d.code)
    expect(codes(
      "declare const obj: { m(n: number): number | undefined }\nerror E {}\neffect f(n: number) {\n  return n |> obj.m(%) ?? throw new E()\n}\n"
    )).toEqual(["EFX5002"])
  })

  it.each([
    ["declare const n: number\nexport const a = n |> % + 1 |> String(%)\n", "pipe(n + 1"],
    ["export const b = [1, 2] |> %.length |> String(%)\n", "pipe([1, 2].length"],
    ["export const c = \"x\" |> %.toUpperCase() |> %.length\n", "pipe(\"x\".toUpperCase()"]
  ])("F2: an inlined step that starts with the topic can be wrapped: %s", (source, expected) => {
    const code = compile(source)
    expect(code).toContain(expected)
    expect(syntaxErrors(code)).toEqual([])
  })

  it("F3: a parenthesized inner pipeline keeps its parentheses", () => {
    const code = compile("declare const g: (n: number) => number\ndeclare const n: number\nexport const v = (n |> g(%)) |> g(%)\n")
    expect(syntaxErrors(code)).toEqual([])
    expect(code).toContain("export const v = g((g(n)))")
  })

  it("F4: user identifiers inside rewritten syntax keep navigation", () => {
    const source =
      "error E { id: string }\nexport effect find(id: string) {\n  try {\n    throw new E({ id })\n  } catch (err: E) {\n    return err.id\n  }\n}\n" +
      "schema S =\n  | Circle { radius: number }\nexport const area = (s: S) => match (s) {\n  when Circle({ radius }): radius\n}\n"
    const { mappings } = toTypeScript(source)
    const covering = (offset: number) =>
      mappings.find((m) => m.sourceOffsets[0]! <= offset && offset < m.sourceOffsets[0]! + m.lengths[0]!)
    for (const needle of ["find(", "err: E", "{ radius }): "]) {
      const offset = source.indexOf(needle) + (needle.startsWith("{") ? 2 : 0)
      expect(covering(offset)?.data.navigation, needle).toBe(true)
    }
  })

  it("F4: a one-character identifier followed by a closer keeps navigation", () => {
    const source = "export effect f(e: unknown) {\n  throw e\n}\n"
    const { mappings } = toTypeScript(source)
    const offset = source.indexOf("throw e") + 6
    const mapping = mappings.find((m) => m.sourceOffsets[0]! <= offset && offset < m.sourceOffsets[0]! + m.lengths[0]!)
    expect(mapping?.data.navigation).toBe(true)
  })

  it("F8: a nested try that returns on every path is not EFX2020", () => {
    const result = toTypeScript(
      "effect f(x: Effect.Effect<number>) {\n  try {\n    try {\n      return await x\n    } catch {\n      return 1\n    }\n  } catch {\n    return 2\n  }\n}\n"
    )
    expect(result.diagnostics).toEqual([])
  })
})
