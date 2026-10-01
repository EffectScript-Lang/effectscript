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

  it("defer runs finalizers in reverse order at function exit; for await consumes streams", async () => {
    const mod = await runCompiled(`
      import { Effect, Stream } from "effect"
      export const log: Array<string> = []
      effect run() {
        defer Effect.sync(() => log.push("first-registered"))
        defer { log.push("second-registered") }
        log.push("body")
        return 1
      }
      export const result = Effect.runSync(run())
      effect total() {
        let sum = 0
        for await (const n of Stream.make(1, -2, 3)) {
          if (n < 0) continue
          sum += n
        }
        return sum
      }
      export const summed = Effect.runSync(total())
    `)
    expect(mod.result).toBe(1)
    expect(mod.log).toEqual(["body", "second-registered", "first-registered"])
    expect(mod.summed).toBe(4)
  })

  it("error declarations are tagged, yieldable and catchable", async () => {
    const mod = await runCompiled(`
      import { Effect } from "effect"
      error NotFound { id: string }
      effect get(id: string): string throws NotFound {
        if (id !== "ok") throw new NotFound({ id })
        return id
      }
      effect safe(id: string) {
        try {
          return await get(id)
        } catch (e: NotFound) {
          return \`missing:\${e.id}\`
        }
      }
      export const values = [Effect.runSync(safe("ok")), Effect.runSync(safe("x"))]
    `)
    expect(mod.values).toEqual(["ok", "missing:x"])
  })

  it("services provide layers and static accessors", async () => {
    const mod = await runCompiled(`
      import { Effect } from "effect"
      service Greeter {
        effect greet(name: string): string
        layer = effect {
          return { effect greet(name: string) { return \`hi \${name}\` } }
        }
        layer test = { greet: effect (name: string) => \`test \${name}\` }
      }
      effect run() {
        return await Greeter.greet("ada")
      }
      export const live = Effect.runSync(run().pipe(Effect.provide(Greeter.layer)))
      export const test = Effect.runSync(run().pipe(Effect.provide(Greeter.layerTest)))
    `)
    expect(mod.live).toBe("hi ada")
    expect(mod.test).toBe("test ada")
  })

  it("match dispatches on tags and literals", async () => {
    const mod = await runCompiled(`
      schema Shape =
        | Circle { radius: number }
        | Square { side: number }
      export const areas = [new Circle({ radius: 1 }), new Square({ side: 2 })].map((s) =>
        match (s) {
          when Circle({ radius }): radius * 10
          when Square({ side }): side * side
        }
      )
      export const words = (["a", "b", "z"] as const).map((x) =>
        match (x) { when "a": "first"; when "b": "second"; default: "other" }
      )
    `)
    expect(mod.areas).toEqual([10, 4])
    expect(mod.words).toEqual(["first", "second", "other"])
  })
})
