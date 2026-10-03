# effect/Config

The examples in the JSDoc of `packages/effect/src/Config.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## isConfig

**Checking Config values**

```efx
import { Config } from "effect"

Config.isConfig(Config.String("HOST")) // => true
Config.isConfig("not a config") // => false
```

## map

**Uppercasing a string config**

```efx
const upper = Config.String("name").pipe(
  Config.map((s) => s.toUpperCase())
)

const provider = ConfigProvider.fromUnknown({ name: "alice" })
runSync(upper.parse(provider)) // => "ALICE"
```

## flatMap

**fallback configs and branching**

```efx
import { Config, Option } from "effect"

const EnvVar = (name: string) =>
  Config.Literals([
    ...["prod", "production", "PROD", "PRODUCTION"] as const,
    ...["dev", "development", "DEV", "DEVELOPMENT"] as const
  ], name)

const withAbsenceFallback = <A, B>(fallback: Config.Config<A>) => (self: Config.Config<B>): Config.Config<A | B> =>
  Config.flatMap(
    Config.option(self),
    Option.match({
      onNone: () => fallback,
      onSome: Config.succeed<A | B>
    })
  )

// const ENV: Config.Config<"dev" | "prod">
const ENV = EnvVar("ENV").pipe(
  withAbsenceFallback(EnvVar("NODE_ENV")),
  Config.map((fuzzyEnv) =>
    fuzzyEnv.toLowerCase().startsWith("dev") ? "dev" : "prod"),
  Config.withDefault('dev')
)

// const hostConfig: Config.Config<string>
const hostConfig = ENV.pipe(
  Config.flatMap((env) =>
    env === "dev"
      // dev is very forgiving
      ? Config.NonEmptyString("DEV_HOST").pipe(
        Config.orElse(() => Config.NonEmptyString("HOST")),
        Config.orElse(() => Config.succeed("localhost"))
      )
      // prod is much stricter
      : Config.NonEmptyString("PROD_HOST").pipe(
        withAbsenceFallback(Config.NonEmptyString("HOST"))
      )
  )
)
```

## mapEffect

**Wrapping a value in an effectful transformation**

```efx
const trimmed = Config.String("name").pipe(
  Config.mapEffect((s) => succeed(s.trim()))
)
const provider = ConfigProvider.fromUnknown({ name: " Alice " })
runSync(trimmed.parse(provider)) // => "Alice"
```

## orElse

**Trying another port before using a default**

```efx
const port = Config.Int("PORT").pipe(
  Config.orElse(() => Config.Int("BACKUP_PORT")),
  Config.withDefault(3000)
)
const provider = ConfigProvider.fromUnknown({ PORT: "invalid", BACKUP_PORT: "8080" })
await runPromise(port.parse(provider)) // => 8080

const missingBackup = ConfigProvider.fromUnknown({ PORT: "invalid" })
await runPromise(port.parse(missingBackup)) // => 3000
```

## all

**Defaulting an incomplete config group**

```efx
const dbConfig = Config.all({
  host: Config.String("host"),
  port: Config.Number("port")
}).pipe(Config.withDefault({ host: "localhost", port: 5432 }))

const provider = ConfigProvider.fromUnknown({ host: "db.internal", port: 6000 })
await runPromise(dbConfig.parse(provider)) // => { host: "db.internal", port: 6000 }

const missingPort = ConfigProvider.fromUnknown({ host: "db.internal" })
await runPromise(dbConfig.parse(missingPort)) // => { host: "localhost", port: 5432 }
```

## withDefault

**Defaulting a missing port**

```efx
const port = Config.Number("port").pipe(Config.withDefault(3000))

const provider = ConfigProvider.fromUnknown({})
runSync(port.parse(provider)) // => 3000
```

## option

**Reading optional config**

```efx
import { Config, ConfigProvider, Effect, Option } from "effect"

const maybePort = Config.option(Config.Number("port"))

const provider = ConfigProvider.fromUnknown({})
runSync(maybePort.parse(provider)) // => Option.none()
```

## unwrap

**Unwrapping a record of configs**

```efx
interface Options {
  key: string
}

const makeConfig = (config: Config.Wrap<Options>): Config<Options> =>
  Config.unwrap(config)

const config = makeConfig({ key: Config.String("key") })
const provider = ConfigProvider.fromUnknown({ key: "value" })
runSync(config.parse(provider)) // => { key: "value" }
```

## schema

**Reading a structured config**

```efx
const DbConfig = Config.schema(
  Schema.Struct({
    host: Schema.String,
    port: Schema.Int
  }),
  "db"
)

const provider = ConfigProvider.fromUnknown({
  db: { host: "localhost", port: 5432 }
})

runSync(DbConfig.parse(provider)) // => { host: "localhost", port: 5432 }
```

## succeed

**Returning a constant fallback**

```efx
const host = Config.String("HOST").pipe(
  Config.orElse(() => Config.succeed("localhost"))
)
const provider = ConfigProvider.fromUnknown({})
runSync(host.parse(provider)) // => "localhost"
```

## String

**Reading a string config**

```efx
const host = Config.String("HOST")

const provider = ConfigProvider.fromUnknown({ HOST: "localhost" })
runSync(host.parse(provider)) // => "localhost"
```

## Literal

**Restricting to a literal**

```efx
const env = Config.Literal("production", "ENV")
const provider = ConfigProvider.fromUnknown({ ENV: "production" })
runSync(env.parse(provider)) // => "production"
```

## Literals

**Restricting to a set of literals**

```efx
const env = Config.Literals(["development", "production"], "ENV")
const provider = ConfigProvider.fromUnknown({ ENV: "development" })
runSync(env.parse(provider)) // => "development"
```

## Array

**Reading a comma-separated array**

```efx
const config = Config.Array(Schema.String, "EXPORTERS")
const provider = ConfigProvider.fromEnv({ env: { EXPORTERS: "otlp,console" } })

runSync(config.parse(provider)) // => ["otlp", "console"]
```

## Record

**Reading a comma-separated record**

```efx
const config = Config.Record(Schema.String, Schema.String, "OTEL_RESOURCE_ATTRIBUTES")
const provider = ConfigProvider.fromEnv({
  env: {
    OTEL_RESOURCE_ATTRIBUTES:
      "service.name=my-service,service.version=1.0.0,custom.attribute=value"
  }
})

const result = runSync(config.parse(provider))
result["service.name"] // => "my-service"
result["service.version"] // => "1.0.0"
result["custom.attribute"] // => "value"
```

## Boolean

**Reading a boolean flag**

```efx
const program = Config.Boolean("FEATURE_FLAG")

const provider = ConfigProvider.fromEnv({
  env: {
    FEATURE_FLAG: "yes"
  }
})

runSync(
  program.pipe(provideService(ConfigProvider.ConfigProvider, provider))
) // => true
```

## Duration

**Reading a duration**

```efx
const program = Config.Duration("DURATION").pipe(map(Duration.toMillis))

const provider = ConfigProvider.fromEnv({
  env: {
    DURATION: "10 seconds"
  }
})

runSync(
  program.pipe(provideService(ConfigProvider.ConfigProvider, provider))
) // => 10000
```

## Port

**Reading a port**

```efx
const program = Config.Port("PORT")

const provider = ConfigProvider.fromEnv({
  env: {
    PORT: "8080"
  }
})

runSync(
  program.pipe(provideService(ConfigProvider.ConfigProvider, provider))
) // => 8080
```

## LogLevel

**Reading a log level**

```efx
const program = Config.LogLevel("LOG_LEVEL")

const provider = ConfigProvider.fromEnv({
  env: {
    LOG_LEVEL: "Info"
  }
})

runSync(
  program.pipe(provideService(ConfigProvider.ConfigProvider, provider))
) // => "Info"
```

## Redacted

**Reading a secret**

```efx
const program = Config.Redacted("API_KEY").pipe(map(String))

const provider = ConfigProvider.fromEnv({
  env: {
    API_KEY: "sk-1234567890abcdef"
  }
})

runSync(
  program.pipe(provideService(ConfigProvider.ConfigProvider, provider))
) // => "<redacted>"
```

## URL

**Reading a URL**

```efx
const program = Config.URL("URL").pipe(map((url) => url.href))

const provider = ConfigProvider.fromEnv({
  env: {
    URL: "https://example.com"
  }
})

runSync(
  program.pipe(provideService(ConfigProvider.ConfigProvider, provider))
) // => "https://example.com/"
```

## Date

**Reading a date**

```efx
const createdAt = Config.Date("CREATED_AT")

const provider = ConfigProvider.fromUnknown({ CREATED_AT: "2024-01-15" })
runSync(createdAt.parse(provider)).toISOString() // => "2024-01-15T00:00:00.000Z"
```

## nested

**Nesting a struct config under `"database"`**

```efx
const dbConfig = Config.all({
  host: Config.String("host"),
  port: Config.Number("port")
}).pipe(Config.nested("database"))

const provider = ConfigProvider.fromUnknown({
  database: { host: "localhost", port: "5432" }
})
runSync(dbConfig.parse(provider)) // => { host: "localhost", port: 5432 }
```

**Reading env vars with a nested prefix**

```efx
const host = Config.String("host").pipe(Config.nested("database"))

const provider = ConfigProvider.fromEnv({
  env: { database_host: "localhost" }
})
runSync(host.parse(provider)) // => "localhost"
```
