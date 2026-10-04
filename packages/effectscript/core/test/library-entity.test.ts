import { toTypeScript } from "effectscript/compiler"
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

const fixture = fs.readFileSync(path.join(import.meta.dirname, "fixtures/cluster/counter.efx"), "utf8")

describe("entity (ADR-0071)", () => {
  it("keeps state per entity, and fails with the declared error", async () => {
    const mod = await runCompiled(`${fixture}
import { Entity, ShardingConfig } from "effect/cluster"
export const result = await Effect.runPromise(effect {
  const clientFor = await Entity.makeTestClient(Counter, CounterLive)
  const a = await clientFor("a")
  const b = await clientFor("b")
  await a.increment({ by: 2 })
  await a.increment({ by: 3 })
  await b.increment({ by: 10 })
  const failed = await Effect.flip(a.increment({ by: 1000 }))
  return [await a.current(), await b.current(), failed._tag]
} |> scoped |> provide(ShardingConfig.layer()))
`)
    expect(mod.result).toEqual([5, 10, "TooLarge"])
  }, 180_000)

  it("keeps entity a name elsewhere", () => {
    const source = "const entity = { id: 1 }\nentity.id\nfunction entityOf() {}\n"
    expect(toTypeScript(source).code).toBe(source)
  })
})
