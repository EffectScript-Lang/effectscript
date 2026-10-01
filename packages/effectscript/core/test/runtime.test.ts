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

  it("effectful try/catch catches typed failures in clause order and runs finally", async () => {
    const mod = await runCompiled(`
      import { Data, Effect } from "effect"
      class A extends Data.TaggedError("A")<{}> {}
      class B extends Data.TaggedError("B")<{}> {}
      const fail = (tag: "A" | "B" | "C"): Effect.Effect<string, A | B | "C"> =>
        tag === "A" ? Effect.fail(new A()) : tag === "B" ? Effect.fail(new B()) : Effect.fail("C" as const)
      export const order: Array<string> = []
      effect handle(tag: "A" | "B" | "C") {
        try {
          return await fail(tag)
        } catch (e: A) {
          return "a"
        } catch (e: B) {
          return "b"
        } catch (e) {
          return "other"
        } finally {
          order.push(tag)
        }
      }
      effect parse(s: string) {
        try {
          return JSON.parse(s) as string
        } catch {
          return "bad json"
        }
      }
      export const results = (["A", "B", "C"] as const).map((t) => Effect.runSync(handle(t)))
      export const parsed = Effect.runSync(parse("{"))
    `)
    expect(mod.results).toEqual(["a", "b", "other"])
    expect(mod.order).toEqual(["A", "B", "C"])
    expect(mod.parsed).toBe("bad json")
  })
})
