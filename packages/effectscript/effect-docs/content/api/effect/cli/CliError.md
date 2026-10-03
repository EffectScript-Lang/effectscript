# effect/cli/CliError

The examples in the JSDoc of `packages/effect/src/cli/CliError.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## isCliError

**Checking CLI errors**

```efx
const error = new CliError.MissingOption({ option: "api-key" })
const program = CliError.isCliError(error)
  ? succeed(error.message)
  : fail("Unknown error")

await runPromise(program) // => "Missing required flag: --api-key"
```

## CliError

**Handling CLI errors**

```efx
import { CliError } from "effect/cli"

const describe = (error: CliError.CliError): string => {
  switch (error._tag) {
    case "UnrecognizedOption":
      return `Unknown flag: ${error.option}`
    case "MissingOption":
      return `Required flag missing: ${error.option}`
    case "InvalidValue":
      return `Invalid value: ${error.value} for ${error.option}`
    case "ShowHelp":
      return `Help requested for: ${error.commandPath.join(" ")}`
    default:
      return error.message
  }
}

describe(new CliError.MissingOption({ option: "token" })) // => "Required flag missing: token"
```

## UnrecognizedOption

**Creating unrecognized option errors**

```efx
// Creating an unrecognized option error
const unrecognizedError = new CliError.UnrecognizedOption({
  option: "--unknown-flag",
  command: ["deploy", "production"],
  suggestions: ["--verbose", "--force"]
})

unrecognizedError._tag // => "UnrecognizedOption"
unrecognizedError.option // => "--unknown-flag"
unrecognizedError.command // => ["deploy", "production"]

// In CLI parsing context
const parseCommand = effect {
  // If parsing encounters unknown flag
  return await unrecognizedError
}

const parseError = await runPromise(flip(parseCommand))
parseError._tag // => "UnrecognizedOption"
```

## DuplicateOption

**Creating duplicate option errors**

```efx
import { CliError } from "effect/cli"

const duplicateError = new CliError.DuplicateOption({
  option: "--verbose",
  parentCommand: "myapp",
  childCommand: "deploy"
})

duplicateError._tag // => "DuplicateOption"
duplicateError.option // => "--verbose"
duplicateError.parentCommand // => "myapp"
duplicateError.childCommand // => "deploy"
```

## MissingOption

**Creating missing option errors**

```efx
const missingOptionError = new CliError.MissingOption({
  option: "api-key"
})

const details = [missingOptionError._tag, missingOptionError.option] // => ["MissingOption", "api-key"]

// In validation context
const validateRequiredOptions = (options: Record<string, string | undefined>) =>
  effect {
    const apiKey = options["api-key"]
    if (!apiKey) {
      return await missingOptionError
    }
    return apiKey
  }

const validationError = await runPromise(flip(validateRequiredOptions({})))
validationError._tag // => "MissingOption"
```

## MissingArgument

**Creating missing argument errors**

```efx
const missingArgError = new CliError.MissingArgument({
  argument: "target"
})

const details = [missingArgError._tag, missingArgError.argument] // => ["MissingArgument", "target"]

// In argument parsing
const parseArguments = (args: Array<string>) =>
  effect {
    if (args.length === 0) {
      return await missingArgError
    }
    return args[0]
  }

const parseError = await runPromise(flip(parseArguments([])))
parseError._tag // => "MissingArgument"
```

## UnexpectedArgument

**Reporting unexpected arguments**

```efx
import { CliError } from "effect/cli"

const error = new CliError.UnexpectedArgument({
  arguments: ["extra.txt"]
})

const details = [error._tag, error.arguments] // => ["UnexpectedArgument", ["extra.txt"]]
```

## InvalidValue

**Creating invalid value errors**

```efx
import { CliError } from "effect/cli"

const invalidValueError = new CliError.InvalidValue({
  option: "port",
  value: "abc123",
  expected: "integer between 1 and 65535",
  kind: "flag"
})

invalidValueError._tag // => "InvalidValue"
invalidValueError.kind // => "flag"
invalidValueError.option // => "port"
invalidValueError.value // => "abc123"

// For positional arguments
const invalidArgError = new CliError.InvalidValue({
  option: "count",
  value: "abc",
  expected: "integer",
  kind: "argument"
})

const details = [invalidArgError.kind, invalidArgError.option, invalidArgError.value] // => ["argument", "count", "abc"]
```

## UnknownSubcommand

**Creating unknown subcommand errors**

```efx
const unknownSubcommandError = new CliError.UnknownSubcommand({
  subcommand: "deplyo", // typo
  parent: ["myapp"],
  suggestions: ["deploy", "destroy"]
})

unknownSubcommandError._tag // => "UnknownSubcommand"
unknownSubcommandError.subcommand // => "deplyo"
unknownSubcommandError.parent // => ["myapp"]

// In subcommand parsing
const parseSubcommand = (subcommand: string) =>
  effect {
    const validCommands = ["deploy", "destroy", "status"]
    if (!validCommands.includes(subcommand)) {
      return await unknownSubcommandError
    }
    return subcommand
  }

const parseError = await runPromise(flip(parseSubcommand("deplyo")))
parseError._tag // => "UnknownSubcommand"
```

## UserError

**Wrapping user errors**

```efx
// Wrapping user errors
const userError = new CliError.UserError({
  cause: new Error("Database connection failed for postgres://localhost"),
  userMessage: "Could not connect to the database"
})

// In command handler
const deployCommand = effect {
  const result = await Effect.try({
    try: () => ({ deployed: true }),
    catch: (error) => new CliError.UserError({ cause: error })
  })
  return result
}

// In error handling
const handleError = (error: CliError): Effect<number> => {
  if (error._tag === "UserError") {
    return succeed(1) // Exit code 1
  }
  return succeed(0)
}

await runPromise(deployCommand) // => { deployed: true }
await runPromise(handleError(userError)) // => 1
```
