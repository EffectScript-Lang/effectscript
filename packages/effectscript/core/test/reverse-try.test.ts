import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

// The forward compiler is the oracle: each case compiles an EffectScript `try`, converts the
// output back, and expects the same EffectScript and byte-identical TypeScript (ADR-0030).
const head = `import { Data } from "effect"

class NotFound extends Data.TaggedError("NotFound")<{}> {}
class Timeout extends Data.TaggedError("RequestTimeout")<{}> {}
class Busy extends Data.TaggedError("Busy")<{}> {}

declare const load: (id: string) => Effect.Effect<string, NotFound | Timeout | Busy | Error>
declare const log: (s: string) => Effect.Effect<void>

`

const roundTrip = (efx: string) => {
  const ts = toTypeScript(`${head}${efx}`).code
  const back = toEffectScript(ts).code
  expect(toTypeScript(back).code).toBe(ts)
  return back.slice(back.indexOf("declare const log"))
    .replace(/^declare const log: .*\n\n/, "")
}

describe("reverse: try (Plan 6 Task 6)", () => {
  it.each([
    [
      "one typed clause",
      "effect f(id: string) {\n  try {\n    return await load(id)\n  } catch (e: NotFound) {\n    return \"missing\"\n  }\n}\n"
    ],
    [
      "grouped clauses with a fallback, a class whose tag differs",
      "effect f(id: string) {\n  try {\n    return await load(id)\n  } catch (e: NotFound) {\n    return \"missing\"\n  } catch (e: Timeout) {\n    return \"slow\"\n  } catch (e) {\n    return `failed: ${String(e)}`\n  }\n}\n"
    ],
    [
      "a union clause then a chained clause",
      "effect f(id: string) {\n  try {\n    return await load(id)\n  } catch (e: NotFound | Timeout) {\n    return e._tag\n  } catch (e: Busy) {\n    return \"busy\"\n  }\n}\n"
    ],
    [
      "finally only, as a statement",
      "effect f(id: string) {\n  let result = \"none\"\n  try {\n    result = await load(id)\n  } finally {\n    await log(\"done\")\n  }\n  return result\n}\n"
    ],
    [
      "untyped without a binding",
      "effect f(json: string) {\n  try {\n    return JSON.parse(json) as unknown\n  } catch {\n    return null\n  }\n}\n"
    ],
    [
      "a comment inside a clause",
      "effect f(id: string) {\n  try {\n    return await load(id)\n  } catch (e: Busy) {\n    // retry later\n    return \"busy\"\n  } finally {\n    await log(\"done\")\n  }\n}\n"
    ]
  ])("%s", (_name, efx) => {
    expect(roundTrip(efx)).toBe(efx)
  })

  it("keeps the lowering when another identifier is named like its generated binder", () => {
    const efx =
      "effect f(json: string) {\n  try {\n    return JSON.parse(json) as unknown\n  } catch {\n    return null\n  }\n}\n"
    const ts = `${toTypeScript(`${head}${efx}`).code}export const defect = 1\n`
    const back = toEffectScript(ts).code
    expect(back).not.toContain("try {")
    expect(toTypeScript(back).code).toBe(ts)
  })

  it("leaves a pipe with a foreign step as TypeScript", () => {
    const ts = toTypeScript(
      `${head}effect f(id: string) {\n  return await load(id) |> catchTag("NotFound", () => succeed("x")) |> orDie\n}\n`
    ).code
    const back = toEffectScript(ts).code
    expect(back).not.toContain("try")
    expect(toTypeScript(back).code).toBe(ts)
  })
})
