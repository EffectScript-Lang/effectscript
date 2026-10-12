import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

const compile = (efx: string) => {
  const result = toTypeScript(efx, { filename: "live.efx" })
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([])
  return result.code
}
const back = (ts: string) => toEffectScript(ts, { filename: "live.ts" }).code

const head = `import { Users } from "./Users.ts"\nimport * as Db from "./Db.ts"\n\n`

describe("layer … for: a service declared anywhere (ADR-0303)", () => {
  it("builds an effect block's layer, naming spans after the service", () => {
    const code = compile(`${head}export layer UsersLive for Users = effect {
  const db = await Db.Db
  effect load(id: string) {
    return await db.get(id)
  }
  return {
    effect find(id) {
      return await load(id)
    },
    all: effect () => await db.all()
  }
} |> provide(Db.layer)
`)
    expect(code).toContain("export const UsersLive = Layer.effect(Users, Effect.gen(function*() {")
    expect(code).toContain("const load = Effect.fn(\"Users.load\")(function*(id: string) {")
    expect(code).toContain("return Users.of({")
    expect(code).toContain("find: Effect.fn(\"Users.find\")(function*(id) {")
    expect(code).toContain("all: Effect.fnUntraced(")
    expect(code).toContain("})).pipe(Layer.provide(Db.layer))")
  })

  it("builds an object's layer, and any other value's", () => {
    expect(compile(`${head}export layer UsersTest for Users = { find: effect (id) => id }\n`)).toContain(
      "export const UsersTest = Layer.succeed(Users, Users.of({ find: Effect.fnUntraced(function*(id) { return id }) }))"
    )
    expect(compile(`${head}declare const make: Effect<never>\nexport layer Made for Users = make\n`)).toContain(
      "export const Made = Layer.effect(Users, make)"
    )
  })

  it("takes a dotted service, and names its spans after the last segment", () => {
    const code = compile(
      `${head}layer DbLive for Db.Db = effect {\n  return { effect get(id: string) { return id } }\n}\n`
    )
    expect(code).toContain("Layer.effect(Db.Db, Effect.gen(function*() {")
    expect(code).toContain("return Db.Db.of({ get: Effect.fn(\"Db.get\")(")
  })

  it("converts each of those back, and round-trips", () => {
    for (
      const efx of [
        `${head}export layer UsersLive for Users = effect {\n  const db = await Db.Db\n  effect load(id: string) {\n    return await db.get(id)\n  }\n  return {\n    effect find(id) {\n      return await load(id)\n    }\n  }\n} |> provide(Db.layer)\n`,
        `${head}export layer UsersTest for Users = { find: effect (id) => id }\n`,
        `${head}declare const make: Effect<never>\nexport layer Made for Users = make\n`,
        `${head}layer DbLive for Db.Db = effect {\n  return { effect get(id: string) { return id } }\n}\n`
      ]
    ) {
      expect(back(compile(efx))).toBe(efx)
    }
  })

  it("keeps Layer.effect for a block that returns a bare object, which `for` would wrap in `of`", () => {
    const ts =
      `import * as Effect from "effect/Effect"\nimport * as Layer from "effect/Layer"\n${head}export const L = Layer.effect(Users, Effect.gen(function*() {\n  return { find: (id: string) => Effect.succeed(id) }\n}))\n`
    const efx = back(ts)
    expect(efx).toContain("export const L = Layer.effect(Users, effect {")
    expect(efx).not.toContain("layer L for")
  })

  it("keeps `layer` and `for` as names elsewhere", () => {
    const source = "const layer = { for: 1 }\nexport const x = layer.for\nfor (const layer of [1]) console.log(layer)\n"
    expect(toTypeScript(source, { filename: "plain.efx" }).code).toBe(source)
  })
})
