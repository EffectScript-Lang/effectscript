import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

const compile = (source: string) => {
  const result = toTypeScript(source)
  const errors = result.diagnostics.filter((d) => d.severity === "error")
  if (errors.length > 0) throw new Error(errors.map((d) => `${d.code} ${d.message}`).join("\n"))
  return result.code
}

describe("ADR-0009: generated references are hygienic", () => {
  it("a module binding named Effect does not capture Effect.fn", async () => {
    const mod = await runCompiled(`
      import { Effect as Fx } from "effect"
      const Effect = { fn: () => () => "wrong" }
      export effect f() { return 1 }
      export const value = Fx.runSync(f())
      export const user = Effect.fn()()
    `)
    expect(mod.value).toBe(1)
    expect(mod.user).toBe("wrong")
  })

  it("reuses an aliased verified import", () => {
    const code = compile("import { Effect as E } from \"effect\"\nexport effect f() { return 1 }\n")
    expect(code).toContain("const f = E.fn(\"f\")")
    expect(code).not.toContain("import { Effect }")
  })

  it("upgrades a verified type-only import", () => {
    const code = compile("import type { Effect } from \"effect\"\nexport effect f(): number { return 1 }\n")
    expect(code).toContain("import { Effect } from \"effect\"")
    expect(code).toContain("Effect.fn(\"f\")")
  })

  it("a parameter named Effect does not capture the inner Effect.gen", async () => {
    const mod = await runCompiled(`
      import { Effect as Fx } from "effect"
      export effect f(Effect: unknown) {
        return await effect { return 1 }
      }
      export const value = Fx.runSync(f("shadow"))
    `)
    expect(mod.value).toBe(1)
  })

  it("aliases Schema, Match, Context and pipe when shadowed", () => {
    const code = compile(
      "const Schema = 1\nconst Match = 2\nconst Context = 3\nconst pipe = 4\n" +
        "schema P { x: number }\nservice S { effect m(): void }\n" +
        "export const m = (v: \"a\" | \"b\") => match (v) { when \"a\": 1; default: 2 }\n" +
        "export const p = 1 |> String\n"
    )
    for (const name of ["Context", "Match", "Schema", "pipe"]) expect(code).toContain(`${name} as ${name}$`)
    expect(code).toContain("extends Schema$.Class<P>")
    expect(code).toContain("extends Context$.Service<S,")
    expect(code).toContain("Match$.value(v)")
    expect(code).toContain("pipe$(1, String)")
  })

  it("a free user reference and a shadowed compiler reference coexist", () => {
    const code = compile(
      "export const a = Effect.succeed(1)\nexport const g = (Effect: number) => effect { return Effect }\n"
    )
    expect(code).toContain("import { Effect, Effect as Effect$ } from \"effect\"")
    expect(code).toContain("export const a = Effect.succeed(1)")
    expect(code).toContain("Effect$.gen(function*() { return Effect })")
  })

  it("pipeline topic parameters never capture user names", () => {
    const code = compile("declare const $: number\nexport const v = 1 |> [%, %, $]\n")
    expect(code).not.toContain("($) =>")
    expect(code).toMatch(/\((\$\d+)\) => \[\1, \1, \$\]/)
  })

  it("the runtime import is aliased when a NodeRuntime binding exists", () => {
    const code = compile("const NodeRuntime = 1\nmain {\n  await log(\"hi\")\n}\n")
    expect(code).toContain("NodeRuntime as NodeRuntime$")
    expect(code).toContain("NodeRuntime$.runMain(")
  })
})
