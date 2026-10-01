import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

describe("ambient capture (§4.15, ADR-0027)", () => {
  it("routes console through the Effect logger", async () => {
    const mod = await runCompiled(`
      import { Effect, Logger } from "effect"
      export const logs: Array<string> = []
      const capture = Logger.layer([Logger.make((o) => { logs.push(\`\${o.logLevel}:\${String(o.message)}\`) })])
      effect run() {
        console.log("a")
        console.error("b")
      }
      Effect.runSync(run().pipe(Effect.provide(capture)))
    `)
    expect(mod.logs).toEqual(["Info:a", "Error:b"])
  })

  it("reads time, randomness and env through Effect services", async () => {
    const mod = await runCompiled(`
      import { ConfigProvider, Effect, Random } from "effect"
      import { TestClock } from "effect/testing"
      effect now() { return Date.now() }
      effect roll() { return Math.random() }
      effect env() { return [process.env.NAME, process.env.MISSING] }
      export let calls = 0
      const fallback = () => { calls++; return "fb" }
      effect lazy() { return process.env.NAME ?? fallback() }
      export const time = await Effect.runPromise(
        Effect.gen(function*() { yield* TestClock.setTime(1234); return yield* now() }).pipe(Effect.provide(TestClock.layer()))
      )
      export const rolls = [Effect.runSync(roll().pipe(Random.withSeed(42))), Effect.runSync(roll().pipe(Random.withSeed(42)))]
      const provider = ConfigProvider.layer(ConfigProvider.fromUnknown({ NAME: "ada" }))
      export const values = Effect.runSync(env().pipe(Effect.provide(provider)))
      export const present = Effect.runSync(lazy().pipe(Effect.provide(provider)))
      export const callsWhenPresent = calls
      export const absent = Effect.runSync(lazy().pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({})))))
    `)
    expect(mod.time).toBe(1234)
    expect(mod.rolls[0]).toBe(mod.rolls[1])
    expect(mod.values).toEqual(["ada", undefined])
    expect(mod.present).toBe("ada")
    expect(mod.callsWhenPresent).toBe(0)
    expect(mod.absent).toBe("fb")
    expect(mod.calls).toBe(1)
  })

  it("leaves shadowed names, writes and opted-out files alone", () => {
    const shadowed =
      toTypeScript("effect f(console: { log(s: string): string }) {\n  return console.log(\"x\")\n}\n").code
    expect(shadowed).toContain("return console.log(\"x\")")
    const write = toTypeScript("effect f() {\n  process.env.X = \"1\"\n  delete process.env.Y\n}\n").code
    expect(write).toContain("process.env.X = \"1\"")
    expect(write).toContain("delete process.env.Y")
    const off = toTypeScript("// @efx no-ambient\neffect f() {\n  console.log(\"x\")\n}\n").code
    expect(off).toContain("console.log(\"x\")")
  })
})
