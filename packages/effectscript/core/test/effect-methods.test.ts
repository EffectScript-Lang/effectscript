import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

describe("effect methods (ADR-0065)", () => {
  it("run with this as the instance, in a span named after the class", async () => {
    const mod = await runCompiled(`
      import { Effect, Tracer } from "effect"
      schema User {
        name: string
        effect greet(greeting: string): string {
          const span = await Effect.currentSpan
          return \`\${greeting}, \${this.name} (\${span.name})\`
        }
      }
      export const result = await Effect.runPromise(new User({ name: "Ada" }).greet("hi"))
      export const equal = Equal.equals(new User({ name: "Ada" }), new User({ name: "Ada" }))
      import { Equal } from "effect"
    `)
    expect(mod.result).toBe("hi, Ada (User.greet)")
    // a prototype method, so schema instances stay plain data
    expect(mod.equal).toBe(true)
  }, 120_000)

  it("keeps a multi-line template literal's text when it indents the body", async () => {
    const mod = await runCompiled(`
      import { Effect } from "effect"
      class Report {
        effect render(): string {
          const text = \`line one
line two\`
          return text
        }
      }
      export const result = await Effect.runPromise(new Report().render())
    `)
    expect(mod.result).toBe("line one\nline two")
  }, 120_000)

  it("refuses a method without a body", () => {
    expect(toTypeScript("declare class A { effect m(): number }").diagnostics.map((d) => d.message)).toEqual([
      "An `effect` method needs a body"
    ])
  })

  it("converts back, and leaves a method whose span names another class as TypeScript", () => {
    const efx = "class A {\n  effect m(): number {\n    return 1\n  }\n}\n"
    const ts = toTypeScript(efx).code
    expect(toEffectScript(ts, { filename: "a.ts" }).code).toBe(efx)
    const other = ts.replace("\"A.m\"", "\"B.m\"")
    expect(toEffectScript(other, { filename: "a.ts" }).code).toContain("withSpan(\"B.m\")")
  })
})
