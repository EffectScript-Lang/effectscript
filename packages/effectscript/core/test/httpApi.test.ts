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
})
