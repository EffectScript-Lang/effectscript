# effect/Logger

The examples in the JSDoc of `packages/effect/src/Logger.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Logger

**Creating custom loggers**

```efx
const messages: Array<string> = []
const stringLogger = Logger.make<unknown, void>((options) => {
  messages.push(`[${options.logLevel}] ${options.message}`)
})

const program = log("Hello World").pipe(
  provide(Logger.layer([stringLogger]))
)

runSync(program)
messages // => ["[Info] Hello World"]
```

## Options

**Accessing logger options**

```efx
const outputs: Array<unknown> = []
const detailedLogger = Logger.make((options) => {
  outputs.push({
    message: options.message,
    level: options.logLevel,
    hasCause: options.cause.reasons.length > 0
  })
})

const program = log("Processing request").pipe(
  provide(Logger.layer([detailedLogger]))
)

runSync(program)
outputs // => [{ message: ["Processing request"], level: "Info", hasCause: false }]
```

## isLogger

**Checking logger values**

```efx
import { Logger } from "effect"

const myLogger = Logger.make(() => undefined)

Logger.isLogger(myLogger) // => true
Logger.isLogger("not a logger") // => false
Logger.isLogger({ log: () => {} }) // => false
```

## CurrentLoggers

**Accessing current loggers**

```efx
const messages: Array<unknown> = []
const customLogger = Logger.make((options) => {
  messages.push(options.message)
})
const program = effect {
  const currentLoggers = await service(Logger.CurrentLoggers)
  await log("Hello from custom logger").pipe(
    provide(Logger.layer([customLogger]))
  )
  return currentLoggers.has(Logger.defaultLogger)
}

runSync(program) // => true
messages // => [["Hello from custom logger"]]
```

## map

**Transforming logger output**

```efx
const outputs: Array<unknown> = []
const structuredLogger = Logger.make((options) => ({
  message: options.message
}))

// Transform to uppercase messages
const uppercaseLogger = Logger.map(
  structuredLogger,
  (output) => ({ ...output, message: String(output.message).toUpperCase() })
)

const collector = Logger.make((options) => outputs.push(uppercaseLogger.log(options)))
const program = log("hello").pipe(provide(Logger.layer([collector])))
runSync(program)
outputs // => [{ message: "HELLO" }]
```

## withConsoleLog

**Writing logger output with console.log**

```efx
// Create a custom formatter
const customFormatter = Logger.make((options) =>
  `${options.logLevel}: ${options.message}`
)

const consoleLogger = Logger.withConsoleLog(customFormatter)

const program = effect {
  await log("Hello World").pipe(provide(Logger.layer([consoleLogger])))
  return await TestConsole.logLines
} |> provide(TestConsole.layer)

await runPromise(program) // => ["Info: Hello World"]
```

## withConsoleError

**Writing logger output with console.error**

```efx
// Create an error-specific formatter
const errorFormatter = Logger.make((options) =>
  `ERROR: ${options.message}`
)

const errorLogger = Logger.withConsoleError(errorFormatter)

const program = effect {
  await logError("Database connection failed").pipe(provide(Logger.layer([errorLogger])))
  return await TestConsole.errorLines
} |> provide(TestConsole.layer)

await runPromise(program) // => ["ERROR: Database connection failed"]
```

## withLeveledConsole

**Writing logs with level-based console methods**

```efx
const messages: Array<ReadonlyArray<unknown>> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  info: (message: unknown) => messages.push(["info", message]),
  warn: (message: unknown) => messages.push(["warn", message]),
  error: (message: unknown) => messages.push(["error", message])
})
const formatter = Logger.make((options) =>
  `[${options.logLevel}] ${options.message}`
)

const leveledLogger = Logger.withLeveledConsole(formatter)

const program = effect {
  console.info("Info message") // -> console.info
  console.warn("Warning") // -> console.warn
  console.error("Error occurred") // -> console.error
} |> provide(Logger.layer([leveledLogger]))
runSync(provideService(program, Console.Console, testConsole))
const expected = [
  ["info", "[Info] Info message"],
  ["warn", "[Warn] Warning"],
  ["error", "[Error] Error occurred"]
]
messages // => expected
```

## make

**Creating loggers from functions**

```efx
const outputs: Array<string> = []
const textLogger = Logger.make((options) =>
  `${options.logLevel}: ${options.message}`
)
const collector = Logger.make((options) => outputs.push(textLogger.log(options)))

const program = log("Hello World").pipe(
  provide(Logger.layer([collector]))
)
runSync(program)
outputs // => ["Info: Hello World"]
```

## defaultLogger

**Referencing the default logger**

```efx
import { Logger } from "effect"

Logger.isLogger(Logger.defaultLogger) // => true
```

## formatSimple

**Formatting logs as simple strings**

```efx
// Use the simple format logger
const stableSimple = Logger.map(Logger.formatSimple, (output) =>
  output
    .replace(/timestamp=\S+ /, "")
    .replace(/fiber=#\d+ /, "")
)
const program = effect {
  await log("Application started").pipe(
    provide(Logger.layer([Logger.withConsoleLog(stableSimple)]))
  )
  return await TestConsole.logLines
} |> provide(TestConsole.layer)

await runPromise(program) // => ["level=INFO message=\"Application started\""]
```

## formatLogFmt

**Formatting logs as logfmt**

```efx
const stableLogFmt = Logger.map(Logger.formatLogFmt, (output) =>
  output
    .replace(/timestamp=\S+ /, "")
    .replace(/fiber=#\d+ /, "")
)
const program = effect {
  await log("User login").pipe(
    provide(Logger.layer([Logger.withConsoleLog(stableLogFmt)]))
  )
  return await TestConsole.logLines
} |> provide(TestConsole.layer)

await runPromise(program) // => ["level=INFO message=\"User login\""]
```

## formatStructured

**Formatting logs as structured objects**

```efx
const stableStructured = Logger.map(Logger.formatStructured, (output) => ({
  message: output.message,
  level: output.level
}))
const program = effect {
  await log("User action").pipe(
    provide(Logger.layer([Logger.withConsoleLog(stableStructured)]))
  )
  return await TestConsole.logLines
} |> provide(TestConsole.layer)

await runPromise(program) // => [{ message: "User action", level: "INFO" }]
```

## formatJson

**Formatting logs as JSON**

```efx
const stableJson = Logger.map(Logger.formatJson, (json) => {
  const output = JSON.parse(json)
  return Formatter.formatJson({ message: output.message, level: output.level })
})
const program = effect {
  await log("Server started").pipe(
    provide(Logger.layer([Logger.withConsoleLog(stableJson)]))
  )
  return await TestConsole.logLines
} |> provide(TestConsole.layer)

await runPromise(program) // => ["{\"message\":\"Server started\",\"level\":\"INFO\"}"]
```

## batched

**Batching logger output**

```efx
const flushed: Array<ReadonlyArray<string>> = []
const messageLogger = Logger.make((options) => String(options.message))
const batchedLogger = Logger.batched(messageLogger, {
  window: "1 hour",
  flush: (messages) =>
    sync(() => {
      flushed.push(messages)
    })
})

const program = scoped(effect {
  const logger = await batchedLogger
  await log("Event 1").pipe(provide(Logger.layer([logger])))
  await log("Event 2").pipe(provide(Logger.layer([logger])))
})
await runPromise(program)
flushed // => [["Event 1", "Event 2"]]
```

## consolePretty

**Logging with pretty console output**

```efx
const prettyLogger = Logger.layer([Logger.consolePretty()])

log("hello").pipe(
  withLogSpan('label'),
  annotateLogs('key', 'value'),
  provide(prettyLogger),
  runSync
)
```

**Logging with console.error, when the environment has TTY**

```efx
const prettyLoggerLayer = Layer.merge(
  Logger.layer([Logger.consolePretty()]),
  Layer.succeed(Logger.LogToStderr, true)
)

log('hello').pipe(
  provide(prettyLoggerLayer),
  runSync
)
```

## consolePrettyBrowser

**Logging with pretty console output**

```efx
const prettyLogger = Logger.layer([Logger.consolePrettyBrowser()])

log("hello").pipe(
  withLogSpan('label'),
  annotateLogs('key', 'value'),
  provide(prettyLogger),
  runSync
)
```

## consolePrettyTty

**Logging with pretty console output**

```efx
const prettyLogger = Logger.layer([Logger.consolePrettyTty()])

log("hello").pipe(
  withLogSpan('label'),
  annotateLogs('key', 'value'),
  provide(prettyLogger),
  runSync
)
```

**Logging with console.error**

```efx
const prettyLoggerLayer = Layer.merge(
  Logger.layer([Logger.consolePrettyTty()]),
  Layer.succeed(Logger.LogToStderr, true)
)

log('hello').pipe(
  provide(prettyLoggerLayer),
  runSync
)
```

## consoleLogFmt

**Logging logfmt output to the console**

```efx
import { Logger } from "effect"

Logger.isLogger(Logger.consoleLogFmt) // => true
```

## consoleStructured

**Logging structured output to the console**

```efx
import { Logger } from "effect"

Logger.isLogger(Logger.consoleStructured) // => true
```

## consoleJson

**Logging JSON output to the console**

```efx
import { Logger } from "effect"

Logger.isLogger(Logger.consoleJson) // => true
```

## tracerLogger

**Recording logs as trace span events**

```efx
const program = log("span event").pipe(
  withSpan("operation"),
  provide(Logger.layer([Logger.tracerLogger]))
)
runSync(program)
```

## layer

**Providing logger layers**

```efx
const messages: Array<unknown> = []
const customLogger = Logger.make((options) => {
  messages.push(options.message)
})
const CustomLoggerLayer = Logger.layer([customLogger])

const program = log("Application started").pipe(
  provide(CustomLoggerLayer)
)
runSync(program)
messages // => [["Application started"]]
```

## toFile

**Writing JSON logs to a file**

```efx
const writes: Array<string> = []
const file = {
  writeAll: (buffer: Uint8Array) => sync(() => {
    writes.push(new TextDecoder().decode(buffer).trim())
  })
} as unknown as FileSystem.File
const fileSystem = FileSystem.makeNoop({ open: () => succeed(file) })
const messageLogger = Logger.make((options) => String(options.message))

const program = scoped(effect {
  const fileLogger = await Logger.toFile(messageLogger, "/tmp/log.txt")
  await log("a").pipe(provide(Logger.layer([fileLogger])))
  await log("b").pipe(provide(Logger.layer([fileLogger])))
  await log("c").pipe(provide(Logger.layer([fileLogger])))
}).pipe(provideService(FileSystem.FileSystem, fileSystem))

await runPromise(program)
writes // => ["a\nb\nc"]
```

**Writing logs to files**

```efx
const writes: Array<string> = []
const file = {
  writeAll: (buffer: Uint8Array) => sync(() => {
    writes.push(new TextDecoder().decode(buffer).trim())
  })
} as unknown as FileSystem.File
const fileSystem = FileSystem.makeNoop({ open: () => succeed(file) })
const messageLogger = Logger.make((options) => String(options.message))

const program = scoped(effect {
  const fileLogger = await Logger.toFile(messageLogger, "/tmp/app.log", {
    batchWindow: "1 hour"
  })
  await log("Application started").pipe(
    provide(Logger.layer([fileLogger]))
  )
}).pipe(provideService(FileSystem.FileSystem, fileSystem))

await runPromise(program)
writes // => ["Application started"]
```
