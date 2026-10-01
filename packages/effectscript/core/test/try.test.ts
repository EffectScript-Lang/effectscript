import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

const prelude = `
  import { Cause, Data, Effect, Exit } from "effect"
  class A extends Data.TaggedError("A")<{}> {}
  class B extends Data.TaggedError("B")<{}> {}
  class Renamed extends Data.TaggedError("CustomTag")<{}> {}
`

describe("ADR-0010: try/catch contract", () => {
  it("an untyped catch catches a synchronous exception with or without an await", async () => {
    const mod = await runCompiled(`${prelude}
      effect noAwait() {
        try { return JSON.parse("{") as string } catch (e) { return Cause.isUnknownError(e) ? "unknown" : "other" }
      }
      effect withAwait() {
        try {
          JSON.parse("{")
          return await Effect.succeed("unreachable")
        } catch (e) {
          return Cause.isUnknownError(e) && e.cause instanceof SyntaxError ? "unknown" : "other"
        }
      }
      export const results = [Effect.runSync(noAwait()), Effect.runSync(withAwait())]
    `)
    expect(mod.results).toEqual(["unknown", "unknown"])
  })

  it("an untyped catch catches typed failures and Effect.die defects", async () => {
    const mod = await runCompiled(`${prelude}
      effect run(kind: "fail" | "die") {
        try {
          if (kind === "fail") throw new A()
          return await Effect.die("boom")
        } catch (e) {
          return Cause.isUnknownError(e) ? \`die:\${String(e.cause)}\` : e._tag
        }
      }
      export const results = [Effect.runSync(run("fail")), Effect.runSync(run("die"))]
    `)
    expect(mod.results).toEqual(["A", "die:boom"])
  })

  it("interruption is never caught, and finally still runs", async () => {
    const mod = await runCompiled(`${prelude}
      export const log: Array<string> = []
      effect run() {
        try {
          return await Effect.interrupt
        } catch {
          log.push("caught")
          return "caught"
        } finally {
          log.push("finally")
        }
      }
      export const exit = Effect.runSyncExit(run())
      export const interrupted = Exit.hasInterrupts(exit)
    `)
    expect(mod.interrupted).toBe(true)
    expect(mod.log).toEqual(["finally"])
  })

  it("clauses are alternatives: a failure raised in a handler is not caught by a sibling", async () => {
    const mod = await runCompiled(`${prelude}
      effect single() {
        try { throw new A() } catch (e: A) { throw new B() } catch (e: B) { return "B caught" }
      }
      effect withUnion() {
        try { throw new A() } catch (e: A | Renamed) { throw new B() } catch (e: B) { return "B caught" } catch { return "fallback" }
      }
      effect fromUntyped() {
        try { return JSON.parse("{") as string } catch (e: B) { return "B caught" } catch { throw new B() }
      }
      export const results = [single, withUnion, fromUntyped].map((f) => {
        const exit = Effect.runSyncExit(f())
        return Exit.isFailure(exit) ? "propagated" : exit.value
      })
    `)
    expect(mod.results).toEqual(["propagated", "propagated", "propagated"])
  })

  it("a custom _tag is resolved from the declaration", async () => {
    const mod = await runCompiled(`${prelude}
      error Missing { _tag: "NotThere"; id: string }
      effect run() {
        try { throw new Missing({ id: "x" }) } catch (e: Missing) { return e._tag } catch (e: Renamed) { return "renamed" }
      }
      effect run2() {
        try { throw new Renamed() } catch (e: Renamed) { return e._tag }
      }
      export const results = [Effect.runSync(run()), Effect.runSync(run2())]
    `)
    expect(mod.results).toEqual(["NotThere", "CustomTag"])
  })

  it("catch (e: UnknownError) catches only thrown exceptions", async () => {
    const mod = await runCompiled(`${prelude}
      effect run(kind: "throw" | "fail") {
        try {
          if (kind === "fail") throw new A()
          return JSON.parse("{") as string
        } catch (e: Cause.UnknownError) {
          return "thrown"
        }
      }
      export const thrown = Effect.runSync(run("throw"))
      export const failed = Exit.isFailure(Effect.runSyncExit(run("fail")))
    `)
    expect(mod.thrown).toBe("thrown")
    expect(mod.failed).toBe(true)
  })

  it("a try inside a match arm makes the arm a generator", async () => {
    const mod = await runCompiled(`${prelude}
      effect run(v: "a" | "b") {
        return match (v) {
          when "a": do { try { JSON.parse("{") } catch { "recovered" } }
          default: "b"
        }
      }
      export const results = [Effect.runSync(run("a")), Effect.runSync(run("b"))]
    `)
    expect(mod.results).toEqual(["recovered", "b"])
  })
})
