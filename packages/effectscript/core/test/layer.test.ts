import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

describe("top-level layer (§4.14)", () => {
  it("merges with & and runs effect layers for their scope", async () => {
    const mod = await runCompiled(`
      import { Effect, Layer } from "effect"
      service Users {
        effect list(): Array<string>
        layer = { list: effect () => ["ada"] }
      }
      service Posts {
        effect count(): number
        layer = { count: effect () => 1 }
      }
      layer AppLive = Users.layer & Posts.layer
      export const log: Array<string> = []
      layer Worker = effect {
        defer { log.push("stopped") }
        log.push("started")
      }
      export const result = Effect.runSync(
        Effect.gen(function*() {
          return [yield* Users.list(), yield* Posts.count()]
        }).pipe(Effect.provide(AppLive))
      )
      Effect.runSync(Effect.scoped(Layer.build(Worker)))
    `)
    expect(mod.result).toEqual([["ada"], 1])
    expect(mod.log).toEqual(["started", "stopped"])
  }, 120_000)
})
