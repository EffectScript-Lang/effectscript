# effect/Layer

The examples in the JSDoc of `packages/effect/src/Layer.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## MemoMap

**Sharing layer construction with a memo map**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

// Create a custom MemoMap for manual layer building
const program = effect {
  const memoMap = await Layer.makeMemoMap
  const scope = await Effect.scope

  const dbLayer = Layer.succeed(Database, {
    query: Effect.fn("Database.query")((sql: string) => succeed("result"))
  })
  const context = await Layer.buildWithMemoMap(dbLayer, memoMap, scope)

  return Context.get(context, Database)
}

const database = runSync(scoped(program))
runSync(database.query("SELECT 1")) // => "result"
```

## isLayer

**Checking whether a value is a layer**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

const dbLayer = Layer.succeed(Database, {
  query: Effect.fn("Database.query")((sql: string) => succeed("result"))
})
const notALayer = { someProperty: "value" }

Layer.isLayer(dbLayer) // => true
Layer.isLayer(notALayer) // => false
```

## fromBuild

**Constructing a layer from a build function**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

const databaseLayer = Layer.fromBuild(() =>
  sync(() =>
    Context.make(Database, {
      query: (sql: string) => succeed("result")
    })
  )
)

const program = Database.use((database) => database.query("SELECT 1"))
runSync(provide(program, databaseLayer)) // => "result"
```

## fromBuildMemo

**Memoizing layer construction**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

const databaseLayer = Layer.fromBuildMemo(() =>
  sync(() =>
    Context.make(Database, {
      query: (sql: string) => succeed("result")
    })
  )
)

const program = Database.use((database) => database.query("SELECT 1"))
runSync(provide(program, databaseLayer)) // => "result"
```

## makeMemoMapUnsafe

**Creating a memo map unsafely**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

// Create a memo map for manual layer building
const program = effect {
  const memoMap = Layer.makeMemoMapUnsafe()
  const scope = await Effect.scope

  const dbLayer = Layer.succeed(Database, {
    query: Effect.fn("Database.query")((sql: string) => succeed("result"))
  })
  const context = await Layer.buildWithMemoMap(dbLayer, memoMap, scope)

  return Context.get(context, Database)
}

const database = runSync(scoped(program))
runSync(database.query("SELECT 1")) // => "result"
```

## makeMemoMap

**Creating a memo map in an effect**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

// Create a memo map safely within an Effect
const program = effect {
  const memoMap = await Layer.makeMemoMap
  const scope = await Effect.scope

  const dbLayer = Layer.succeed(Database, {
    query: Effect.fn("Database.query")((sql: string) => succeed("result"))
  })
  const context = await Layer.buildWithMemoMap(dbLayer, memoMap, scope)

  return Context.get(context, Database)
}

const database = runSync(scoped(program))
runSync(database.query("SELECT 1")) // => "result"
```

## buildWithMemoMap

**Building layers with an explicit memo map**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

service Logger {
  readonly log: (msg: string) => Effect<void>
}

const logs: Array<string> = []

// Build layers with explicit memoization control
const program = effect {
  const memoMap = await Layer.makeMemoMap
  const scope = await Effect.scope

  // Build database layer with memoization
  const dbLayer = Layer.succeed(Database, {
    query: Effect.fn("Database.query")((sql: string) => succeed("result"))
  })
  const dbContext = await Layer.buildWithMemoMap(dbLayer, memoMap, scope)

  // Build logger layer with same memoization (reuses memo if same layer)
  const loggerLayer = Layer.succeed(Logger, {
    log: Effect.fn("Logger.log")((msg: string) => sync(() => logs.push(msg)))
  })
  const loggerContext = await Layer.buildWithMemoMap(
    loggerLayer,
    memoMap,
    scope
  )

  return {
    database: Context.get(dbContext, Database),
    logger: Context.get(loggerContext, Logger)
  }
}

const services = runSync(scoped(program))
runSync(services.logger.log("ready"))
logs // => ["ready"]
```

## build

**Building a layer into a context**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

// Build a layer to get its services
const program = effect {
  const dbLayer = Layer.succeed(Database, {
    query: Effect.fn("Database.query")((sql: string) => succeed("result"))
  })

  // Build the layer into Context - automatically manages scope and memoization
  const context = await Layer.build(dbLayer)

  // Extract the specific service from the built layer
  const database = Context.get(context, Database)

  return await database.query("SELECT * FROM users")
}

runSync(scoped(program)) // => "result"
```

## buildWithScope

**Building a layer with an explicit scope**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

const logs: Array<string> = []

// Build a layer with explicit scope control
const program = effect {
  const scope = await Effect.scope

  const dbLayer = Layer.effect(Database, effect {
    logs.push("Initializing database...")
    await Scope.addFinalizer(
      scope,
      sync(() => logs.push("Database closed"))
    )
    return { query: Effect.fn("Database.query")((sql: string) => succeed(`Result: ${sql}`)) }
  })

  // Build with specific scope - resources tied to this scope
  const context = await Layer.buildWithScope(dbLayer, scope)
  const database = Context.get(context, Database)

  return await database.query("SELECT * FROM users")
  // Database will be closed when scope is closed
}

runSync(scoped(program)) // => "Result: SELECT * FROM users"
logs // => ["Initializing database...", "Database closed"]
```

## succeed

**Creating a layer from a service implementation**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

const DatabaseLayer = Layer.succeed(Database, {
  query: Effect.fn("Database.query")((sql: string) => succeed(`Query result: ${sql}`))
})
const program = Database.use((database) => database.query("SELECT 1"))
runSync(provide(program, DatabaseLayer)) // => "Query result: SELECT 1"
```

## succeedContext

**Providing multiple services from a context**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

service Logger {
  readonly log: (msg: string) => Effect<void>
}

const logs: Array<string> = []
const context = Context.make(Database, {
  query: Effect.fn("Database.query")((sql: string) => succeed("result"))
}).pipe(
  Context.add(Logger, {
    log: (msg: string) => sync(() => logs.push(msg))
  })
)

const layer = Layer.succeedContext(context)
const program = Logger.use((logger) => logger.log("ready"))
runSync(provide(program, layer))
logs // => ["ready"]
```

## empty

**Disabling optional lifecycle work**

```efx
import { Option } from "effect"

const Service = Context.Service<string>("Service")
const context = runSync(scoped(Layer.build(Layer.empty)))
Context.getOption(context, Service) // => Option.none()
```

## sync

**Lazily providing a service**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

const layer = Layer.sync(Database, () => ({
  query: (sql: string) => succeed(`Query: ${sql}`)
}))
const program = Database.use((database) => database.query("SELECT 1"))
runSync(provide(program, layer)) // => "Query: SELECT 1"
```

## syncContext

**Lazily providing a context**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

const layer = Layer.syncContext(() =>
  Context.make(Database, {
    query: (sql: string) => succeed(`Query: ${sql}`)
  })
)
const program = Database.use((database) => database.query("SELECT 1"))
runSync(provide(program, layer)) // => "Query: SELECT 1"
```

## effect

**Creating a layer from an effect**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

const layer = Layer.effect(Database,
  sync(() => ({
    query: (sql: string) => succeed(`Query: ${sql}`)
  }))
)
const program = Database.use((database) => database.query("SELECT 1"))
runSync(provide(program, layer)) // => "Query: SELECT 1"
```

## effectContext

**Creating a layer from an effectful context**

```efx
class Database extends Context.Service<
  Database,
  { readonly query: (sql: string) => Effect<string> }
>()("Database") {}

const layer = Layer.effectContext(
  succeed(Context.make(Database, {
    query: (sql: string) => succeed(`Query: ${sql}`)
  }))
)
const program = Database.use((database) => database.query("SELECT 1"))
runSync(provide(program, layer)) // => "Query: SELECT 1"
```

## effectDiscard

**Running an effect during layer construction**

```efx
const logs: Array<string> = []
const initLayer = Layer.effectDiscard(
  sync(() => {
    logs.push("Initializing application...")
  })
)
runSync(scoped(Layer.build(initLayer)))
logs // => ["Initializing application..."]
```

## suspend

**Choosing a layer lazily**

```efx
class Config extends Context.Service<Config, string>()("Config") {}

const useProd = true

const layer = Layer.suspend(() =>
  useProd
    ? Layer.succeed(Config, "https://api.example.com")
    : Layer.succeed(Config, "http://localhost:3000")
)
runSync(provide(Config, layer)) // => "https://api.example.com"
```

## unwrap

**Unwrapping an effectful layer**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

const layerEffect = succeed(
  Layer.succeed(Database, { query: Effect.fn("Database.query")((sql: string) => succeed("result")) })
)

const unwrappedLayer = Layer.unwrap(layerEffect)
const program = Database.use((database) => database.query("SELECT 1"))
runSync(provide(program, unwrappedLayer)) // => "result"
```

## mergeAll

**Merging independent layers**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

service Logger {
  readonly log: (msg: string) => Effect<void>
}

const dbLayer = Layer.succeed(Database, {
  query: Effect.fn("Database.query")((sql: string) => succeed("result"))
})
const logs: Array<string> = []
const loggerLayer = Layer.succeed(Logger, {
  log: Effect.fn("Logger.log")((msg: string) => sync(() => logs.push(msg)))
})

layer mergedLayer = dbLayer & loggerLayer
const program = Logger.use((logger) => logger.log("ready"))
runSync(provide(program, mergedLayer))
logs // => ["ready"]
```

## merge

**Merging two layers**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

service Logger {
  readonly log: (msg: string) => Effect<void>
}

const dbLayer = Layer.succeed(Database, {
  query: Effect.fn("Database.query")((sql: string) => succeed("result"))
})
const loggerLayer = Layer.succeed(Logger, {
  log: Effect.fn("Logger.log")((_msg: string) => Effect.void)
})

const mergedLayer = Layer.merge(dbLayer, loggerLayer)
const program = Database.use((database) => database.query("SELECT 1"))
runSync(provide(program, mergedLayer)) // => "result"
```

## provide

**Providing layer dependencies**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

service UserService {
  readonly getUser: (id: string) => Effect<{
    id: string
    name: string
  }>
}

service Logger {
  readonly log: (msg: string) => Effect<void>
}

// Create dependency layers
const databaseLayer = Layer.succeed(Database, {
  query: Effect.fn("Database.query")((sql: string) => succeed(`DB: ${sql}`))
})

const logs: Array<string> = []
const loggerLayer = Layer.succeed(Logger, {
  log: Effect.fn("Logger.log")((msg: string) => sync(() => logs.push(`[LOG] ${msg}`)))
})

// UserService depends on Database and Logger
const userServiceLayer = Layer.effect(UserService, effect {
  const database = await Database
  const logger = await Logger

  return {
    getUser: Effect.fn("UserService.getUser")(function*(id: string) {
        yield* logger.log(`Looking up user ${id}`)
        const result = yield* database.query(
          `SELECT * FROM users WHERE id = ${id}`
        )
        return { id, name: result }
      })
  }
})

// Provide dependencies to UserService layer
const userServiceWithDependencies = userServiceLayer.pipe(
  Layer.provide(Layer.mergeAll(databaseLayer, loggerLayer))
)

// Now UserService layer has no dependencies
const program = effect {
  const userService = await UserService
  return await userService.getUser("123")
}
  |> provide(userServiceWithDependencies)
runSync(program) // => { id: "123", name: "DB: SELECT * FROM users WHERE id = 123" }
logs // => ["[LOG] Looking up user 123"]
```

## provideMerge

**Providing dependencies while retaining services**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

service Logger {
  readonly log: (msg: string) => Effect<void>
}

service UserService {
  readonly getUser: (id: string) => Effect<{
    id: string
    name: string
  }>
}

// Create dependency layers
const databaseLayer = Layer.succeed(Database, {
  query: Effect.fn("Database.query")((sql: string) => succeed(`DB: ${sql}`))
})

const logs: Array<string> = []
const loggerLayer = Layer.succeed(Logger, {
  log: Effect.fn("Logger.log")((msg: string) => sync(() => logs.push(`[LOG] ${msg}`)))
})

// UserService depends on Database and Logger
const userServiceLayer = Layer.effect(UserService, effect {
  const database = await Database
  const logger = await Logger

  return {
    getUser: Effect.fn("UserService.getUser")(function*(id: string) {
        yield* logger.log(`Looking up user ${id}`)
        const result = yield* database.query(
          `SELECT * FROM users WHERE id = ${id}`
        )
        return { id, name: result }
      })
  }
})

// Provide dependencies and merge all services together
const allServicesLayer = userServiceLayer.pipe(
  Layer.provideMerge(Layer.mergeAll(databaseLayer, loggerLayer))
)

// Now the resulting layer provides UserService, Database, AND Logger
const program = effect {
  const userService = await UserService
  const logger = await Logger // Still available!
  const database = await Database // Still available!

  const user = await userService.getUser("123")
  await logger.log(`Found user: ${user.name}`)

  return user
}
  |> provide(allServicesLayer)
runSync(program) // => { id: "123", name: "DB: SELECT * FROM users WHERE id = 123" }
logs // => ["[LOG] Looking up user 123", "[LOG] Found user: DB: SELECT * FROM users WHERE id = 123"]
```

## flatMap

**Creating services from layer output**

```efx
service Config {
  readonly dbUrl: string
  readonly logLevel: string
}

service Database {
  readonly query: (sql: string) => Effect<string>
}

service Logger {
  readonly log: (msg: string) => Effect<void>
}

const logs: Array<string> = []

// Base config layer
const configLayer = Layer.succeed(Config, {
  dbUrl: "postgres://localhost:5432/mydb",
  logLevel: "debug"
})

// Dynamically create services based on config
const dynamicServiceLayer = configLayer.pipe(
  Layer.flatMap((context) => {
    const config = Context.get(context, Config)

    // Create database layer based on config
    const dbLayer = Layer.succeed(Database, {
      query: Effect.fn("Database.query")((sql: string) =>
        succeed(
          `Querying ${config.dbUrl}: ${sql}`
        ))
    })

    // Create logger layer based on config
    const loggerLayer = Layer.succeed(Logger, {
      log: Effect.fn("Logger.log")((msg: string) =>
        config.logLevel === "debug"
          ? sync(() => logs.push(`[DEBUG] ${msg}`))
          : sync(() => logs.push(msg))
      )
    })

    // Return combined layer
    return Layer.mergeAll(dbLayer, loggerLayer)
  })
)

// Use the dynamic services
const program = effect {
  const database = await Database
  const logger = await Logger

  await logger.log("Starting database query")
  const result = await database.query("SELECT * FROM users")

  return result
}
  |> provide(dynamicServiceLayer)
runSync(program) // => "Querying postgres://localhost:5432/mydb: SELECT * FROM users"
logs // => ["[DEBUG] Starting database query"]
```

## orDie

**Converting layer failures to defects**

```efx
import { Exit } from "effect"

class DatabaseError extends Data.TaggedError("DatabaseError")<{
  message: string
}> {}

service Database {
  readonly query: (sql: string) => Effect<string>
}

// Layer that can fail during construction
const error = new DatabaseError({ message: "Connection failed" })
const flakyDatabaseLayer = Layer.effect(
  Database,
  fail(error)
)

// Convert failures to fiber death - removes error from type
const reliableDatabaseLayer = flakyDatabaseLayer.pipe(Layer.orDie)

// Now the layer type is Layer<Database, never, never> - no error in type
const program = effect {
  const database = await Database
  return await database.query("SELECT * FROM users")
}
  |> provide(reliableDatabaseLayer)

runSync(exit(program)) // => Exit.die(error)
```

## catchTag

**Recovering from tagged layer errors**

```efx
class ConfigError extends Data.TaggedError("ConfigError") {}

service Config {
  readonly apiUrl: string
}

const configLayer = Layer.effect(Config, fail(new ConfigError()))

const fallbackLayer = Layer.succeed(Config, { apiUrl: "http://localhost" })

const recovered = configLayer.pipe(
  Layer.catchTag("ConfigError", () => fallbackLayer)
)
const program = Config.useSync((config) => config.apiUrl)
runSync(provide(program, recovered)) // => "http://localhost"
```

## catchCause

**Recovering from layer failures by cause**

```efx
class DatabaseError extends Data.TaggedError("DatabaseError")<{
  message: string
}> {}

service Database {
  readonly query: (sql: string) => Effect<string>
}

const primaryDatabaseLayer = Layer.effect(Database,
  fail(new DatabaseError({ message: "Primary DB unreachable" }))
)

const databaseWithFallback = primaryDatabaseLayer.pipe(
  Layer.catchCause(() => {
    return Layer.succeed(Database, {
      query: Effect.fn("Database.query")((sql: string) => succeed(`Memory: ${sql}`))
    })
  })
)

const program = effect {
  const database = await Database
  return await database.query("SELECT * FROM users")
}
  |> provide(databaseWithFallback)

await runPromise(program) // => "Memory: SELECT * FROM users"
```

## fresh

**Creating non-shared layer instances**

```efx
service Counter {
  readonly id: number
}

service Left {
  readonly counterId: number
}

service Right {
  readonly counterId: number
}

const leftLayer = Layer.effect(Left, effect {
  const counter = await Counter
  return { counterId: counter.id }
})

const rightLayer = Layer.effect(Right, effect {
  const counter = await Counter
  return { counterId: counter.id }
})

const compareIds = effect {
  const left = await Left
  const right = await Right
  return left.counterId === right.counterId
}

const program = effect {
  const nextId = await Ref.make(0)

  const counterLayer = Layer.effect(Counter, effect {
    const id = await Ref.updateAndGet(nextId, (n) => n + 1)
    return { id }
  })

  const shared = Layer.merge(
    Layer.provide(leftLayer, counterLayer),
    Layer.provide(rightLayer, counterLayer)
  )

  const sharedResult = await provide(compareIds, shared)

  const freshCounterLayer = Layer.fresh(counterLayer)
  const fresh = Layer.merge(
    Layer.provide(leftLayer, freshCounterLayer),
    Layer.provide(rightLayer, freshCounterLayer)
  )

  const freshResult = await provide(compareIds, fresh)

  return { shared: sharedResult, fresh: freshResult }
}

await runPromise(program) // => { shared: true, fresh: false }
```

## launch

**Launching an application layer**

```efx
service HttpServer {
  readonly port: number
}

const program = effect {
  const events = await Ref.make<Array<string>>([])
  const started = await Deferred.make<void>()

  const serverLayer = Layer.effect(HttpServer, effect {
    await Ref.update(events, (events) => [...events, "Starting HTTP server..."])
    await Deferred.succeed(started, undefined)
    return { port: 3000 }
  })

  const fiber = await forkChild(Layer.launch(serverLayer))
  await Deferred.await(started)
  await Fiber.interrupt(fiber)
  return await Ref.get(events)
}

await runPromise(program) // => ["Starting HTTP server..."]
```

## mock

**Mocking services for tests**

```efx
service UserService {
  readonly config: { apiUrl: string }
  readonly getUser: (
    id: string
  ) => Effect<{ id: string; name: string }, Error>
  readonly deleteUser: (id: string) => Effect<void, Error>
  readonly updateUser: (
    id: string,
    data: object
  ) => Effect<{ id: string; name: string }, Error>
}

// Create a partial mock - only implement what you need for testing
const testUserLayer = Layer.mock(UserService, {
  config: { apiUrl: "https://test-api.com" }, // Required - non-Effect property
  getUser: (id: string) => succeed({ id, name: "Test User" }) // Mock implementation
  // deleteUser and updateUser are omitted - will throw UnimplementedError if called
})

// Use in tests
const testProgram = effect {
  const userService = await UserService

  // This works - we provided an implementation
  const user = await userService.getUser("123")

  // This would throw - we didn't implement deleteUser
  // yield* userService.deleteUser("123") // UnimplementedError

  return user.name
}
  |> provide(testUserLayer)
runSync(testProgram) // => "Test User"
```

## satisfiesSuccessType

**Constraining layer success types**

```efx
import { Context, Layer } from "effect"

const NumberService = Context.Service<number>("Number")
const numberLayer = Layer.succeed(NumberService, 42)

// Define a constraint that the success type must be a number
const satisfiesNumber = Layer.satisfiesSuccessType<number>()

// This works - Layer<42, never, never> extends Layer<number, never, never>
const validLayer = satisfiesNumber(numberLayer)
```

## satisfiesErrorType

**Constraining layer error types**

```efx
const typeErrorLayer = Layer.effectDiscard(fail(new TypeError("boom")))

// Define a constraint that the error type must be an Error
const satisfiesError = Layer.satisfiesErrorType<Error>()

// This works - Layer<never, TypeError, never> extends Layer<never, Error, never>
const validLayer = satisfiesError(typeErrorLayer)
```

## satisfiesServicesType

**Constraining layer service requirements**

```efx
const NumberService = Context.Service<number>("Number")
const numberLayer = Layer.effectDiscard(asVoid(NumberService))

// Define a constraint that the service requirements must be numbers
const satisfiesNumber = Layer.satisfiesServicesType<number>()

// This works - Layer<never, never, 42> extends Layer<never, never, number>
const validLayer = satisfiesNumber(numberLayer)
```

## span

**Tracing layer construction with a span**

```efx
import type { Tracer } from "effect"

service Database {
  readonly query: (sql: string) => Effect<string>
}

const logs: Array<string> = []

// Create a traced layer - all operations performed during construction of
// the `Database` service are part of the "database-init" span
const databaseLayer = Layer.effect(Database, effect {
  // These operations are traced under "database-init" span
  logs.push("Connecting to database")
  logs.push("Database connected")

  const parentSpan = await currentParentSpan
  logs.push((parentSpan as Tracer.Span).name)

  return {
    query: Effect.fn("Database.query")((sql: string) => succeed(`Result: ${sql}`))
  }
}).pipe(Layer.provide(Layer.span("database-init", {
  onEnd: (span, exit) =>
    sync(() => logs.push(`Span ${span.name} ended with: ${exit._tag}`))
})))

const program = Database.use((database) => database.query("SELECT 1"))
runSync(provide(program, databaseLayer)) // => "Result: SELECT 1"
logs // => ["Connecting to database", "Database connected", "database-init", "Span database-init ended with: Success"]
```

## parentSpan

**Referencing an existing parent span**

```efx
service Database {
  readonly spanId: string
  readonly query: (sql: string) => Effect<string>
}

// Create a layer that uses an existing span as parent
const databaseLayer = Layer.effect(
  Database,
  effect {
    const parentSpan = await currentParentSpan

    return {
      spanId: parentSpan.spanId,
      query: Effect.fn("Database.query")((sql: string) => succeed(`Result: ${sql}`))
    }
  }
).pipe(Layer.provide(Layer.parentSpan(Tracer.externalSpan({
  spanId: "42",
  traceId: "000"
}))))
const program = Database.use((database) =>
  map(database.query("SELECT 1"), (result) => ({ spanId: database.spanId, result })))
runSync(provide(program, databaseLayer)) // => { spanId: "42", result: "Result: SELECT 1" }
```

## withSpan

**Wrapping a layer with a span**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

service Logger {
  readonly log: (msg: string) => Effect<void>
}

const logs: Array<string> = []

// Create layers with tracing
const databaseLayer = Layer.effect(Database, effect {
  return {
    query: Effect.fn("Database.query")((sql: string) => succeed(`Result: ${sql}`))
  }
}).pipe(Layer.withSpan("database-initialization", {
  attributes: { dbType: "postgres" }
}))

const loggerLayer = Layer.succeed(Logger, {
  log: Effect.fn("Logger.log")((msg: string) => sync(() => logs.push(msg)))
}).pipe(Layer.withSpan("logger-initialization"))

// Combine traced layers
layer appLayer = databaseLayer & loggerLayer
  |> withSpan("app-initialization", {
    onEnd: (span, exit) =>
      Effect.sync(() => logs.push(`Application initialization completed: ${exit._tag}`))
  })

const program = effect {
  const database = await Database
  const logger = await Logger

  await logger.log("Application ready")
  return await database.query("SELECT * FROM users")
} |> provide(appLayer)
runSync(program) // => "Result: SELECT * FROM users"
logs // => ["Application ready", "Application initialization completed: Success"]
```

## withParentSpan

**Attaching layers to an existing parent span**

```efx
service Database {
  readonly query: (sql: string) => Effect<string>
}

service Cache {
  readonly get: (key: string) => Effect<string | null>
}

// Create layers
const DatabaseLayer = Layer.effect(Database, effect {
  return {
    query: Effect.fn("Database.query")((sql: string) => succeed(`DB: ${sql}`))
  }
})

const CacheLayer = Layer.effect(Cache, effect {
  return {
    get: Effect.fn("Cache.get")((key: string) => succeed(`Cache: ${key}`))
  }
})

// Use with an existing parent span from Effect.withSpan
const program = withSpan("application-startup")(
  effect {
    const parentSpan = await Tracer.ParentSpan

    // Both layers will be children of "application-startup" span
    const AppLayer = Layer.mergeAll(DatabaseLayer, CacheLayer).pipe(
      Layer.withParentSpan(parentSpan)
    )

    const context = await Layer.build(AppLayer)
    const database = Context.get(context, Database)
    const cache = Context.get(context, Cache)

    const dbResult = await database.query("SELECT * FROM users")
    const cacheResult = await cache.get("user:123")

    return { dbResult, cacheResult }
  }
)
runSync(scoped(program)) // => { dbResult: "DB: SELECT * FROM users", cacheResult: "Cache: user:123" }
```
