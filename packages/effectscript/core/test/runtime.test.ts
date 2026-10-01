import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

describe("runtime", () => {
  it("effect declarations run, fail with typed errors and run arrays concurrently", async () => {
    const mod = await runCompiled(`
      import { Data, Effect, Exit } from "effect"
      class Boom extends Data.TaggedError("Boom")<{}> {}
      export effect half(n: number): number throws Boom {
        if (n % 2 !== 0) throw new Boom()
        const [a, b] = await [Effect.succeed(n / 2), Effect.succeed(0)]
        return a + b
      }
      export const ok = Effect.runSync(half(4))
      export const failed = Effect.runSync(Effect.exit(half(3)))
      export const isFailure = Exit.isFailure(failed)
    `)
    expect(mod.ok).toBe(2)
    expect(mod.isFailure).toBe(true)
  })
})
