# effect/cli/Primitive

The examples in the JSDoc of `packages/effect/src/cli/Primitive.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Primitive

**Parsing values with primitives**

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

const program = effect {
  const stringResult = await Primitive.String.parse("hello")
  const numberResult = await Primitive.Int.parse("42")
  const boolResult = await Primitive.Boolean.parse("true")
  return [stringResult, numberResult, boolResult] as const
}

await runPromise(program.pipe(provide(CliTestLayer))) // => ["hello", 42, true]
```

## Boolean

**Parsing boolean values**

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

const parseBoolean = all([
  Primitive.Boolean.parse("true"),
  Primitive.Boolean.parse("yes"),
  Primitive.Boolean.parse("false"),
  Primitive.Boolean.parse("0")
])

await runPromise(parseBoolean.pipe(provide(CliTestLayer))) // => [true, true, false, false]
```

## Finite

**Parsing finite numbers**

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

const parseFloat = all([
  Primitive.Finite.parse("3.14"),
  Primitive.Finite.parse("-42.5"),
  Primitive.Finite.parse("0")
])

await runPromise(parseFloat.pipe(provide(CliTestLayer))) // => [3.14, -42.5, 0]
```

## Int

**Parsing integer values**

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

const parseInteger = all([
  Primitive.Int.parse("42"),
  Primitive.Int.parse("-123"),
  Primitive.Int.parse("0")
])

await runPromise(parseInteger.pipe(provide(CliTestLayer))) // => [42, -123, 0]
```

## Date

**Parsing date values**

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

const parseDate = effect {
  const result = await Primitive.Date.parse("2023-12-25")
  return result.toISOString()
}

await runPromise(parseDate.pipe(provide(CliTestLayer))) // => "2023-12-25T00:00:00.000Z"
```

## String

**Parsing string values**

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

const parseString = all([
  Primitive.String.parse("hello world"),
  Primitive.String.parse(""),
  Primitive.String.parse("123")
])

await runPromise(parseString.pipe(provide(CliTestLayer))) // => ["hello world", "", "123"]
```

## Choice

**Parsing choices**

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

type LogLevel = "debug" | "info" | "warn" | "error"

const logLevelPrimitive = Primitive.Choice<LogLevel>([
  ["debug", "debug"],
  ["info", "info"],
  ["warn", "warn"],
  ["error", "error"]
])

const parseLogLevel = all([
  logLevelPrimitive.parse("info"),
  logLevelPrimitive.parse("debug")
])

await runPromise(parseLogLevel.pipe(provide(CliTestLayer))) // => ["info", "debug"]
```

## PathType

**Choosing path validation**

```efx
import { Primitive } from "effect/cli"

// Only accept files
const filePath = Primitive.Path("file", true)

// Only accept directories
const dirPath = Primitive.Path("directory", true)

// Accept either files or directories
const anyPath = Primitive.Path("either", false)

const tags = [filePath._tag, dirPath._tag, anyPath._tag] // => ["Path", "Path", "Path"]
```

## Path

**Parsing file system paths**

```efx

const services = Layer.mergeAll(
  Path.layer,
  FileSystem.layerNoop({
    exists: () => succeed(true),
    stat: () => succeed({ type: "File" } as FileSystem.File.Info)
  }),
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

const program = effect {
  const filePrimitive = Primitive.Path("file", true)
  const filePath = await filePrimitive.parse("./package.json")
  return filePath.endsWith("/package.json")
} |> provide(services)

await runPromise(program) // => true
```

## Redacted

**Parsing redacted values**

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

const parseRedacted = effect {
  const result = await Primitive.Redacted.parse("secret-password")
  return [Redacted.value(result), String(result)] as const
}

await runPromise(parseRedacted.pipe(provide(CliTestLayer))) // => ["secret-password", "<redacted>"]
```

## FileText

**Reading file text**

```efx

const services = Layer.mergeAll(
  Path.layer,
  FileSystem.layerNoop({
    exists: () => succeed(true),
    stat: () => succeed({ type: "File" } as FileSystem.File.Info),
    readFileString: () => succeed('{"private":true}')
  }),
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

const readConfigFile = effect {
  const content = await Primitive.FileText.parse("./package.json")
  return JSON.parse(content) as { private: boolean }
} |> provide(services)

await runPromise(readConfigFile) // => { private: true }
```

## FileParse

**Parsing file content**

```efx

const services = Layer.mergeAll(
  Path.layer,
  FileSystem.layerNoop({
    exists: () => succeed(true),
    stat: () => succeed({ type: "File" } as FileSystem.File.Info),
    readFileString: () => succeed('{"private":true}')
  }),
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

const jsonFilePrimitive = Primitive.FileParse({ format: "json" })

const loadConfig = effect {
  const config = await jsonFilePrimitive.parse("./package.json")
  return config as { private: boolean }
} |> provide(services)

await runPromise(loadConfig) // => { private: true }
```

## FileSchema

**Parsing file content with a schema**

```efx

const services = Layer.mergeAll(
  Path.layer,
  FileSystem.layerNoop({
    exists: () => succeed(true),
    stat: () => succeed({ type: "File" } as FileSystem.File.Info),
    readFileString: () => succeed('{"private":true}')
  }),
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

const ConfigSchema = Schema.Struct({
  private: Schema.Boolean
})

const jsonConfigPrimitive = Primitive.FileSchema(ConfigSchema, {
  format: "json"
})

const loadConfig = effect {
  return await jsonConfigPrimitive.parse("./package.json")
} |> provide(services)

await runPromise(loadConfig) // => { private: true }
```

## KeyValuePair

**Parsing key-value pairs**

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

const parseKeyValue = all([
  Primitive.KeyValuePair.parse("name=john"),
  Primitive.KeyValuePair.parse("port=3000"),
  Primitive.KeyValuePair.parse("debug=true")
])

const result = await runPromise(parseKeyValue.pipe(provide(CliTestLayer)))
result // => [{ name: "john" }, { port: "3000" }, { debug: "true" }]
```

## Never

**Rejecting option values**

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

const program = effect {
  return await Primitive.Never.parse("any-value")
}

await runPromise(flip(program).pipe(provide(CliTestLayer))) // => "This option does not accept values"
```

## getTypeName

**Getting primitive type names**

```efx
import { Primitive } from "effect/cli"

Primitive.getTypeName(Primitive.String) // => "string"
Primitive.getTypeName(Primitive.Int) // => "integer"
Primitive.getTypeName(Primitive.Boolean) // => "boolean"
Primitive.getTypeName(Primitive.Date) // => "date"
Primitive.getTypeName(Primitive.KeyValuePair) // => "key=value"

const logLevelChoice = Primitive.Choice([
  ["debug", "debug"],
  ["info", "info"]
])
Primitive.getTypeName(logLevelChoice) // => "choice"
```
