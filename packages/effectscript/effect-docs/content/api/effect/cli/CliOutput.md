# effect/cli/CliOutput

The examples in the JSDoc of `packages/effect/src/cli/CliOutput.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Formatter

**Customizing CLI output formatting**

```efx
// Create a custom formatter implementation
const customFormatter: CliOutput.Formatter = {
  formatHelpDoc: (doc) => `Custom Help: ${doc.usage}`,
  formatCliError: (error) => `Error: ${error.message}`,
  formatError: (error) => `[ERROR] ${error.message}`,
  formatVersion: (name, version) => `${name} (${version})`,
  formatErrors: (errors) => errors.map((error) => error.message).join("\\n")
}

// Use the custom formatter in a program
const program = effect {
  const formatter = await CliOutput.Formatter
  return formatter.formatVersion("myapp", "1.0.0")
}
  |> provide(CliOutput.layer(customFormatter))

await runPromise(program) // => "myapp (1.0.0)"
```

**Accessing the output formatter**

```efx
// Access the formatter service
const program = effect {
  const formatter = await CliOutput.Formatter

  // Format version information
  return formatter.formatVersion("my-cli", "2.1.0")
}

// Run with default formatter
await runPromise(program.pipe(
  provide(CliOutput.layer(CliOutput.defaultFormatter({ colors: false })))
)) // => "my-cli v2.1.0"
```

## Formatter.formatHelpDoc

**Formatting help documents**

```efx
import { Option as O } from "effect"
import { CliOutput } from "effect/cli"
import type { HelpDoc } from "effect/cli"

const helpDoc: HelpDoc = {
  usage: "myapp [options] <file>",
  description: "Process files with various options",
  flags: [
    {
      name: "verbose",
      aliases: ["-v"],
      type: "boolean",
      description: O.some("Enable verbose output"),
      required: false
    }
  ],
  args: [
    {
      name: "file",
      type: "string",
      description: O.some("Input file to process"),
      required: true,
      variadic: false
    }
  ]
}

const formatter = CliOutput.defaultFormatter()
const helpText = formatter.formatHelpDoc(helpDoc)
const sectionsPresent = [helpText.includes("DESCRIPTION"), helpText.includes("FLAGS")] // => [true, true]
```

## Formatter.formatCliError

**Formatting CLI errors**

```efx
import { Data } from "effect"
import { CliOutput } from "effect/cli"

class InvalidOption extends Data.TaggedError("InvalidOption")<{
  readonly message: string
}> {}

const formatter = CliOutput.defaultFormatter()
const error = new InvalidOption({ message: "Unknown flag '--invalid'" })
const errorMessage = formatter.formatCliError(error)
errorMessage // => "Unknown flag '--invalid'"
```

## Formatter.formatError

**Formatting error sections**

```efx
import { Data } from "effect"
import { CliOutput } from "effect/cli"

class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string
}> {}

const colorFormatter = CliOutput.defaultFormatter({ colors: true })
const noColorFormatter = CliOutput.defaultFormatter({ colors: false })

const error = new ValidationError({ message: "Value must be positive" })

const coloredError = colorFormatter.formatError(error)
coloredError.includes("\u001b[31mERROR") // => true

const plainError = noColorFormatter.formatError(error)
plainError // => "\nERROR\n  Value must be positive"
```

## Formatter.formatVersion

**Formatting version output**

```efx
import { CliOutput } from "effect/cli"

const colorFormatter = CliOutput.defaultFormatter({ colors: true })
const noColorFormatter = CliOutput.defaultFormatter({ colors: false })

const appName = "my-awesome-tool"
const version = "1.2.3"

const coloredVersion = colorFormatter.formatVersion(appName, version)
coloredVersion // => "\u001b[1mmy-awesome-tool\u001b[0m \u001b[2mv\u001b[0m\u001b[1m1.2.3\u001b[0m"

const plainVersion = noColorFormatter.formatVersion(appName, version)
plainVersion // => "my-awesome-tool v1.2.3"
```

## Formatter.formatErrors

**Formatting grouped errors**

```efx
import { CliError, CliOutput } from "effect/cli"

const formatter = CliOutput.defaultFormatter({ colors: false })

const errors = [
  new CliError.UnrecognizedOption({
    option: "--foo",
    suggestions: ["--force"]
  }),
  new CliError.UnrecognizedOption({ option: "--bar", suggestions: [] }),
  new CliError.MissingOption({ option: "--required" })
]

const output = formatter.formatErrors(errors)
const optionsPresent = [output.includes("--foo"), output.includes("--required")] // => [true, true]
```

## layer

**Providing a custom formatter**

```efx
// Create a custom formatter without colors
const noColorFormatter = CliOutput.defaultFormatter({ colors: false })
const NoColorLayer = CliOutput.layer(noColorFormatter)

// Create a program that uses the custom formatter
const program = effect {
  const formatter = await CliOutput.Formatter
  return formatter.formatVersion("my-cli", "1.0.0")
}
  |> provide(NoColorLayer)

await runPromise(program) // => "my-cli v1.0.0"
```

## defaultFormatter

**Creating default formatters**

```efx
import { CliError, CliOutput } from "effect/cli"

// Create a formatter without colors for tests or CI environments
const noColorFormatter = CliOutput.defaultFormatter({ colors: false })

// Create a formatter with colors forced on
const colorFormatter = CliOutput.defaultFormatter({ colors: true })

// Auto-detect colors based on terminal support (default behavior)
const autoFormatter = CliOutput.defaultFormatter()

const error = new CliError.InvalidValue({
  option: "foo",
  value: "bar",
  expected: "baz",
  kind: "flag"
})

noColorFormatter.formatError(error).includes("Invalid value") // => true
colorFormatter.formatVersion("my-tool", "1.2.3").includes("my-tool") // => true
autoFormatter.formatVersion("my-tool", "1.2.3").includes("1.2.3") // => true
```
