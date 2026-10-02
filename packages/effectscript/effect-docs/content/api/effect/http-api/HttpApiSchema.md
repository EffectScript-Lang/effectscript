# effect/http-api/HttpApiSchema

The examples in the JSDoc of `packages/effect/src/http-api/HttpApiSchema.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## WithHeaders

**Adding response headers to a success schema**

```efx
import { Schema } from "effect"
import { HttpApiSchema } from "effect/http-api"

const schema = HttpApiSchema.WithHeaders(Schema.String, {
  "x-total-count": Schema.FiniteFromString
})
const response: typeof schema.Type = HttpApiSchema.withHeaders({
  body: "created",
  headers: { "x-total-count": 1 }
})

HttpApiSchema.isWithHeaders(schema) // => true
response.body // => "created"
response.headers // => { "x-total-count": 1 }
```

## isWithHeaders

**Detecting a response headers schema**

```efx
import { Schema } from "effect"
import { HttpApiSchema } from "effect/http-api"

const schema = HttpApiSchema.WithHeaders(Schema.String, {
  "x-request-id": Schema.String
})

HttpApiSchema.isWithHeaders(schema) // => true
HttpApiSchema.isWithHeaders(Schema.String) // => false
```

## encodeToWithHeaders

**Encoding an error with headers**

```efx

error UserNotFound {
  userId: Int
}

const UserNotFoundWithHeaders = UserNotFound.pipe(
  HttpApiSchema.encodeToWithHeaders({
    body: HttpApiSchema.Empty(404),
    headers: {
      "x-user-id": Schema.Int
    }
  }, {
    decode: ({ headers }) => new UserNotFound({ userId: headers["x-user-id"] }),
    encode: (error) => ({
      headers: { "x-user-id": error.userId },
      body: undefined
    })
  })
)

const encoded = Schema.encodeSync(UserNotFoundWithHeaders)(new UserNotFound({ userId: 123 }))
encoded // => { body: undefined, headers: { "x-user-id": 123 } }
```
