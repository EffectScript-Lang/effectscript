import { toEffectScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"
import { expectSafe, roundTrip } from "./utils/reverse.ts"

describe("reverse: ambient forms (Plan 7 Task 1)", () => {
  it("captures logs, clock, random and env reads at generator level", () => {
    const efx =
      "export effect report(name: string) {\n  console.log(\"hello\", name)\n  console.warn(\"careful\")\n  console.error(\"bad\")\n  console.info(\"fyi\")\n  console.debug(\"dbg\")\n  const startedAt = Date.now()\n  const jitter = Math.random() * 10\n  const region = process.env.REGION ?? \"eu\"\n  return { startedAt, jitter, region, key: process.env[\"API-KEY\"] }\n}\n"
    expect(roundTrip(efx)).toBe(efx)
  })

  it("keeps Effect.log outside effect code", () => {
    const ts = "import { Effect } from \"effect\"\nexport const program = Effect.log(\"hi\")\n"
    expect(expectSafe(ts).code).not.toContain("console")
  })

  it("keeps Effect.log when console is bound locally", () => {
    const ts =
      "import { Effect } from \"effect\"\nconst console = { log: (_: string) => {} }\nexport const f = Effect.gen(function*() {\n  yield* Effect.log(\"hi\")\n  console.log(\"local\")\n})\n"
    expect(expectSafe(ts).code).toContain("await log(\"hi\")")
  })

  it("keeps the effect forms with ambient capture off", () => {
    const ts =
      "import { Effect } from \"effect\"\nexport const f = Effect.gen(function*() {\n  yield* Effect.log(\"hi\")\n})\n"
    expect(toEffectScript(ts, { ambient: false }).code).toContain("await log(\"hi\")")
  })
})
