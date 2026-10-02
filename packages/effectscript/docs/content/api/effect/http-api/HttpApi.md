# effect/http-api/HttpApi

The examples in the JSDoc of `packages/effect/src/http-api/HttpApi.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## ParseOptions

**Strict bodies with default header parsing**

```efx
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

const api = HttpApi.make("Api")
  .add(
    HttpApiGroup.make("users").add(
      HttpApiEndpoint.post("create", "/users", {
        headers: { "x-api-key": Schema.String },
        payload: { name: Schema.String }
      })
    )
  )
  .annotate(HttpApi.ParseOptions, { onExcessProperty: "error" })
  .annotate(HttpApi.HeadersParseOptions, {})
```
