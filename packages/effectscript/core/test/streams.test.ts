import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

describe("generator streams (ADR-0067)", () => {
  it("emit in order, end when the body returns, and are consumed by for await", async () => {
    const mod = await runCompiled(`
      import { Effect, Stream } from "effect"
      effect* upTo(n: number): number {
        for (let i = 1; i <= n; i++) {
          await sleep("1 millis")
          yield i
        }
      }
      effect total() {
        let sum = 0
        for await (const x of upTo(4)) sum += x
        return sum
      }
      export const items = await Effect.runPromise(Stream.runCollect(upTo(3)))
      export const sum = await Effect.runPromise(total())
    `)
    expect(mod.items).toEqual([1, 2, 3])
    expect(mod.sum).toBe(10)
  }, 120_000)

  it("fail with what they throw, run their defers, and stop when the consumer stops", async () => {
    const mod = await runCompiled(`
      import { Effect, Stream } from "effect"
      error TooMany { n: number }
      const log: Array<string> = []
      effect* naturals(): number throws TooMany {
        defer Effect.sync(() => log.push("closed"))
        let n = 0
        while (true) {
          if (n > 100) throw new TooMany({ n })
          yield n++
        }
      }
      export const first = await Effect.runPromise(Stream.runCollect(naturals().pipe(Stream.take(3))))
      export const failure = await Effect.runPromise(Effect.flip(Stream.runCollect(naturals())))
      export { log }
    `)
    expect(mod.first).toEqual([0, 1, 2])
    expect(mod.failure._tag).toBe("TooMany")
    expect(mod.log).toEqual(["closed", "closed"])
  }, 120_000)

  it("refuses a stream without an element type, yield*, and pipes after it", () => {
    const codes = (source: string) => toTypeScript(source).diagnostics.map((d) => d.code)
    expect(codes("effect* a() { yield 1 }")).toEqual(["EFX2006"])
    expect(codes("effect* a(): number { yield* other() }")).toEqual(["EFX2007"])
    expect(codes("effect* a(): number { yield 1 } |> orDie")).toEqual(["EFX2008"])
  })

  it("keeps `effect * f(x)` a multiplication when no `:` or `{` follows", () => {
    const source =
      "declare const effect: number\ndeclare const f: (n: number) => number\nexport const y = 1\neffect * f(2)\n"
    expect(toTypeScript(source).code).toBe(source)
  })

  it("leaves yield in a nested generator, and plain generators, as JavaScript", () => {
    const { code, diagnostics } = toTypeScript(
      "effect* a(): number {\n  const inner = function*() { yield 2 }\n  yield 1\n}\nfunction* b() { yield 3 }\n"
    )
    expect(diagnostics).toEqual([])
    expect(code).toContain("function*() { yield 2 }")
    expect(code).toContain("yield* Queue.offer(queue, 1)")
    expect(code).toContain("function* b() { yield 3 }")
  })
})
