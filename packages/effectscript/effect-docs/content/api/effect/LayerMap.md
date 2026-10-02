# effect/LayerMap

The examples in the JSDoc of `packages/effect/src/LayerMap.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## LayerMap

**Managing keyed layers**

```efx

// Define a service key
const DatabaseService = Context.Service<{
  readonly query: (sql: string) => Effect<string>
}>("Database")

// Create a LayerMap that provides different database configurations
const createDatabaseLayerMap = LayerMap.make((env: string) =>
  Layer.succeed(DatabaseService)({
    query: Effect.fn("DatabaseService.query")((sql) => succeed(`${env}: ${sql}`))
  })
)

// Use the LayerMap
const program = effect {
  const layerMap = await createDatabaseLayerMap

  // Get a layer for a specific environment
  const development = await provide(
    DatabaseService.use((database) => database.query("SELECT 1")),
    layerMap.get("development")
  )

  // Get context directly
  const productionContext = await layerMap.contextEffect("production")
  const production = await Context.get(productionContext, DatabaseService).query("SELECT 1")

  // Invalidate a cached layer
  await layerMap.invalidate("development")

  return { development, production }
}

await runPromise(scoped(program)) // => { development: "development: SELECT 1", production: "production: SELECT 1" }
```

## make

**Creating a layer map**

```efx

// Define a service key
const DatabaseService = Context.Service<{
  readonly query: (sql: string) => Effect<string>
}>("Database")

// Create a LayerMap that provides different database configurations
const program = effect {
  const layerMap = await LayerMap.make(
    (env: string) =>
      Layer.succeed(DatabaseService)({
        query: Effect.fn("DatabaseService.query")((sql) => succeed(`${env}: ${sql}`))
      }),
    { idleTimeToLive: "5 seconds" }
  )

  // Get a layer for a specific environment
  const devLayer = layerMap.get("development")

  // Use the layer to provide the service
  return await provide(
    effect {
      const db = await DatabaseService
      return await db.query("SELECT * FROM users")
    },
    devLayer
  )
}

await runPromise(scoped(program)) // => "development: SELECT * FROM users"
```

## fromRecord

**Creating a layer map from a record**

```efx

// Define a service key
const Database = Context.Service<{
  readonly query: (sql: string) => Effect<string>
}>("Database")

// Create predefined layers
const layers = {
  development: Layer.succeed(Database)({
    query: Effect.fn("DevDatabase.query")((sql) => succeed(`DEV: ${sql}`))
  }),
  production: Layer.succeed(Database)({
    query: Effect.fn("ProdDatabase.query")((sql) => succeed(`PROD: ${sql}`))
  })
} as const

// Create a LayerMap from the record
const program = effect {
  const layerMap = await LayerMap.fromRecord(layers, {
    idleTimeToLive: "10 seconds"
  })

  const development = await provide(
    Database.use((database) => database.query("SELECT 1")),
    layerMap.get("development")
  )
  const production = await provide(
    Database.use((database) => database.query("SELECT 1")),
    layerMap.get("production")
  )

  return { development, production }
}

await runPromise(scoped(program)) // => { development: "DEV: SELECT 1", production: "PROD: SELECT 1" }
```

## Service

**Defining a layer map service**

```efx

// Define a service key
const Greeter = Context.Service<{
  readonly greet: Effect<string>
}>("Greeter")

// Create a service that wraps a LayerMap
class GreeterMap extends LayerMap.Service<GreeterMap>()("GreeterMap", {
  // Define the lookup function for the layer map
  lookup: (name: string) =>
    Layer.succeed(Greeter)({
      greet: succeed(`Hello, ${name}!`)
    }),

  // If a layer is not used for a certain amount of time, it can be removed
  idleTimeToLive: "5 seconds"
}) {}

// Usage
const program = effect {
  // Access and use the Greeter service
  const greeter = await Greeter
  return await greeter.greet
}.pipe(
  // Use the GreeterMap service to provide a variant of the Greeter service
  provide(GreeterMap.get("John"))
).pipe(
  // Provide the GreeterMap layer
  provide(GreeterMap.layer)
)

await runPromise(program) // => "Hello, John!"
```
