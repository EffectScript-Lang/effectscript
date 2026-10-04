import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it, vi } from "vitest"
import { runCompiled } from "./utils/run.ts"
import { typecheck } from "./utils/typecheck.ts"

vi.setConfig({ testTimeout: 180_000 })

const greeter = `service Greeter {
  effect greet(name: string): string
  default = { greet: effect (name: string) => \`Hello, \${name}\` }
  layer test = { greet: effect (name: string) => \`Hi, \${name}\` }
  layer loud = effect {
    const suffix = "!"
    return { greet: effect (name: string) => \`HEY \${name}\${suffix}\` }
  }
}
`

describe("services with defaults (ADR-0066)", () => {
  it("run on the default with nothing provided, and on a layer that overrides it", async () => {
    const mod = await runCompiled(`${greeter}
      export const plain = await Effect.runPromise(Greeter.greet("Ada"))
      export const test = await Effect.runPromise(Greeter.greet("Ada").pipe(Effect.provide(Greeter.layerTest)))
      export const loud = await Effect.runPromise(Greeter.greet("Ada").pipe(Effect.provide(Greeter.layerLoud)))
      export const direct = await Effect.runPromise(effect { return (await Greeter).greet("Bo") })
    `)
    expect([mod.plain, mod.test, mod.loud]).toEqual(["Hello, Ada", "Hi, Ada", "HEY Ada!"])
    expect(await import("effect").then(({ Effect }) => Effect.runPromise(mod.direct))).toBe("Hello, Bo")
  })

  it("is never a requirement: an effect using it needs nothing", () => {
    const result = toTypeScript(`${greeter}
export effect welcome(name: string): string {
  return await Greeter.greet(name)
}
export const run: Effect<string> = welcome("x")
`)
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([])
    expect(typecheck(new Map([["service-default.ts", result.code]]))).toEqual([])
  })

  it("refuses a default built with effects", () => {
    const result = toTypeScript(
      "service A {\n  effect a(): number\n  default = effect { return { a: effect () => 1 } }\n}\n"
    )
    expect(result.diagnostics.map((d) => d.code)).toEqual(["EFX4004"])
  })
  it("converts back, with a custom key, and leaves a hand-written reference as TypeScript", () => {
    const efx = `service Flags as "app/Flags" {
  readonly beta: boolean

  default = { beta: false }
}
`
    expect(toEffectScript(toTypeScript(efx).code, { filename: "a.ts" }).code).toBe(efx)
    const handWritten = `import { Context } from "effect"
export const Flags = Context.Reference<{ readonly beta: boolean }>("app/Flags", { defaultValue: () => ({ beta: false }) })
`
    expect(toEffectScript(handWritten, { filename: "b.ts" }).code).toBe(handWritten)
  })
})
