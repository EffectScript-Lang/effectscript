# effect/cli/Argument

The examples in the JSDoc of `packages/effect/src/cli/Argument.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## String

**Creating a string argument**

```efx
import { Argument } from "effect/cli"

const filename = Argument.String("filename")
filename.kind // => "argument"
```

## Int

**Creating an integer argument**

```efx
import { Argument } from "effect/cli"

const count = Argument.Int("count")
count.kind // => "argument"
```

## File

**Creating file path arguments**

```efx
import { Argument } from "effect/cli"

const inputFile = Argument.File("input", { mustExist: true }) // Must exist
const outputFile = Argument.File("output", { mustExist: false }) // Must not exist
const kinds = [inputFile.kind, outputFile.kind] // => ["argument", "argument"]
```

## Directory

**Creating a directory path argument**

```efx
import { Argument } from "effect/cli"

const workspace = Argument.Directory("workspace", { mustExist: true }) // Must exist
workspace.kind // => "argument"
```

## Finite

**Parsing a finite number**

```efx
import { Argument } from "effect/cli"

const ratio = Argument.Finite("ratio")
ratio.kind // => "argument"
```

## Date

**Creating a date argument**

```efx
import { Argument } from "effect/cli"

const startDate = Argument.Date("start-date")
startDate.kind // => "argument"
```

## Literals

**Creating a choice argument**

```efx
import { Argument } from "effect/cli"

const environment = Argument.Literals("environment", ["dev", "staging", "prod"])
environment.kind // => "argument"
```

## Path

**Creating a path argument**

```efx
import { Argument } from "effect/cli"

const configPath = Argument.Path("config")
configPath.kind // => "argument"
```

## Redacted

**Creating a redacted argument**

```efx
import { Argument } from "effect/cli"

const secret = Argument.Redacted("secret")
secret.kind // => "argument"
```

## FileText

**Reading file text**

```efx
import { Argument } from "effect/cli"

const config = Argument.FileText("config-file")
config.kind // => "argument"
```

## FileParse

**Parsing file content**

```efx
import { Argument } from "effect/cli"

const config = Argument.FileParse("config", { format: "json" })
config.kind // => "argument"
```

## FileSchema

**Validating file content with a schema**

```efx
import { Schema } from "effect"
import { Argument } from "effect/cli"

const ConfigSchema = Schema.Struct({
  port: Schema.Number,
  host: Schema.String
})

const config = Argument.FileSchema("config", ConfigSchema)
config.kind // => "argument"
```

## Never

**Creating a sentinel argument**

```efx
import { Argument } from "effect/cli"

const noArg = Argument.Never
noArg.kind // => "argument"
```

## optional

**Making an argument optional**

```efx
import { Argument } from "effect/cli"

const optionalVersion = Argument.String("version").pipe(Argument.optional)
optionalVersion.kind // => "argument"
```

## withDescription

**Adding an argument description**

```efx
import { Argument } from "effect/cli"

const filename = Argument.String("filename").pipe(
  Argument.withDescription("The input file to process")
)
filename.kind // => "argument"
```

## withDefault

**Providing a default value**

```efx
import { Argument } from "effect/cli"

const port = Argument.Int("port").pipe(Argument.withDefault(8080))
port.kind // => "argument"
```

## withFallbackConfig

**Loading a fallback config**

```efx
import { Config } from "effect"
import { Argument } from "effect/cli"

const repository = Argument.String("repository").pipe(
  Argument.withFallbackConfig(Config.String("REPOSITORY"))
)
repository.kind // => "argument"
```

## withFallbackPrompt

**Showing a fallback prompt**

```efx
import { Argument, Prompt } from "effect/cli"

const filename = Argument.String("filename").pipe(
  Argument.withFallbackPrompt(Prompt.String({ message: "Filename" }))
)
filename.kind // => "argument"
```

## variadic

**Accepting multiple values**

```efx
import { Argument } from "effect/cli"

// Accept any number of files
const anyFiles = Argument.String("files").pipe(Argument.variadic)

// Accept at least 1 file
const atLeastOneFile = Argument.String("files").pipe(
  Argument.variadic({ min: 1 })
)

// Accept between 1 and 5 files
const limitedFiles = Argument.String("files").pipe(
  Argument.variadic({ min: 1, max: 5 })
)

const kinds = [anyFiles.kind, atLeastOneFile.kind, limitedFiles.kind] // => ["argument", "argument", "argument"]
```

## map

**Mapping parsed values**

```efx
import { Argument } from "effect/cli"

const port = Argument.Int("port").pipe(
  Argument.map((p) => ({ port: p, url: `http://localhost:${p}` }))
)
port.kind // => "argument"
```

## mapEffect

**Validating values effectfully**

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

const files = Argument.String("files").pipe(
  Argument.mapEffect((file) =>
    file.endsWith(".txt")
      ? succeed(file)
      : fail(
        new CliError.UserError({
          cause: new Error(`Unsupported file extension: ${file}`),
          userMessage: "Only .txt files allowed"
        })
      )
  )
)

const [, value] = await runPromise(
  files.parse({ arguments: ["notes.txt"], flags: {} }).pipe(provide(CliTestLayer))
)
value // => "notes.txt"
```

## mapTryCatch

**Mapping values that may throw**

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

const json = Argument.String("data").pipe(
  Argument.mapTryCatch(
    (str) => JSON.parse(str),
    (error) =>
      `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`
  )
)

const [, value] = await runPromise(
  json.parse({ arguments: ['{"enabled":true}'], flags: {} }).pipe(provide(CliTestLayer))
)
value // => { enabled: true }
```

## atLeast

**Requiring a minimum number of values**

```efx
import { Argument } from "effect/cli"

const files = Argument.String("files").pipe(Argument.atLeast(1))
files.kind // => "argument"
```

## atMost

**Limiting the maximum number of values**

```efx
import { Argument } from "effect/cli"

const files = Argument.String("files").pipe(Argument.atMost(5))
files.kind // => "argument"
```

## between

**Requiring a range of values**

```efx
import { Argument } from "effect/cli"

const files = Argument.String("files").pipe(Argument.between(1, 5))
files.kind // => "argument"
```

## withSchema

**Validating parsed values with a schema**

```efx
import { Schema } from "effect"
import { Argument } from "effect/cli"

const input = Argument.String("input").pipe(
  Argument.withSchema(Schema.NonEmptyString)
)
input.kind // => "argument"
```

## ChoiceWithValue

**Mapping choices to values**

```efx
import { Argument } from "effect/cli"

const logLevel = Argument.ChoiceWithValue("level", [
  ["debug", 0],
  ["info", 1],
  ["warn", 2],
  ["error", 3]
])
logLevel.kind // => "argument"
```

## withMetavar

**Setting a metavar**

```efx
import { Argument } from "effect/cli"

const port = Argument.Int("port").pipe(
  Argument.withMetavar("PORT")
)
port.kind // => "argument"
```

## filter

**Filtering parsed values**

```efx
import { Argument } from "effect/cli"

const positiveInt = Argument.Int("count").pipe(
  Argument.filter(
    (n) => n > 0,
    (n) => `Expected positive integer, got ${n}`
  )
)
positiveInt.kind // => "argument"
```

## filterMap

**Filtering and mapping parsed values**

```efx
import { Option } from "effect"
import { Argument } from "effect/cli"

const positiveInt = Argument.Int("count").pipe(
  Argument.filterMap(
    (n) => n > 0 ? Option.some(n) : Option.none(),
    (n) => `Expected positive integer, got ${n}`
  )
)
positiveInt.kind // => "argument"
```

## orElse

**Providing a fallback argument**

```efx
import { Argument } from "effect/cli"

const value = Argument.Int("value").pipe(
  Argument.orElse(() => Argument.String("value"))
)
value.kind // => "argument"
```

## orElseResult

**Returning which fallback succeeded**

```efx
import { Argument } from "effect/cli"

const source = Argument.File("source").pipe(
  Argument.orElseResult(() => Argument.String("url"))
)
// Returns Result<string, string>
source.kind // => "argument"
```
