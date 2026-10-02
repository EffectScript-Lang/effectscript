# effect/http-api/HttpApiMiddleware

The examples in the JSDoc of `packages/effect/src/http-api/HttpApiMiddleware.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## layerSchemaErrorTransform

**Mapping schema errors to custom errors**

```efx
import { Effect, Schema, type Types } from "effect"
import { HttpRouter } from "effect/http"
import {
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpApiMiddleware
} from "effect/http-api"

error CustomError {}

class ErrorHandler extends HttpApiMiddleware.Service<ErrorHandler>()("api/ErrorHandler", {
  error: CustomError
}) {}

const messages: Array<string> = []
const ErrorHandlerLayer = HttpApiMiddleware.layerSchemaErrorTransform(
  ErrorHandler,
  (schemaError) =>
    sync(() => messages.push(`Mapping ${schemaError.kind} schema error`)).pipe(
      andThen(fail(new CustomError()))
    )
)

const endpoint = HttpApiEndpoint.get("example", "/")
const group = HttpApiGroup.make("examples").add(endpoint)
const middlewareContext = {
  endpoint: endpoint as unknown as HttpApiEndpoint.Top,
  group: group as unknown as HttpApiGroup.Top
}
const Routes = HttpRouter.add(
  "GET",
  "/",
  effect {
    const applySchemaErrorTransform = await ErrorHandler
    const schemaError = await HttpApiError.HttpApiSchemaError.wrap(
      "Body",
      Schema.decodeUnknownEffect(Schema.String)(42)
    ).pipe(flip)
    const failingResponse = fail(schemaError as unknown as Types.unhandled)
    const result = await applySchemaErrorTransform(failingResponse, middlewareContext).pipe(
      match({
        onFailure: (error) => error instanceof CustomError ? error._tag : "UnexpectedError",
        onSuccess: () => "Success"
      })
    )
    return HttpServerResponse.text(result)
  }
).pipe(HttpRouter.provideRequest(ErrorHandlerLayer))

const program = acquireUseRelease(
  sync(() => HttpRouter.toWebHandler(Routes, { disableLogger: true })),
  ({ handler }) =>
    effect {
      const response = await promise(() => handler(new Request("http://localhost/")))
      const body = await promise(() => response.text())
      return body
    },
  ({ dispose }) => promise(dispose)
)

const body = await runPromise(program)
const result = [messages, body] // => [["Mapping Body schema error"], "CustomError"]
```
