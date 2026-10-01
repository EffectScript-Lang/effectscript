import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

describe("atom (§4.14)", () => {
  it("makes readable, derived and effect atoms; pipes apply to the atom", async () => {
    const mod = await runCompiled(`
      import { AsyncResult, AtomRegistry } from "effect/reactivity"
      atom count = 2
      atom doubled = (get) => get(count) * 2
      atom kept = 1 |> keepAlive
      atom greeting = effect {
        return await succeed("hi")
      }
      const registry = AtomRegistry.make()
      export const value = registry.get(doubled)
      registry.set(count, 5)
      export const updated = registry.get(doubled)
      export const isKeptAlive = kept.keepAlive
      export const greetingValue = AsyncResult.getOrElse(registry.get(greeting), () => "pending")
    `)
    expect(mod.value).toBe(4)
    expect(mod.updated).toBe(10)
    expect(mod.isKeptAlive).toBe(true)
    expect(mod.greetingValue).toBe("hi")
  }, 120_000)
})
