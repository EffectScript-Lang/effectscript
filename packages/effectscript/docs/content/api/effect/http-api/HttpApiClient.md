# effect/http-api/HttpApiClient

The examples in the JSDoc of `packages/effect/src/http-api/HttpApiClient.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## urlBuilder

**Building typed URLs**

```efx
import { Schema } from "effect"
import { HttpApi, HttpApiClient, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

const Api = HttpApi.make("Api").add(
  HttpApiGroup.make("users").add(
    HttpApiEndpoint.get("getUser", "/users/:id", {
      params: { id: Schema.String }
    })
  )
)

const buildUrl = HttpApiClient.urlBuilder(Api, {
  baseUrl: "https://api.example.com"
})

buildUrl.users.getUser({
  params: { id: "123" }
}) // => "https://api.example.com/users/123"
```
