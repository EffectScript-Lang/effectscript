import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

describe("ADR-0012: pipelines evaluate the head first", () => {
  it("a getter on the step runs after the head", async () => {
    const mod = await runCompiled(`
      export const trace: Array<string> = []
      const obj = { get method() { trace.push("getter"); return (x: number) => x + 1 } }
      const makeValue = () => { trace.push("head"); return 1 }
      export const value = makeValue() |> obj.method(%)
    `)
    expect(mod.trace).toEqual(["head", "getter"])
    expect(mod.value).toBe(2)
  })

  it("imported namespace calls and plain function calls are still inlined", () => {
    const { code } = toTypeScript(
      "import { Effect } from \"effect\"\ndeclare const f: (n: number) => number\nexport const v = x |> Effect.map(%, f)\nexport const w = 1 |> f(%)\n"
    )
    expect(code).toContain("export const v = Effect.map(x, f)")
    expect(code).toContain("export const w = f(1)")
    expect(toTypeScript("declare const g: <T>(t: T) => T\nexport const u = 1 |> g<number>(%)\n").code)
      .toContain("export const u = g<number>(1)")
  })

  it("F# stages follow Effect pipe order: head, make1, make2, apply1, apply2", async () => {
    const mod = await runCompiled(`
      export const trace: Array<string> = []
      const stage = (n: number) => { trace.push(\`make\${n}\`); return (x: number) => { trace.push(\`apply\${n}\`); return x + n } }
      const head = () => { trace.push("head"); return 0 }
      export const value = head() |> stage(1) |> stage(2)
    `)
    expect(mod.trace).toEqual(["head", "make1", "make2", "apply1", "apply2"])
    expect(mod.value).toBe(3)
  })

  it("a call to a local effect declaration with declaration pipes is not assumed pipeable", () => {
    const { code } = toTypeScript("effect f() { return 1 } |> Effect.runSync\nexport const v = f() |> String\n")
    expect(code).toContain("pipe(f(), String)")
  })
})

describe("multi-line pipelines after an effect block (Plan 6 Task 4)", () => {
  it("closes the block before `.pipe(` when `|>` starts a line", () => {
    const { code, diagnostics } = toTypeScript(
      "export const p = effect {\n  return 1\n}\n  // why\n  |> retry({ times: 2 })\n  |> orDie\n"
    )
    expect(diagnostics).toEqual([])
    expect(code).toContain(
      "export const p = Effect.gen(function*() {\n  return 1\n}).pipe(\n  // why\n  Effect.retry({ times: 2 }),\n  Effect.orDie)\n"
    )
  })
})
