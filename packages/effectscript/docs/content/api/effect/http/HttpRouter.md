# effect/http/HttpRouter

The examples in the JSDoc of `packages/effect/src/http/HttpRouter.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## use

**Registering routes during layer construction**

```efx

const Routes = HttpRouter.use((router) =>
  router.add("GET", "/health", HttpServerResponse.text("ready"))
)

const program = acquireUseRelease(
  sync(() => HttpRouter.toWebHandler(Routes, { disableLogger: true })),
  ({ handler }) =>
    effect {
      const response = await promise(() => handler(new Request("http://localhost/health")))
      const body = await promise(() => response.text())
      return body
    },
  ({ dispose }) => promise(dispose)
)

await runPromise(program) // => "ready"
```

## add

**Adding a GET route**

```efx
import { Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"

const Route = HttpRouter.add(
  "GET",
  "/hello",
  HttpServerResponse.text("Hello, World!")
)
Layer.isLayer(Route) // => true
```

## addAll

**Adding multiple routes**

```efx
import { Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"

const Routes = HttpRouter.addAll([
  HttpRouter.route(
    "GET",
    "/hello",
    HttpServerResponse.text("Hello, World!")
  )
])
Layer.isLayer(Routes) // => true
```

## middleware

**Applying route and global middleware**

```efx

const RouteMiddleware = HttpRouter.middleware((httpEffect) =>
  map(httpEffect, HttpServerResponse.setHeader("x-route", "route"))
).layer

const GlobalMiddleware = HttpRouter.middleware(
  (httpEffect) => map(httpEffect, HttpServerResponse.setHeader("x-global", "global")),
  { global: true }
)

const Routes = HttpRouter.add("GET", "/hello", HttpServerResponse.text("Hello")).pipe(
  Layer.provide(RouteMiddleware)
)
layer App = Routes & GlobalMiddleware

const program = acquireUseRelease(
  sync(() => HttpRouter.toWebHandler(App, { disableLogger: true })),
  ({ handler }) =>
    effect {
      const response = await promise(() => handler(new Request("http://localhost/hello")))
      return [response.headers.get("x-route"), response.headers.get("x-global")]
    },
  ({ dispose }) => promise(dispose)
)

await runPromise(program) // => ["route", "global"]
```

## disableLogger

**Disabling route logging**

```efx
import { Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"

const Route = HttpRouter.add(
  "GET",
  "/hello",
  HttpServerResponse.text("Hello, World!")
).pipe(
  // disable the logger for this route
  Layer.provide(HttpRouter.disableLogger)
)
Layer.isLayer(Route) // => true
```
