import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

describe("ADR-0013: optional fields", () => {
  it("name?: T rejects an explicit undefined; name?: T | undefined accepts it", async () => {
    const mod = await runCompiled(`
      import { Exit, Schema } from "effect"
      schema Exact { email?: string }
      schema Loose { email?: string | undefined }
      schema ExactAlias = { email?: string }
      schema Shape =
        | Dot { label?: string }
      const ok = (s: any, v: unknown) => Exit.isSuccess(Schema.decodeUnknownExit(s)(v))
      export const results = [
        ok(Exact, {}), ok(Exact, { email: undefined }), ok(Exact, { email: "a" }),
        ok(Loose, {}), ok(Loose, { email: undefined }),
        ok(ExactAlias, {}), ok(ExactAlias, { email: undefined }),
        ok(Dot, { _tag: "Dot" }), ok(Dot, { _tag: "Dot", label: undefined })
      ]
    `)
    expect(mod.results).toEqual([true, false, true, true, true, true, false, true, false])
  })
})
