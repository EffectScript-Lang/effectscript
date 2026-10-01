import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

export const httpTestPrelude = `
  import { Effect, FileSystem, Layer, Path } from "effect"
  import { Etag, HttpPlatform } from "effect/http"
  import { HttpApiBuilder, HttpApiTest } from "effect/http-api"
  const TestServices = Layer.mergeAll(Path.layer, Etag.layerWeak, HttpPlatform.layer).pipe(
    Layer.provideMerge(FileSystem.layerNoop({}))
  )
`

describe("group / api (§4.14)", () => {
  it("compiles endpoint lines to HttpApiEndpoint calls", () => {
    const { code, diagnostics } = toTypeScript(
      "group UsersApi {\n  get getById \"/:id\" (params: { id: string }, query: { full?: boolean }): User throws A | B\n  del remove \"/:id\"\n  middleware Auth\n}\napi Api { UsersApi }\n"
    )
    expect(diagnostics).toEqual([])
    expect(code).toContain(
      "class UsersApi extends HttpApiGroup.make(\"users\").add(\n" +
        "  HttpApiEndpoint.get(\"getById\", \"/:id\", { params: { id: Schema.String }, query: { full: Schema.optionalKey(Schema.Boolean) }, success: User, error: [A, B] }),\n" +
        "  HttpApiEndpoint.delete(\"remove\", \"/:id\")\n" +
        ").middleware(Auth) {}"
    )
    expect(code).toContain("class Api extends HttpApi.make(\"api\").add(UsersApi) {}")
  })

  it("serves typed requests and errors through HttpApiBuilder", async () => {
    const mod = await runCompiled(`${httpTestPrelude}
      schema User {
        id: string
        name: string
      }
      error UserNotFound { id: string }
      group UsersApi {
        get list "/" (query: { search?: string }): User[]
        get getById "/:id" (params: { id: string }): User throws UserNotFound
      }
      api Api { UsersApi }
      const UsersLive = HttpApiBuilder.group(Api, "users", (handlers) => handlers.handleAll({
        list: ({ query }) => Effect.succeed([new User({ id: "1", name: query.search ?? "all" })]),
        getById: ({ params }) =>
          params.id === "1" ? Effect.succeed(new User({ id: "1", name: "Ada" })) : Effect.fail(new UserNotFound({ id: params.id }))
      }))
      export const result = await Effect.runPromise(Effect.gen(function*() {
        const client = yield* HttpApiTest.groups(Api, ["users"]).pipe(Effect.provide(UsersLive))
        const list = yield* client.users.list({ query: { search: "x" } })
        const found = yield* client.users.getById({ params: { id: "1" } })
        const missing = yield* Effect.flip(client.users.getById({ params: { id: "2" } }))
        return [list[0]!.name, found.name, missing._tag]
      }).pipe(Effect.scoped, Effect.provide(TestServices)))
    `)
    expect(mod.result).toEqual(["x", "Ada", "UserNotFound"])
  }, 180_000)

  it("impl compiles to HttpApiBuilder.group with handleAll and span names", () => {
    const { code } = toTypeScript(
      "export const H = impl Api.users {\n  const users = await Users\n  return {\n    effect getById({ params }) {\n      return await users.find(params.id)\n    }\n  }\n} |> provide(Users.layer)\n"
    )
    expect(code).toContain("HttpApiBuilder.group(Api, \"users\", Effect.fn(\"Api.users\")(function*(handlers) {")
    expect(code).toContain("return handlers.handleAll({")
    expect(code).toContain("getById: Effect.fn(\"Api.users.getById\")(function*({ params }) {")
    expect(code).toContain("})).pipe(Layer.provide(Users.layer))")
  })

  it("an EffectScript-only API answers requests (group, api, service, impl)", async () => {
    const mod = await runCompiled(`${httpTestPrelude}
      schema User {
        id: string
        name: string
      }
      error UserNotFound { id: string }
      group UsersApi {
        get getById "/:id" (params: { id: string }): User throws UserNotFound
      }
      api Api { UsersApi }
      service Users {
        effect find(id: string): User throws UserNotFound
        layer = {
          find: effect (id: string) => id === "1" ? new User({ id, name: "Ada" }) : throw new UserNotFound({ id })
        }
      }
      const UsersLive = impl Api.users {
        const users = await Users
        return {
          effect getById({ params }) {
            return await users.find(params.id)
          }
        }
      } |> provide(Users.layer)
      export const result = await Effect.runPromise(Effect.gen(function*() {
        const client = yield* HttpApiTest.groups(Api, ["users"]).pipe(Effect.provide(UsersLive))
        const found = yield* client.users.getById({ params: { id: "1" } })
        const missing = yield* Effect.flip(client.users.getById({ params: { id: "9" } }))
        return [found.name, missing._tag]
      }).pipe(Effect.scoped, Effect.provide(TestServices)))
    `)
    expect(mod.result).toEqual(["Ada", "UserNotFound"])
  }, 180_000)
})
