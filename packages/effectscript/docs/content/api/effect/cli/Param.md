# effect/cli/Param

The examples in the JSDoc of `packages/effect/src/cli/Param.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## isParam

**Checking for params**

```efx
import { Param } from "effect/cli"

const maybeParam = Param.String(Param.flagKind, "name")

Param.isParam(maybeParam) // => true
```

## isSingle

**Checking for single params**

```efx
import { Param } from "effect/cli"

const nameParam = Param.String(Param.flagKind, "name")
const optionalParam = Param.optional(nameParam)

Param.isSingle(nameParam) // => true
Param.isSingle(optionalParam) // => false
```

## String

**Creating string parameters**

```efx
import { Param } from "effect/cli"

// Create a string flag
const nameFlag = Param.String(Param.flagKind, "name")

// Create a string argument
const fileArg = Param.String(Param.argumentKind, "file")

// Usage in CLI: --name "John Doe" or as positional argument
const kinds = [nameFlag.kind, fileArg.kind] // => ["flag", "argument"]
```

## Boolean

**Creating boolean parameters**

```efx
import { Param } from "effect/cli"

// Create a boolean flag
const verboseFlag = Param.Boolean(Param.flagKind, "verbose")

// Create a boolean argument
const enableArg = Param.Boolean(Param.argumentKind, "enable")

// Usage in CLI: --verbose (true) or --no-verbose (false).
// The flag is required unless made optional or given a fallback.
// Boolean positional arguments accept true/false.
const kinds = [verboseFlag.kind, enableArg.kind] // => ["flag", "argument"]
```

## Int

**Creating integer parameters**

```efx
import { Param } from "effect/cli"

// Create an integer flag
const portFlag = Param.Int(Param.flagKind, "port")

// Create an integer argument
const countArg = Param.Int(Param.argumentKind, "count")

// Usage in CLI: --port 8080 or as positional argument: 42
const kinds = [portFlag.kind, countArg.kind] // => ["flag", "argument"]
```

## Finite

**Creating finite number parameters**

```efx
import { Param } from "effect/cli"

const rateFlag = Param.Finite(Param.flagKind, "rate")

const thresholdArg = Param.Finite(Param.argumentKind, "threshold")

const kinds = [rateFlag.kind, thresholdArg.kind] // => ["flag", "argument"]
```

## Date

**Creating date parameters**

```efx
import { Param } from "effect/cli"

// Create a date flag
const startFlag = Param.Date(Param.flagKind, "start-date")

// Create a date argument
const dueDateArg = Param.Date(Param.argumentKind, "due-date")

// Usage in CLI: --start-date "2023-12-25" or as positional: "2023-01-01"
// Parses to JavaScript Date object
const kinds = [startFlag.kind, dueDateArg.kind] // => ["flag", "argument"]
```

## ChoiceWithValue

**Creating valued choices**

```efx
import { Param } from "effect/cli"

type Animal = Dog | Cat

interface Dog {
  readonly _tag: "Dog"
}

interface Cat {
  readonly _tag: "Cat"
}

const animal = Param.ChoiceWithValue(Param.flagKind, "animal", [
  ["dog", { _tag: "Dog" }],
  ["cat", { _tag: "Cat" }]
])
animal.kind // => "flag"
```

## Literals

**Creating string choices**

```efx
import { Param } from "effect/cli"

const logLevel = Param.Literals(Param.flagKind, "log-level", [
  "debug",
  "info",
  "warn",
  "error"
])
logLevel.kind // => "flag"
```

## Path

**Creating path parameters**

```efx
import { Param } from "effect/cli"

// Basic path parameter
const outputPath = Param.Path(Param.flagKind, "output")

// Path that must exist
const inputPath = Param.Path(Param.flagKind, "input", { mustExist: true })

// File-only path
const configFile = Param.Path(Param.flagKind, "config", {
  pathType: "file",
  mustExist: true,
  typeName: "config-file"
})
const kinds = [outputPath.kind, inputPath.kind, configFile.kind] // => ["flag", "flag", "flag"]
```

## Directory

**Creating directory parameters**

```efx
import { Param } from "effect/cli"

// Basic directory parameter
const outputDir = Param.Directory(Param.flagKind, "output-dir")

// Directory that must exist
const sourceDir = Param.Directory(Param.flagKind, "source", { mustExist: true })

// Usage: --output-dir /path/to/dir --source /existing/dir
const kinds = [outputDir.kind, sourceDir.kind] // => ["flag", "flag"]
```

## File

**Creating file parameters**

```efx
import { Param } from "effect/cli"

// Basic file parameter
const outputFile = Param.File(Param.flagKind, "output")

// File that must exist
const inputFile = Param.File(Param.flagKind, "input", { mustExist: true })

// Usage: --output result.txt --input existing-file.txt
const kinds = [outputFile.kind, inputFile.kind] // => ["flag", "flag"]
```

## Redacted

**Creating redacted parameters**

```efx
import { Param } from "effect/cli"

// Create a password parameter
const password = Param.Redacted(Param.flagKind, "password")

// Create an API key argument
const apiKey = Param.Redacted(Param.argumentKind, "api-key")

// Usage: --password (value will be hidden in help/logs)
const kinds = [password.kind, apiKey.kind] // => ["flag", "argument"]
```

## FileText

**Reading file text**

```efx
import { Param } from "effect/cli"

// Read a config file as string
const configContent = Param.FileText(Param.flagKind, "config")

// Read a template file as argument
const templateContent = Param.FileText(Param.argumentKind, "template")

// Usage: --config config.txt (reads file content into string)
const kinds = [configContent.kind, templateContent.kind] // => ["flag", "argument"]
```

## FileParse

**Parsing file contents**

```efx
import { Param } from "effect/cli"

// Will use the extension of the file passed on the command line to determine
// the parser to use
const config = Param.FileParse(Param.flagKind, "config")

// Will use the JSON parser
const jsonConfig = Param.FileParse(Param.flagKind, "json-config", {
  format: "json"
})
const kinds = [config.kind, jsonConfig.kind] // => ["flag", "flag"]
```

## FileSchema

**Validating file contents**

```efx
import { Schema } from "effect"
import { Param } from "effect/cli"
// Parse JSON config file
const configSchema = Schema.Struct({
  port: Schema.Number,
  host: Schema.String
})

const config = Param.FileSchema(Param.flagKind, "config", configSchema, {
  format: "json"
})

// Parse YAML file
const yamlConfig = Param.FileSchema(Param.flagKind, "config", configSchema, {
  format: "yaml"
})

// Usage: --config config.json (reads and validates file content)
const kinds = [config.kind, yamlConfig.kind] // => ["flag", "flag"]
```

## KeyValuePair

**Parsing key-value pairs**

```efx
import { Param } from "effect/cli"

const env = Param.KeyValuePair(Param.flagKind, "env")
// --env FOO=bar --env BAZ=qux will parse to { FOO: "bar", BAZ: "qux" }

const props = Param.KeyValuePair(Param.flagKind, "property")
// --property name=value --property debug=true
const kinds = [env.kind, props.kind] // => ["flag", "flag"]
```

## Never

**Creating sentinel parameters**

```efx
import { Param } from "effect/cli"

const disabledDebugParam = Param.Never(Param.flagKind)

const makeDebugParam = (enableDebug: boolean) =>
  enableDebug ? Param.String(Param.flagKind, "debug") : disabledDebugParam

makeDebugParam(true) === disabledDebugParam // => false
makeDebugParam(false) === disabledDebugParam // => true
```

## withAlias

**Adding parameter aliases**

```efx
import { Param } from "effect/cli"

const force = Param.Boolean(Param.flagKind, "force").pipe(
  Param.withAlias("-f"),
  Param.withAlias("-F")
)

// Also works on composed params:
const count = Param.Int(Param.flagKind, "count").pipe(
  Param.optional,
  Param.withAlias("-c") // finds the underlying Single and adds alias
)
const kinds = [force.kind, count.kind] // => ["flag", "flag"]
```

## withDescription

**Adding help descriptions**

```efx
import { Param } from "effect/cli"

const verbose = Param.Boolean(Param.flagKind, "verbose").pipe(
  Param.withAlias("-v"),
  Param.withDescription("Enable verbose output")
)
verbose.kind // => "flag"
```

## withHidden

**Hiding a flag from help**

```efx
import { Param } from "effect/cli"

const experimental = Param.Boolean(Param.flagKind, "experimental-foo").pipe(
  Param.withHidden
)
experimental.kind // => "flag"
```

## map

**Mapping parsed values**

```efx
import { Param } from "effect/cli"

const port = Param.Int(Param.flagKind, "port").pipe(
  Param.map((n) => ({ port: n, url: `http://localhost:${n}` }))
)
port.kind // => "flag"
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

const validatedEmail = Param.String(Param.flagKind, "email").pipe(
  Param.mapEffect((email) =>
    email.includes("@")
      ? succeed(email)
      : fail(
        new CliError.InvalidValue({
          option: "email",
          value: email,
          expected: "valid email format",
          kind: "flag"
        })
      )
  )
)

const [, value] = await runPromise(
  validatedEmail.parse({
    arguments: [],
    flags: { email: ["alice@example.com"] }
  }).pipe(provide(CliTestLayer))
)
value // => "alice@example.com"
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

const parsedJson = Param.String(Param.flagKind, "config").pipe(
  Param.mapTryCatch(
    (str) => JSON.parse(str),
    (error) =>
      `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`
  )
)

const [, value] = await runPromise(
  parsedJson.parse({
    arguments: [],
    flags: { config: ['{"enabled":true}'] }
  }).pipe(provide(CliTestLayer))
)
value // => { enabled: true }
```

## optional

**Making parameters optional**

```efx
import { Param } from "effect/cli"

// Create an optional port option
// - When not provided: returns Option.none()
// - When provided: returns Option.some(parsedValue)
const port = Param.optional(Param.Int(Param.flagKind, "port"))
port.kind // => "flag"
```

## withDefault

**Providing default values**

```efx
import { Param } from "effect/cli"

// Using the pipe operator to make an option optional
const port = Param.Int(Param.flagKind, "port").pipe(
  Param.withDefault(8080)
)

// Can also be used with other combinators
const verbose = Param.Boolean(Param.flagKind, "verbose").pipe(
  Param.withAlias("-v"),
  Param.withDescription("Enable verbose output"),
  Param.withDefault(false)
)
const kinds = [port.kind, verbose.kind] // => ["flag", "flag"]
```

## variadic

**Accepting multiple values**

```efx
import { Param } from "effect/cli"

// Basic variadic parameter (0 to infinity)
const tags = Param.variadic(Param.String(Param.flagKind, "tag"))

// Variadic with minimum count
const inputs = Param.variadic(
  Param.String(Param.flagKind, "input"),
  { min: 1 } // at least 1 required
)

// Variadic with both min and max
const limited = Param.variadic(Param.String(Param.flagKind, "item"), {
  min: 2, // at least 2 times
  max: 2 // at most 2 times
})
const kinds = [tags.kind, inputs.kind, limited.kind] // => ["flag", "flag", "flag"]
```

## between

**Bounding repeated values**

```efx
import { Param } from "effect/cli"

// Allow 1-3 file inputs
const files = Param.String(Param.flagKind, "file").pipe(
  Param.between(1, 3),
  Param.withAlias("-f")
)

// Parse: --file a.txt --file b.txt
// Result: ["a.txt", "b.txt"]

// Allow 0 or more tags
const tags = Param.String(Param.flagKind, "tag").pipe(
  Param.between(0, Number.MAX_SAFE_INTEGER)
)

// Parse: --tag dev --tag staging --tag v1.0
// Result: ["dev", "staging", "v1.0"]
const kinds = [files.kind, tags.kind] // => ["flag", "flag"]
```

## atMost

**Limiting repeated values**

```efx
import { Param } from "effect/cli"

// Allow at most 3 warning suppressions
const suppressions = Param.String(Param.flagKind, "suppress").pipe(
  Param.atMost(3)
)

// Parse: --suppress warning1 --suppress warning2
// Result: ["warning1", "warning2"]
suppressions.kind // => "flag"
```

## atLeast

**Requiring repeated values**

```efx
import { Param } from "effect/cli"

// Require at least 2 input files
const inputs = Param.String(Param.flagKind, "input").pipe(
  Param.atLeast(2),
  Param.withAlias("-i")
)

// Parse: --input file1.txt --input file2.txt --input file3.txt
// Result: ["file1.txt", "file2.txt", "file3.txt"]
inputs.kind // => "flag"
```

## filterMap

**Filtering and transforming values**

```efx
import { Option } from "effect"
import { Param } from "effect/cli"
const positiveInt = Param.Int(Param.flagKind, "count").pipe(
  Param.filterMap(
    (n) => n > 0 ? Option.some(n) : Option.none(),
    (n) => `Expected positive integer, got ${n}`
  )
)
positiveInt.kind // => "flag"
```

## filter

**Filtering parsed values**

```efx
import { Param } from "effect/cli"

const evenNumber = Param.Int(Param.flagKind, "num").pipe(
  Param.filter(
    (n) => n % 2 === 0,
    (n) => `Expected even number, got ${n}`
  )
)
evenNumber.kind // => "flag"
```

## withMetavar

**Setting metavars**

```efx
import { Param } from "effect/cli"

const port = Param.Int(Param.flagKind, "port").pipe(
  Param.withMetavar("PORT"),
  Param.filter(
    (p) => p >= 1 && p <= 65535,
    () => "Port must be between 1 and 65535"
  )
)
port.kind // => "flag"
```

## withSchema

**Validating with schemas**

```efx
import { Schema } from "effect"
import { Param } from "effect/cli"
const isEmail = Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)

const Email = Schema.String.pipe(
  Schema.check(isEmail)
)

const email = Param.String(Param.flagKind, "email").pipe(
  Param.withSchema(Email)
)
email.kind // => "flag"
```

## orElse

**Falling back to another parameter**

```efx
import { Param } from "effect/cli"

const config = Param.File(Param.flagKind, "config").pipe(
  Param.orElse(() => Param.String(Param.flagKind, "config-url"))
)
config.kind // => "flag"
```

## orElseResult

**Returning fallback results**

```efx
import { Param } from "effect/cli"

const configSource = Param.File(Param.flagKind, "config").pipe(
  Param.orElseResult(() => Param.String(Param.flagKind, "config-url"))
)
// Returns Result<string, string>
configSource.kind // => "flag"
```
