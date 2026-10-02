# effect/cli/Flag

The examples in the JSDoc of `packages/effect/src/cli/Flag.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## String

**Creating string flags**

```efx
import { Flag } from "effect/cli"

const nameFlag = Flag.String("name")
// Usage: --name "John Doe"
nameFlag.kind // => "flag"
```

## Boolean

**Creating boolean flags**

```efx
import { Flag } from "effect/cli"

const verboseFlag = Flag.Boolean("verbose")
// Usage: --verbose (true) or --no-verbose (false)
// Omission fails unless the flag is made optional or given a fallback.
verboseFlag.kind // => "flag"
```

## Int

**Creating integer flags**

```efx
import { Flag } from "effect/cli"

const portFlag = Flag.Int("port")
// Usage: --port 8080
portFlag.kind // => "flag"
```

## Finite

**Creating float flags**

```efx
import { Flag } from "effect/cli"

const rateFlag = Flag.Finite("rate")
// Usage: --rate 3.14
rateFlag.kind // => "flag"
```

## Date

**Creating date flags**

```efx
import { Flag } from "effect/cli"

const startDateFlag = Flag.Date("start-date")
// Usage: --start-date 2023-12-25
startDateFlag.kind // => "flag"
```

## ChoiceWithValue

**Creating flag choices with values**

```efx
import { Flag } from "effect/cli"

// simple enum like choice mapping directly to string union
const color = Flag.Literals("color", ["red", "green", "blue"])

// choice with custom value mapping
const logLevel = Flag.ChoiceWithValue("log-level", [
  ["debug", "Debug" as const],
  ["info", "Info" as const],
  ["error", "Error" as const]
])
const kinds = [color.kind, logLevel.kind] // => ["flag", "flag"]
```

## Path

**Creating path flags**

```efx
import { Flag } from "effect/cli"

// Basic path flag
const pathFlag = Flag.Path("config-path")

// File-only path that must exist
const fileFlag = Flag.Path("input-file", {
  pathType: "file",
  mustExist: true
})

// Directory path with custom type name
const dirFlag = Flag.Path("output-dir", {
  pathType: "directory",
  typeName: "OUTPUT_DIRECTORY"
})
const kinds = [pathFlag.kind, fileFlag.kind, dirFlag.kind] // => ["flag", "flag", "flag"]
```

## File

**Creating file flags**

```efx
import { Flag } from "effect/cli"

// Basic file flag
const inputFlag = Flag.File("input")
// Usage: --input ./data.json

// File that must exist
const configFlag = Flag.File("config", { mustExist: true })
// Usage: --config ./config.yaml (file must exist)
const kinds = [inputFlag.kind, configFlag.kind] // => ["flag", "flag"]
```

## Directory

**Creating directory flags**

```efx
import { Flag } from "effect/cli"

// Basic directory flag
const outputFlag = Flag.Directory("output")
// Usage: --output ./build

// Directory that must exist
const sourceFlag = Flag.Directory("source", { mustExist: true })
// Usage: --source ./src (directory must exist)
const kinds = [outputFlag.kind, sourceFlag.kind] // => ["flag", "flag"]
```

## Redacted

**Creating redacted flags**

```efx

const CliTestLayer = Layer.mergeAll(
  FileSystem.layerNoop({}),
  Path.layer,
  Stdio.layerTest({}),
  Layer.succeed(Terminal.Terminal, Terminal.make({
    columns: succeed(80),
    rows: succeed(24),
    readInput: die("unused"),
    readLine: die("unused"),
    display: () => Effect.void
  })),
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => die("unused"))
  )
)

const passwordFlag = Flag.Redacted("password")

const program = Effect.gen(function*() {
  const [, password] = yield* passwordFlag.parse({
    arguments: [],
    flags: { "password": ["abc123"] }
  })
  return Redacted.value(password).length
})

await runPromise(program.pipe(provide(CliTestLayer))) // => 6
```

## FileText

**Reading file text**

```efx
import { Flag } from "effect/cli"

const config = Flag.FileText("config-file")
// --config-file ./app.json will read the file content
config.kind // => "flag"
```

## FileParse

**Parsing file contents**

```efx
import { Flag } from "effect/cli"

// Will use the extension of the file passed on the command line to determine
// the parser to use
const config = Flag.FileParse("config")

// Will use the JSON parser
const jsonConfig = Flag.FileParse("json-config", { format: "json" })
const kinds = [config.kind, jsonConfig.kind] // => ["flag", "flag"]
```

## FileSchema

**Validating file contents**

```efx
import { Schema } from "effect"
import { Flag } from "effect/cli"

const ConfigSchema = Schema.Struct({
  port: Schema.Number,
  host: Schema.String
})

const config = Flag.FileSchema("config", ConfigSchema, { format: "json" })
config.kind // => "flag"
```

## KeyValuePair

**Parsing key-value pairs**

```efx
import { Flag } from "effect/cli"

const env = Flag.KeyValuePair("env")
// --env FOO=bar --env BAZ=qux will parse to { FOO: "bar", BAZ: "qux" }
env.kind // => "flag"
```

## Never

**Creating sentinel flags**

```efx
import { Flag } from "effect/cli"

const makeValueFlag = (includeValue: boolean) =>
  includeValue ? Flag.String("value") : Flag.Never

makeValueFlag(true) === Flag.Never // => false
makeValueFlag(false) === Flag.Never // => true
```

## withAlias

**Adding flag aliases**

```efx
import { Flag } from "effect/cli"

// Flag can be used as both --verbose and -v
const verboseFlag = Flag.Boolean("verbose").pipe(
  Flag.withAlias("v")
)

// Multiple aliases can be chained
const helpFlag = Flag.Boolean("help").pipe(
  Flag.withAlias("h"),
  Flag.withAlias("?")
)
const kinds = [verboseFlag.kind, helpFlag.kind] // => ["flag", "flag"]
```

## withDescription

**Adding help descriptions**

```efx
import { Flag } from "effect/cli"

const portFlag = Flag.Int("port").pipe(
  Flag.withDescription("The port number to listen on")
)

const configFlag = Flag.File("config").pipe(
  Flag.withDescription("Path to the configuration file")
)
const kinds = [portFlag.kind, configFlag.kind] // => ["flag", "flag"]
```

## withMetavar

**Setting metavars**

```efx
import { Flag } from "effect/cli"

const databaseFlag = Flag.String("database-url").pipe(
  Flag.withMetavar("URL"),
  Flag.withDescription("Database connection URL")
)
// In help: --database-url URL

const timeoutFlag = Flag.Int("timeout").pipe(
  Flag.withMetavar("SECONDS")
)
// In help: --timeout SECONDS
const kinds = [databaseFlag.kind, timeoutFlag.kind] // => ["flag", "flag"]
```

## withHidden

**Hiding a flag from help**

```efx
import { Flag } from "effect/cli"

// Flag still parses --experimental-foo, but it does not appear in --help.
const experimental = Flag.Boolean("experimental-foo").pipe(
  Flag.withHidden
)
experimental.kind // => "flag"
```

## optional

**Making flags optional**

```efx
import { Effect, FileSystem, Layer, Option } from "effect"
import { Flag } from "effect/cli"
import { ChildProcessSpawner } from "effect/process"

const CliTestLayer = Layer.mergeAll(
  FileSystem.layerNoop({}),
  Path.layer,
  Stdio.layerTest({}),
  Layer.succeed(Terminal.Terminal, Terminal.make({
    columns: succeed(80),
    rows: succeed(24),
    readInput: die("unused"),
    readLine: die("unused"),
    display: () => Effect.void
  })),
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => die("unused"))
  )
)

const optionalPort = Flag.optional(Flag.Int("port"))

const program = Effect.gen(function*() {
  const [, port] = yield* optionalPort.parse({
    arguments: [],
    flags: { "port": ["4000"] }
  })
  return port
})

await runPromise(program.pipe(provide(CliTestLayer))) // => Option.some(4000)
```

## withDefault

**Providing default values**

```efx
import { Flag } from "effect/cli"

const portFlag = Flag.Int("port").pipe(
  Flag.withDefault(8080)
)
// If --port is not provided, defaults to 8080

const hostFlag = Flag.String("host").pipe(
  Flag.withDefault("localhost")
)
// If --host is not provided, defaults to "localhost"
const kinds = [portFlag.kind, hostFlag.kind] // => ["flag", "flag"]
```

## withFallbackConfig

**Falling back to config**

```efx
import { Config } from "effect"
import { Flag } from "effect/cli"

const verbose = Flag.Boolean("verbose").pipe(
  Flag.withFallbackConfig(Config.Boolean("VERBOSE"))
)
verbose.kind // => "flag"
```

## withFallbackPrompt

**Falling back to prompts**

```efx
import { Flag, Prompt } from "effect/cli"

const name = Flag.String("name").pipe(
  Flag.withFallbackPrompt(Prompt.String({ message: "Name" }))
)
name.kind // => "flag"
```

## map

**Mapping parsed values**

```efx
import { Flag } from "effect/cli"

// Convert string to uppercase
const nameFlag = Flag.String("name").pipe(
  Flag.map((name) => name.toUpperCase())
)

// Convert port to URL
const urlFlag = Flag.Int("port").pipe(
  Flag.map((port) => `http://localhost:${port}`)
)
const kinds = [nameFlag.kind, urlFlag.kind] // => ["flag", "flag"]
```

## mapEffect

**Mapping parsed values effectfully**

```efx

const CliTestLayer = Layer.mergeAll(
  FileSystem.layerNoop({}),
  Path.layer,
  Stdio.layerTest({}),
  Layer.succeed(Terminal.Terminal, Terminal.make({
    columns: succeed(80),
    rows: succeed(24),
    readInput: die("unused"),
    readLine: die("unused"),
    display: () => Effect.void
  })),
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => die("unused"))
  )
)

const upperName = Flag.String("name").pipe(
  Flag.mapEffect((name) => succeed(name.toUpperCase()))
)

const [, value] = await runPromise(
  upperName.parse({
    arguments: [],
    flags: { name: ["alice"] }
  }).pipe(provide(CliTestLayer))
)
value // => "ALICE"
```

## mapTryCatch

**Mapping thrown errors**

```efx

const CliTestLayer = Layer.mergeAll(
  FileSystem.layerNoop({}),
  Path.layer,
  Stdio.layerTest({}),
  Layer.succeed(Terminal.Terminal, Terminal.make({
    columns: succeed(80),
    rows: succeed(24),
    readInput: die("unused"),
    readLine: die("unused"),
    display: () => Effect.void
  })),
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => die("unused"))
  )
)

// Parse JSON string with error handling
const jsonFlag = Flag.String("config").pipe(
  Flag.mapTryCatch(
    (json) => JSON.parse(json),
    (error) => `Invalid JSON: ${error}`
  )
)

// Parse URL with error handling
const urlFlag = Flag.String("url").pipe(
  Flag.mapTryCatch(
    (url) => new URL(url),
    (error) => `Invalid URL: ${error}`
  )
)

const [, value] = await runPromise(
  jsonFlag.parse({
    arguments: [],
    flags: { config: ['{"enabled":true}'] }
  }).pipe(provide(CliTestLayer))
)
value // => { enabled: true }
```

## atLeast

**Requiring repeated values**

```efx
import { Flag } from "effect/cli"

const sourceFlag = Flag.atLeast(Flag.File("source"), 2)
// Requires at least 2 source files
// Usage: --source file1.ts --source file2.ts

const tagFlag = Flag.String("tag").pipe(
  Flag.atLeast(1)
)
// Requires at least 1 tag
const kinds = [sourceFlag.kind, tagFlag.kind] // => ["flag", "flag"]
```

## atMost

**Limiting repeated values**

```efx
import { Flag } from "effect/cli"

const warningFlag = Flag.atMost(Flag.String("warning"), 3)
// Allows up to 3 warning flags
// Usage: --warning w1 --warning w2 --warning w3

const debugFlag = Flag.String("debug").pipe(
  Flag.atMost(1)
)
// Allows at most 1 debug flag
const kinds = [warningFlag.kind, debugFlag.kind] // => ["flag", "flag"]
```

## between

**Bounding repeated values**

```efx
import { Flag } from "effect/cli"

const hostFlag = Flag.between(Flag.String("host"), 1, 3)
// Requires 1-3 host flags
// Usage: --host host1 --host host2

const excludeFlag = Flag.String("exclude").pipe(
  Flag.between(0, 5)
)
// Allows 0-5 exclude patterns
const kinds = [hostFlag.kind, excludeFlag.kind] // => ["flag", "flag"]
```

## filterMap

**Filtering and transforming values**

```efx
import { Option } from "effect"
import { Flag } from "effect/cli"

// Parse positive integers only
const positiveInt = Flag.Int("count").pipe(
  Flag.filterMap(
    (n) => n > 0 ? Option.some(n) : Option.none(),
    (n) => `Expected positive integer, got ${n}`
  )
)

// Parse valid email addresses
const emailFlag = Flag.String("email").pipe(
  Flag.filterMap(
    (email) => email.includes("@") ? Option.some(email) : Option.none(),
    (email) => `Invalid email address: ${email}`
  )
)
const kinds = [positiveInt.kind, emailFlag.kind] // => ["flag", "flag"]
```

## filter

**Filtering parsed values**

```efx
import { Flag } from "effect/cli"

// Ensure port is in valid range
const portFlag = Flag.Int("port").pipe(
  Flag.filter(
    (port) => port >= 1 && port <= 65535,
    (port) => `Port ${port} is out of range (1-65535)`
  )
)

// Ensure non-empty string
const nameFlag = Flag.String("name").pipe(
  Flag.filter(
    (name) => name.trim().length > 0,
    () => "Name cannot be empty"
  )
)
const kinds = [portFlag.kind, nameFlag.kind] // => ["flag", "flag"]
```

## orElse

**Falling back to another flag**

```efx
import { Flag } from "effect/cli"

// Try parsing as integer, fallback to string
const valueFlag = Flag.orElse(
  Flag.Int("value"),
  () => Flag.String("value")
)

// Multiple input sources with fallback
const configFlag = Flag.orElse(
  Flag.File("config"),
  () => Flag.String("config-url")
)
const kinds = [valueFlag.kind, configFlag.kind] // => ["flag", "flag"]
```

## orElseResult

**Returning fallback results**

```efx
import { Effect, FileSystem, Layer, Path, Result } from "effect"
import { Flag } from "effect/cli"
import { ChildProcessSpawner } from "effect/process"

const CliTestLayer = Layer.mergeAll(
  FileSystem.layerNoop({}),
  Path.layer,
  Stdio.layerTest({}),
  Layer.succeed(Terminal.Terminal, Terminal.make({
    columns: succeed(80),
    rows: succeed(24),
    readInput: die("unused"),
    readLine: die("unused"),
    display: () => Effect.void
  })),
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => die("unused"))
  )
)

const sourceFlag = Flag.orElseResult(
  Flag.String("source"),
  () => Flag.String("source-url")
)

const program = Effect.gen(function*() {
  const [, source] = yield* sourceFlag.parse({
    arguments: [],
    flags: { "source-url": ["https://example.com"] }
  })
  return source
})

await runPromise(program.pipe(provide(CliTestLayer))) // => Result.fail("https://example.com")
```

## withSchema

**Validating with schemas**

```efx
import { Schema } from "effect"
import { Flag } from "effect/cli"

const isEmail = Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
  message: "Must be a valid email address"
})

// Parse and validate email with custom schema
const EmailSchema = Schema.String.pipe(
  Schema.check(isEmail)
)

const emailFlag = Flag.String("email").pipe(
  Flag.withSchema(EmailSchema)
)

// Parse JSON configuration with schema validation
const ConfigSchema = Schema.Struct({
  port: Schema.Number,
  host: Schema.String,
  ssl: Schema.optional(Schema.Boolean)
}).pipe(Schema.fromJsonString)

const configFlag = Flag.String("config").pipe(
  Flag.withSchema(ConfigSchema)
)
const kinds = [emailFlag.kind, configFlag.kind] // => ["flag", "flag"]
```
