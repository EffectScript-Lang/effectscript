# effect/ConfigProvider

The examples in the JSDoc of `packages/effect/src/ConfigProvider.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## makeValue

**Creating a value node**

```efx
import { ConfigProvider } from "effect"

ConfigProvider.makeValue("3000") // => { _tag: "Value", value: "3000" }
```

## makeRecord

**Creating a record node**

```efx
import { ConfigProvider } from "effect"

const node = ConfigProvider.makeRecord(new Set(["host", "port"]))
node._tag // => "Record"
if (node._tag === "Record") {
  node.keys // => new Set(["host", "port"])
  node.value // => undefined
}
```

## makeArray

**Creating an array node**

```efx
import { ConfigProvider } from "effect"

ConfigProvider.makeArray(3) // => { _tag: "Array", length: 3, value: undefined }
```

## SourceError

**Failing with a SourceError**

```efx
const provider = ConfigProvider.make((_path) =>
  fail(
    new ConfigProvider.SourceError({ message: "connection refused" })
  )
)

runSync(flip(provider.load(["host"]))).message // => "connection refused"
```

## Path

**A typical config path**

```efx
import type { ConfigProvider } from "effect"

const path: ConfigProvider.Path = ["database", "replicas", 0, "host"]
path.join(".") // => "database.replicas.0.host"
```

## ConfigProvider

**Providing a custom provider**

```efx
const provider = ConfigProvider.fromUnknown({ port: 8080 })

const program = effect {
  const current = await ConfigProvider
  return current
}
  |> provideService(ConfigProvider.ConfigProvider, provider)

runSync(program) === provider // => true
```

## make

**Creating a simple in-memory provider**

```efx
const data: Record<string, string> = {
  host: "localhost",
  port: "5432"
}

const provider = ConfigProvider.make((path) => {
  const key = path.join(".")
  const value = data[key]
  return succeed(
    value !== undefined ? ConfigProvider.makeValue(value) : undefined
  )
})

runSync(provider.load(["host"])) // => ConfigProvider.makeValue("localhost")
```

## orElse

**Falling back to a default provider**

```efx
const envProvider = ConfigProvider.fromEnv({
  env: { HOST: "prod.example.com" }
})
const defaults = ConfigProvider.fromUnknown({ HOST: "localhost", PORT: "3000" })

const combined = ConfigProvider.orElse(envProvider, defaults)

const host = runSync(combined.load(["HOST"]))
const port = runSync(combined.load(["PORT"]))
const values = [host?.value, port?.value] // => ["prod.example.com", "3000"]
```

## mapInput

**Uppercasing path segments**

```efx
const provider = ConfigProvider.fromEnv({
  env: { APP_HOST: "localhost" }
})

const upper = ConfigProvider.mapInput(provider, (path) =>
  path.map((seg) =>
    typeof seg === "string" ? seg.toUpperCase() : seg
  )
)

const node = runSync(upper.load(["app_host"]))
node?.value // => "localhost"
```

## constantCase

**Resolving camelCase keys to env vars**

```efx
const provider = ConfigProvider.fromEnv({
  env: { DATABASE_HOST: "localhost" }
}).pipe(ConfigProvider.constantCase)

// path ["databaseHost"] now resolves to env var DATABASE_HOST
const node = runSync(provider.load(["databaseHost"]))
node?.value // => "localhost"
```

## nested

**Nesting under a prefix**

```efx
const provider = ConfigProvider.fromEnv({
  env: { APP_HOST: "localhost", APP_PORT: "3000" }
})

// Lookups for ["HOST"] now resolve to ["APP", "HOST"]
const scoped = ConfigProvider.nested(provider, "APP")
const node = runSync(scoped.load(["HOST"]))
node?.value // => "localhost"
```

## layer

**Reading config from a JSON object**

```efx
import { Config, ConfigProvider, Effect, Layer } from "effect"

const TestLayer = ConfigProvider.layer(
  ConfigProvider.fromUnknown({ port: 8080 })
)

const program = effect {
  const port = await Config.Number("port")
  return port
}

runSync(provide(program, TestLayer)) // => 8080
```

## layerAdd

**Adding default values**

```efx
const defaults = ConfigProvider.fromUnknown({
  HOST: "localhost",
  PORT: "3000"
})

// The current env provider is tried first; `defaults` is the fallback
const DefaultsLayer = ConfigProvider.layerAdd(defaults)
const BaseLayer = ConfigProvider.layer(ConfigProvider.fromUnknown({}))
const program = Config.String("HOST")

const layer = Layer.provide(DefaultsLayer, BaseLayer)
runSync(provide(program, layer)) // => "localhost"
```

## fromUnknown

**Providing config from a plain object**

```efx
const provider = ConfigProvider.fromUnknown({
  database: {
    host: "localhost",
    port: 5432
  }
})

const host = Config.String("host").parse(
  provider.pipe(ConfigProvider.nested("database"))
)

runSync(host) // => "localhost"
```

## fromEnv

**Reading from a custom env record**

```efx
const provider = ConfigProvider.fromEnv({
  env: {
    DATABASE_HOST: "localhost",
    DATABASE_PORT: "5432"
  }
})

const host = Config.String("HOST").parse(
  provider.pipe(ConfigProvider.nested("DATABASE"))
)

runSync(host) // => "localhost"
```

## fromDotEnvContents

**Parsing .env contents**

```efx
const contents = `
HOST=localhost
PORT=3000
# this is a comment
`

const provider = ConfigProvider.fromDotEnvContents(contents)
const port = runSync(provider.load(["PORT"]))
port?.value // => "3000"
```

## fromDotEnv

**Loading a .env file**

```efx
const fileSystem = FileSystem.makeNoop({
  readFileString: () => succeed("HOST=localhost")
})

const program = effect {
  const provider = await ConfigProvider.fromDotEnv()
  return await provider.load(["HOST"])
}

const node = await runPromise(
  provideService(program, FileSystem.FileSystem, fileSystem)
)
node?.value // => "localhost"
```

## fromDir

**Reading config from a directory**

```efx
const fileSystem = FileSystem.makeNoop({
  readFileString: (path) =>
    path === "/etc/myapp/host"
      ? succeed("localhost")
      : die("unexpected path")
})

const program = effect {
  const provider = await ConfigProvider.fromDir({
    rootPath: "/etc/myapp"
  })
  return await provider.load(["host"])
}

const node = await runPromise(
  program.pipe(
    provide(Path.layer),
    provideService(FileSystem.FileSystem, fileSystem)
  )
)
node?.value // => "localhost"
```
