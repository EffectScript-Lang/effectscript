# effect/Context

The examples in the JSDoc of `packages/effect/src/Context.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Service

**Defining a service key**

```efx
import { Context } from "effect"

// Define an identifier for a database service
const Database = Context.Service<{ query: (sql: string) => string }>(
  "Database"
)

// The key can be used to store and retrieve services
const context = Context.make(Database, { query: (sql) => `Result: ${sql}` })
Context.get(context, Database).query("SELECT 1") // => "Result: SELECT 1"
```

**Creating service keys**

```efx
// Create a simple service
const Database = Context.Service<{
  query: (sql: string) => string
}>("Database")

// Create a service class
service Config {
  port: number
}

// Use the services to create contexts
const db = Context.make(Database, {
  query: (sql) => `Result: ${sql}`
})
const config = Context.make(Config, { port: 8080 })
Context.get(db, Database).query("SELECT 1") // => "Result: SELECT 1"
Context.get(config, Config).port // => 8080
```

**Extracting service types**

```efx
import { Context } from "effect"

const Database = Context.Service<{
  query: (sql: string) => string
}>("Database")

// Extract service type from a key
type DatabaseService = Context.Service.Shape<typeof Database>

// Extract identifier type from a key
type DatabaseId = Context.Service.Identifier<typeof Database>

Database.key // => "Database"
```

## Reference

**Defining a reference with a default value**

```efx
import { Context } from "effect"

// Define a reference with a default value
const messages: Array<string> = []
const LoggerRef: Context.Reference<{ log: (msg: string) => void }> =
  Context.Reference("Logger", {
    defaultValue: () => ({ log: (msg) => { messages.push(msg) } })
  })

// The reference can be used without explicit provision
const context = Context.empty()
const logger = Context.get(context, LoggerRef) // Uses default value
logger.log("default logger")
messages // => ["default logger"]
```

**Creating references with default values**

```efx
import { Context } from "effect"

// Create a reference with a default value
const messages: Array<string> = []
const LoggerRef = Context.Reference("Logger", {
  defaultValue: () => ({ log: (msg: string) => messages.push(`Default: ${msg}`) })
})

// The reference provides the default value when accessed from an empty context
const context = Context.empty()
const logger = Context.get(context, LoggerRef)

// You can also override the default value
const customContext = Context.make(LoggerRef, {
  log: (msg: string) => messages.push(`Custom: ${msg}`)
})
const customLogger = Context.get(customContext, LoggerRef)
logger.log("default")
customLogger.log("message")
messages // => ["Default: default", "Custom: message"]
```

## Service.Any

**Typing any service key**

```efx
import { Context } from "effect"

// Any represents any possible service type
const services: Array<Context.Service.Any> = [
  Context.Service<{ log: (msg: string) => void }>("Logger"),
  Context.Service<{ query: (sql: string) => string }>("Database")
]
services.map((service) => service.key) // => ["Logger", "Database"]
```

## Service.Shape

**Extracting a service shape**

```efx
import { Context } from "effect"

const Database = Context.Service<{ query: (sql: string) => string }>(
  "Database"
)

// Extract the service shape from the service
type DatabaseService = Context.Service.Shape<typeof Database>
// DatabaseService is { query: (sql: string) => string }
Database.key // => "Database"
```

## Service.Identifier

**Extracting a service identifier**

```efx
import { Context } from "effect"

const Database = Context.Service<{ query: (sql: string) => string }>(
  "Database"
)

// Extract the identifier type from a key
type DatabaseId = Context.Service.Identifier<typeof Database>
// DatabaseId is the identifier type
Database.key // => "Database"
```

## Context

**Creating a context with multiple services**

```efx
import { Context } from "effect"

// Create a context with multiple services
const Logger = Context.Service<{ log: (msg: string) => void }>("Logger")
const Database = Context.Service<{ query: (sql: string) => string }>(
  "Database"
)

const context = Context.make(Logger, { log: (_msg: string) => {} })
  .pipe(Context.add(Database, { query: (sql) => `Result: ${sql}` }))
Context.get(context, Database).query("SELECT 1") // => "Result: SELECT 1"
```

## makeUnsafe

**Creating a context from a map**

```efx
import { Context } from "effect"

// Create a context from a Map (unsafe)
const map = new Map([
  ["Logger", { log: (_msg: string) => {} }]
])

const context = Context.makeUnsafe(map)
context.mapUnsafe.size // => 1
```

## isContext

**Checking for contexts**

```efx
import { Context } from "effect"
Context.isContext(Context.empty()) // => true
```

## isKey

**Checking for keys**

```efx
import { Context } from "effect"
Context.isKey(Context.Service("Service")) // => true
```

## isReference

**Checking for references**

```efx
import { Context } from "effect"

const LoggerRef = Context.Reference("Logger", {
  defaultValue: () => ({ log: (_msg: string) => {} })
})

Context.isReference(LoggerRef) // => true
Context.isReference(Context.Service("Key")) // => false
```

## empty

**Creating an empty context**

```efx
import { Context } from "effect"
Context.empty().mapUnsafe.size // => 0
```

## make

**Creating a context with one service**

```efx
import { Context } from "effect"

const Port = Context.Service<{ PORT: number }>("Port")

const context = Context.make(Port, { PORT: 8080 })

Context.get(context, Port).PORT // => 8080
```

## add

**Adding a service to a context**

```efx
const Port = Context.Service<{ PORT: number }>("Port")
const Timeout = Context.Service<{ TIMEOUT: number }>("Timeout")

const someContext = Context.make(Port, { PORT: 8080 })

const context = someContext
  |> Context.add(Timeout, { TIMEOUT: 5000 })

const values = [Context.get(context, Port).PORT, Context.get(context, Timeout).TIMEOUT]
values // => [8080, 5000]
```

## addOrOmit

**Adding optional services**

```efx
import { Context, Option } from "effect"

const Port = Context.Service<{ PORT: number }>("Port")

const withPort = Context.empty().pipe(
  Context.addOrOmit(Port, Option.some({ PORT: 8080 }))
)

const withoutPort = withPort.pipe(
  Context.addOrOmit(Port, Option.none())
)
Context.getOption(withPort, Port) // => Option.some({ PORT: 8080 })
Context.getOption(withoutPort, Port) // => Option.none()
```

## getOrElse

**Falling back for missing services**

```efx
import { Context } from "effect"

const Logger = Context.Service<{ log: (msg: string) => void }>("Logger")
const Database = Context.Service<{ query: (sql: string) => string }>(
  "Database"
)

const context = Context.make(Logger, { log: (_msg: string) => {} })

const logger = Context.getOrElse(context, Logger, () => ({ log: () => {} }))
const database = Context.getOrElse(
  context,
  Database,
  () => ({ query: () => "fallback" })
)

logger === Context.get(context, Logger) // => true
database.query("SELECT 1") // => "fallback"
```

## getUnsafe

**Getting services unsafely**

```efx
import { Context, Option } from "effect"

const Port = Context.Service<{ PORT: number }>("Port")
const Timeout = Context.Service<{ TIMEOUT: number }>("Timeout")

const context = Context.make(Port, { PORT: 8080 })

Context.getUnsafe(context, Port).PORT // => 8080
Context.getOption(context, Timeout) // => Option.none()
```

## get

**Getting a service from a context**

```efx
const Port = Context.Service<{ PORT: number }>("Port")
const Timeout = Context.Service<{ TIMEOUT: number }>("Timeout")

const context = Context.make(Port, { PORT: 8080 })
  |> Context.add(Timeout, { TIMEOUT: 5000 })

Context.get(context, Timeout).TIMEOUT // => 5000
```

## getOption

**Getting optional services**

```efx
import { Context, Option } from "effect"

const Port = Context.Service<{ PORT: number }>("Port")
const Timeout = Context.Service<{ TIMEOUT: number }>("Timeout")

const context = Context.make(Port, { PORT: 8080 })

Context.getOption(context, Port) // => Option.some({ PORT: 8080 })
Context.getOption(context, Timeout) // => Option.none()
```

## merge

**Merging two contexts**

```efx
import { Context } from "effect"

const Port = Context.Service<{ PORT: number }>("Port")
const Timeout = Context.Service<{ TIMEOUT: number }>("Timeout")

const firstContext = Context.make(Port, { PORT: 8080 })
const secondContext = Context.make(Timeout, { TIMEOUT: 5000 })

const context = Context.merge(firstContext, secondContext)

const values = [Context.get(context, Port).PORT, Context.get(context, Timeout).TIMEOUT]
values // => [8080, 5000]
```

## mergeAll

**Merging multiple contexts**

```efx
import { Context } from "effect"

const Port = Context.Service<{ PORT: number }>("Port")
const Timeout = Context.Service<{ TIMEOUT: number }>("Timeout")
const Host = Context.Service<{ HOST: string }>("Host")

const firstContext = Context.make(Port, { PORT: 8080 })
const secondContext = Context.make(Timeout, { TIMEOUT: 5000 })
const thirdContext = Context.make(Host, { HOST: "localhost" })

const context = Context.mergeAll(
  firstContext,
  secondContext,
  thirdContext
)

context.mapUnsafe.size // => 3
```

## pick

**Picking services from a context**

```efx
import { Context, Option } from "effect"

const Port = Context.Service<{ PORT: number }>("Port")
const Timeout = Context.Service<{ TIMEOUT: number }>("Timeout")

const someContext = Context.make(Port, { PORT: 8080 })
  |> Context.add(Timeout, { TIMEOUT: 5000 })

const context = someContext |> Context.pick(Port)

Context.getOption(context, Port) // => Option.some({ PORT: 8080 })
Context.getOption(context, Timeout) // => Option.none()
```

## omit

**Omitting services from a context**

```efx
import { Context, Option } from "effect"

const Port = Context.Service<{ PORT: number }>("Port")
const Timeout = Context.Service<{ TIMEOUT: number }>("Timeout")

const someContext = Context.make(Port, { PORT: 8080 })
  |> Context.add(Timeout, { TIMEOUT: 5000 })

const context = someContext |> Context.omit(Timeout)

Context.getOption(context, Port) // => Option.some({ PORT: 8080 })
Context.getOption(context, Timeout) // => Option.none()
```
