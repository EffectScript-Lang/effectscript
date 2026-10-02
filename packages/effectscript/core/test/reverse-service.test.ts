import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

const options = { filename: "src/users.efx", packageName: "app" }

const roundTrip = (efx: string) => {
  const ts = toTypeScript(efx, options).code
  const back = toEffectScript(ts, options).code
  expect(toTypeScript(back, options).code).toBe(ts)
  return back
}

describe("reverse: service (Plan 6 Task 8)", () => {
  it.each([
    [
      "signatures, a layer with defer and pipes, a test layer",
      "declare const SqlLive: Layer<never>\n\nexport service Users {\n  effect find(id: string): string throws Error\n  effect list(): ReadonlyArray<string>\n  readonly size: number\n\n  layer = effect {\n    const cache = new Map<string, string>()\n    defer log(\"released\")\n    return {\n      size: 0,\n      effect find(id: string) {\n        return cache.get(id) ?? throw new Error(id)\n      },\n      list: effect () => [...cache.values()]\n    }\n  } |> provide(SqlLive)\n\n  layer test = {\n    size: 1,\n    find: effect (id: string) => id,\n    list: effect () => []\n  }\n}\n"
    ],
    ["signatures only", "service Clock {\n  effect now(): number\n}\n"],
    ["a custom key", "service Clock as \"my/clock\" {\n  effect now(): number\n}\n"],
    [
      "a plain signature",
      "service Repo {\n  get(id: string): Effect<string>\n  effect put(id: string, value: string): void\n}\n"
    ]
  ])("%s", (_name, efx) => {
    expect(roundTrip(efx)).toBe(efx)
  })

  it("keeps a typed layer as TypeScript", () => {
    const ts = toTypeScript("service Clock {\n  effect now(): number\n  layer = { now: effect () => 1 }\n}\n", options)
      .code
      .replace("static readonly layer =", "static readonly layer: Layer.Layer<Clock> =")
    const result = toEffectScript(ts, options)
    expect(result.code).toContain("class Clock")
    expect(result.notes.map((n) => n.message).join("\n")).toMatch(/type annotation/)
  })

  it("names declarations inside a layer after the service", () => {
    const efx =
      "service Clock {\n  effect now(): number\n  layer = effect {\n    effect tick() {\n      return 1\n    }\n    return { now: tick }\n  }\n}\n"
    expect(roundTrip(efx)).toBe(efx)
  })

  it("keeps a class with a hand-written static as TypeScript", () => {
    const ts = toTypeScript("service Clock {\n  effect now(): number\n}\n", options).code
      .replace("static readonly now", "static readonly extra = 1\n  static readonly now")
    const result = toEffectScript(ts, options)
    expect(result.code).toContain("class Clock")
    expect(result.notes.map((n) => n.message).join("\n")).toMatch(/Clock/)
  })
})
