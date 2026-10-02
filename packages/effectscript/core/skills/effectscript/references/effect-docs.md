<!-- Generated from @effectscript/effect-docs content/LLMS.efx.md (ADR-0050): Effect's guide for agents, with EffectScript code. -->

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

# Effect library documentation

This documentation covers the Effect library and its related packages.

When you need to find information about Effect, use this documentation and the
Effect source code available in your environment. Avoid unrelated copies of
Effect or external documentation, as they may be outdated or incorrect.

**Note**: The examples in this documentation contain comments for illustration
purposes. In practice, you would not include these comments in your code.

## Writing `Effect` code

Prefer `Effect.gen` for inline Effect code. For reusable functions, prefer
`Effect.fn("name")` when tracing is useful and `Effect.fnUntraced` when it is not,
particularly in library implementations and hot paths. Avoid functions that only
wrap and return `Effect.gen`. Attach additional behaviour with combinators; this
style is more readable and easier to maintain than using combinators alone.

### Using Effect.gen

Use `Effect.gen` to write code in an imperative style similar to async await.
You can use `yield*` to access the result of an effect.

```efx
effect {
  console.log("Starting the file processing...")
  console.log("Reading file...")

  // Always return when raising an error, to ensure typescript understands that
  // the function will not continue executing.
  throw new FileProcessingError({ message: "Failed to read the file" })
}
  // Add additional functionality with .pipe
  |> Effect.catch((error) => logError(`An error occurred: ${error}`))
  |> withSpan("fileProcessing", {
    attributes: {
      method: "Effect.gen"
    }
  })

// Use Schema.TaggedError to define a custom error
export error FileProcessingError {
  message: string
}
```

### Using Effect.fn and Effect.fnUntraced

When writing reusable functions that return an Effect, use `Effect.fn` or
`Effect.fnUntraced` to use the generator syntax.

Use `Effect.fn("name")` when the function should create a tracing span. Prefer
`Effect.fnUntraced` when tracing is not needed, particularly for library
implementations and hot paths.

**Avoid creating functions that only wrap and return an `Effect.gen`**.

```efx
// Pass a string to Effect.fn, which will improve stack traces and also
// attach a tracing span (using Effect.withSpan behind the scenes).
//
// The name string should match the function name.
//
// You can use `Effect.fn.Return` to specify the return type of the function.
// It accepts the same type parameters as `Effect.Effect`.
export effect effectFunction(n: number): string throws SomeError {
    console.info("Received number:", n)

    // Always return when raising an error, to ensure typescript understands that
    // the function will not continue executing.
    throw new SomeError({ message: "Failed to read the file" })
  }
  // Add additional functionality by passing in additional arguments.
  // **Do not** use .pipe with Effect.fn
  |> Effect.catch((error) => logError(`An error occurred: ${error}`))
  |> annotateLogs({
    method: "effectFunction"
  })

// Effect.fnUntraced avoids tracing and stack-frame capture while still reusing
// the generator body. This is preferred for library functions that do not
// represent a useful tracing boundary.
export const validateBatchSize = effect (size: number): number throws SomeError => {
  if (!Number.isInteger(size) || size <= 0) {
    throw new SomeError({ message: "Batch size must be a positive integer" })
  }
  return size
}

// Use Schema.TaggedError to define a custom error
export error SomeError {
  message: string
}
```

### More examples

- **[Creating effects from common sources](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/01_effect/01_basics/10_creating-effects.efx)**:
  Learn how to create effects from various sources, including plain values,
  synchronous code, Promise APIs, optional values, and callback-based APIs.

## Defining schemas and domain models

All validation and domain modeling in Effect is done with `Schema`.

**AVOID using predicates or manual parsing**, instead use `Schema` to parse untrusted data and validate it.

For a comprehensive guide, see [SCHEMA.md](https://github.com/Effect-TS/effect/blob/main/packages/effect/SCHEMA.md). Make sure to read the guide in chunks, as it is a large document.

- **[Schema basics](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/01_effect/02_schema/10_schema-basics.efx)**:
  Define `Schema.Class`s, decode unknown input into typed values, and
  encode typed values back into their external representation.

## Writing Effect services

Effect services are the most common way to structure Effect code. Prefer using
services to encapsulate behaviour over other approaches, as it ensures that your
code is modular, testable, and maintainable.

### Context.Service

The default way to define a service is to extend `Context.Service`,
passing in the service interface as a type parameter.

```efx
// file: src/db/Database.ts
import { Context } from "effect"

// Pass in the service class name as the first type parameter, and the service
// interface as the second type parameter.
export class Database extends Context.Service<Database, {
  query(sql: string): Effect<Array<unknown>, DatabaseError>
}>()(
  // The string identifier for the service, which should include the package
  // name and the subdirectory path to the service file.
  "myapp/db/Database"
) {
  // Attach a static layer to the service, which will be used to provide an
  // implementation of the service.
  static readonly layer = Layer.effect(
    Database,
    effect {
      // Define the service methods using Effect.fn
      const query = Effect.fn("Database.query")(function*(sql: string) {
        yield* log("Executing SQL query:", sql)
        return [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]
      })

      // Return an instance of the service using Database.of, passing in an
      // object that implements the service interface.
      return Database.of({
        query
      })
    }
  )
}

export error DatabaseError {
  cause: Defect
}

// If you ever need to access the service type, use `Database["Service"]`
export type DatabaseService = Database["Service"]
```

### More examples

- **[Context.Reference](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/01_effect/03_services/10_reference.efx)**: For defining configuration values, feature flags, or any other service that has a default value.
- **[Composing services with the Layer module](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/01_effect/03_services/20_layer-composition.efx)**:
  Build focused service layers, then compose them with `Layer.provide` and
  `Layer.provideMerge` based on what services you want to expose.
- **[Creating Layers from configuration and/or Effects](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/01_effect/03_services/20_layer-unwrap.efx)**: Build a layer dynamically from an Effect / Config with `Layer.unwrap`.

## Error handling

### Error handling basics

Defining custom errors and handling them with Effect.catch and Effect.catchTag.

```efx
import { Effect } from "effect"

// Define custom errors using Schema.TaggedError
export error ParseError {
  input: string
  message: string
}

export error ReservedPortError {
  port: Int
}

declare const loadPort: (input: string) => Effect.Effect<number, ParseError | ReservedPortError>

export const recovered = loadPort("80").pipe(
  // Catch multiple errors with Effect.catchTag, and return a default port number.
  catchTag(["ParseError", "ReservedPortError"], (_) => succeed(3000))
)

export const withFinalFallback = loadPort("invalid").pipe(
  // Catch a specific error with Effect.catchTag
  catchTag("ReservedPortError", (_) => succeed(3000)),
  // Catch all errors with Effect.catch
  Effect.catch((_) => succeed(3000))
)
```

### More examples

- **[Catch multiple errors with Effect.catchTags](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/01_effect/04_errors/10_catch-tags.efx)**: Use `Effect.catchTags` to handle several tagged errors in one place.
- **[Creating and handling errors with reasons](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/01_effect/04_errors/20_reason-errors.efx)**:
  Define a tagged error with a tagged `reason` field, then recover with
  `Effect.catchReason`, `Effect.catchReasons`, or by unwrapping the reason into
  the error channel with `Effect.unwrapReason`.

## Managing resources and `Scope`s

Learn how to safely manage resources in Effect using `Scope`s and finalizers.

- **[Acquiring resources with Effect.acquireRelease](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/01_effect/05_resources/10_acquire-release.efx)**:
  Define a service that uses `Effect.acquireRelease` to manage the lifecycle of
  a resource, ensuring that it is properly cleaned up when the service is no
  longer needed.
- **[Creating Layers that run background tasks](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/01_effect/05_resources/20_layer-side-effects.efx)**: Use Layer.effectDiscard to encapsulate background tasks without a service interface.
- **[Dynamic resources with LayerMap](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/01_effect/05_resources/30_layer-map.efx)**:
  Use `LayerMap.Service` to dynamically build and manage resources that are
  keyed by some identifier, such as a tenant ID.

## Running Effect programs

- **[Running effects with NodeRuntime and BunRuntime](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/01_effect/06_running/10_run-main.efx)**: Use `NodeRuntime.runMain` to run an Effect program as your process entrypoint.
- **[Using Layer.launch as the application entry point](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/01_effect/06_running/20_layer-launch.efx)**: Use `Layer.launch` to run a long-running Effect program as your process entrypoint.

## Broadcasting messages with PubSub

Use `PubSub` when you need one producer to fan out messages to many consumers.

- **[Broadcasting domain events with PubSub](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/01_effect/07_pubsub/10_pubsub.efx)**: Build an in-process event bus with `PubSub` and expose it as a service.

## Working with Streams

Effect Streams represent effectful, pull-based sequences of values over time.
They let you model finite or infinite data sources.

- **[Creating streams from common data sources](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/03_stream/10_creating-streams.efx)**:
  Learn how to create streams from various data sources. Includes:

  - `Stream.fromIterable` for arrays and other iterables
  - `Stream.fromEffectSchedule` for polling effects
  - `Stream.paginate` for paginated APIs
  - `Stream.fromAsyncIterable` for async iterables
  - `Stream.fromEventListener` for DOM events
  - `Stream.callback` for any callback-based API
  - `NodeStream.fromReadable` for Node.js readable streams
- **[Consuming and transforming streams](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/03_stream/20_consuming-streams.efx)**: How to transform and consume streams using operators like `map`, `flatMap`, `filter`, `mapEffect`, and various `run*` methods.
- **[Decoding and encoding streams](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/03_stream/30_encoding.efx)**:
  Use `Stream.pipeThroughChannel` with the `Ndjson` and `SchemaBinary` modules to
  decode and encode streams of structured data.

## Integrating Effect into existing applications

`ManagedRuntime` bridges Effect programs with non-Effect code. Build one runtime
from your application Layer, then use it anywhere you need imperative execution,
like web handlers, framework hooks, worker queues, or legacy callback APIs.

- **[Using ManagedRuntime with Hono](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/04_integration/10_managed-runtime.efx)**: Use `ManagedRuntime` to run Effect programs from external frameworks while keeping your domain logic in services and Layers.

## Batching external requests

Learn how to batch multiple requests into fewer external calls.

- **[Batching requests with RequestResolver](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/05_batching/10_request-resolver.efx)**: Define request types with `Request.Class`, resolve them in batches with `RequestResolver`.

## Working with Schedules

Schedules define recurring patterns for retries, repeats and polling.

- **[Working with the Schedule module](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/06_schedule/10_schedules.efx)**: Build schedules, compose them, and use them with `Effect.retry` and `Effect.repeat`.

## Working with DateTime

When working with dates and time, use the `DateTime` module instead of `Date` and `Date.now`.

Use it when your Effect programs need testable current time, safe parsing, stable ISO formatting, time-zone conversion, or calendar arithmetic.

- **[Creating and formatting DateTime values](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/07_datetime/10_creating-and-formatting.efx)**:
  Parse incoming date values safely, use Clock-powered current time, and format
  instants for API payloads or user-facing labels.
- **[Working with time zones](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/07_datetime/20_time-zones.efx)**:
  Attach IANA zones to instants, render zoned ISO strings, and provide a
  CurrentTimeZone service for code that should use the workspace/user zone.

## Observability

Effect has built-in support for structured logging, distributed tracing, and
metrics. For exporting telemetry, use the lightweight Otlp modules from
`effect/observability` in new projects, or use
`@effect/opentelemetry` NodeSdk when integrating with an existing OpenTelemetry
setup.

- **[Customizing logging](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/08_observability/10_logging.efx)**: Configure loggers & log-level filtering for production applications.
- **[Setting up tracing with Otlp modules](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/08_observability/20_otlp-tracing.efx)**: Configure Otlp tracing + log export with a reusable observability layer.

## Testing Effect programs

- **[Writing Effect tests with @effect/vitest](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/09_testing/10_effect-tests.efx)**: Using `it.effect` for Effect-based tests.
- **[Testing services with shared layers](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/09_testing/20_layer-tests.efx)**: How to test Effect services that depend on other services.

## Runtime type guards

The `Predicate` module contains small, reusable runtime checks.

**NEVER** write your own helper functions like `isRecord` or `isString`, instead
use the helpers from the `Predicate` module.

Predicates can be composed with apis such as `Predicate.and`,
`Predicate.or`, `Predicate.not`, and `Predicate.compose`.

### Using the Predicate module

```efx
import { Predicate } from "effect"

const thing: unknown = {
  a: 1
}

if (Predicate.isObject(thing)) {
  if (Predicate.isNumber(thing.a)) {
    console.log("number", thing.a)
  }
}
```

## Working with SQL databases

Use the `effect/sql` modules together with a driver package such as
`@effect/sql-sqlite-node` to access SQL databases. Define domain models with
`Model.Class` to derive schemas for the database and JSON boundaries, run
migrations, and write type-safe queries.

- **[Getting started with SQL](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/40_sql/10_basics.efx)**:
  Define a schema-backed domain model, run migrations against a SQLite
  database, and expose a derived repository through a service.

## Effect HttpClient

Build http clients with the `HttpClient` module.

- **[Getting started with HttpClient](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/50_http-client/10_basics.efx)**: Define a service that uses the HttpClient module to fetch data from an external API

## Building HttpApi servers

`HttpApi` gives you schema-first, type-safe HTTP APIs with runtime validation, typed clients, and OpenAPI docs from one definition.

- **[Getting started with HttpApi](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/51_http-server/10_basics.efx)**:
  Define a schema-first API, implement handlers, secure endpoints with
  middleware, serve it over HTTP, and call it using a generated typed client.
- **[Testing HttpApi implementations](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/51_http-server/20_testing.efx)**:
  Test handlers through an in-memory typed client with `HttpApiTest`, without
  starting an HTTP server or touching a real database.

## Working with child processes

Use the `effect/process` modules to define child processes and run them with `ChildProcessSpawner`.

- **[Working with child processes](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/60_child-process/10_working-with-child-processes.efx)**: This example shows how to collect process output, compose pipelines, and stream long-running command output.

## Building CLI applications

Use the "effect/cli" modules to build CLI applications. These modules
provide utilities for parsing command-line arguments, handling user input, and
managing the flow of a CLI application.

- **[Getting started with Effect CLI modules](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/70_cli/10_basics.efx)**:
  Build a command-line app with typed arguments and flags, then wire subcommand
  handlers into a single executable command.

## Working with AI modules

Effect's AI modules provide a provider-agnostic interface for language models.
You can generate text, decode structured objects with `Schema` and stream partial
responses.

- **[Using LanguageModel for text, objects, and streams](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/71_ai/10_language-model.efx)**:
  Configure a provider once, then use `LanguageModel` for plain text
  generation, schema-validated object generation, and streaming responses.
- **[Defining and using AI tools](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/71_ai/20_tools.efx)**:
  Define tools with schemas, group them into toolkits, implement handlers,
  and pass them to `LanguageModel.generateText`.
- **[Stateful chat sessions](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/71_ai/30_chat.efx)**:
  The AI `Chat` module maintains conversation history automatically. Build
  AI agents or chat assistants.

## Building distributed applications with cluster

The cluster modules let you model stateful services as entities and distribute
them across multiple machines.

- **[Defining cluster entities](https://github.com/EffectScript-Lang/effect-lang/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/80_cluster/10_entities.efx)**: Define distributed entity RPCs and run them in a cluster.
