# effect/cli/HelpDoc

The examples in the JSDoc of `packages/effect/src/cli/HelpDoc.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## HelpDoc

**Defining command help documentation**

```efx
import { Context, Option as O } from "effect"
import type { HelpDoc } from "effect/cli"

const deployCommandHelp: HelpDoc.HelpDoc = {
  description: "Deploy your application to the cloud",
  usage: "myapp deploy [options] <target>",
  annotations: Context.empty(),
  flags: [
    {
      name: "verbose",
      aliases: ["-v"],
      type: "boolean",
      description: O.some("Enable verbose logging"),
      required: false
    },
    {
      name: "env",
      aliases: ["-e"],
      type: "string",
      description: O.some("Target environment"),
      required: true
    }
  ],
  args: [
    {
      name: "target",
      type: "string",
      description: O.some("Deployment target (e.g., 'production', 'staging')"),
      required: true,
      variadic: false
    }
  ]
}

deployCommandHelp.usage // => "myapp deploy [options] <target>"
```

## FlagDoc

**Documenting command flags**

```efx
import { Option as O } from "effect"
import type { HelpDoc } from "effect/cli"

const verboseFlag: HelpDoc.FlagDoc = {
  name: "verbose",
  aliases: ["-v", "--verbose"],
  type: "boolean",
  description: O.some("Enable verbose output"),
  required: false
}

const portFlag: HelpDoc.FlagDoc = {
  name: "port",
  aliases: ["-p"],
  type: "integer",
  description: O.some("Port number to use"),
  required: true
}

const names = [verboseFlag.name, portFlag.name] // => ["verbose", "port"]
```

## SubcommandDoc

**Documenting subcommands**

```efx
import { Context, Option as O } from "effect"
import type { HelpDoc } from "effect/cli"

const deploySubcommand: HelpDoc.SubcommandDoc = {
  name: "deploy",
  alias: "d",
  shortDescription: "Deploy app",
  description: "Deploy the application to the cloud"
}

const buildSubcommand: HelpDoc.SubcommandDoc = {
  name: "build",
  alias: undefined,
  shortDescription: undefined,
  description: "Build the application for production"
}

// Used in parent command's help documentation
const mainCommandHelp: HelpDoc.HelpDoc = {
  description: "Cloud deployment tool",
  usage: "myapp <command> [options]",
  annotations: Context.empty(),
  flags: [],
  subcommands: [{
    group: undefined,
    commands: [deploySubcommand, buildSubcommand]
  }]
}

mainCommandHelp.subcommands?.[0].commands.map((command) => command.name) // => ["deploy", "build"]
```

## ArgDoc

**Documenting positional arguments**

```efx
import { Context, Option as O } from "effect"
import type { HelpDoc } from "effect/cli"

const sourceArg: HelpDoc.ArgDoc = {
  name: "source",
  type: "file",
  description: O.some("Source file to process"),
  required: true,
  variadic: false
}

const filesArg: HelpDoc.ArgDoc = {
  name: "files",
  type: "file",
  description: O.some("Files to process (can specify multiple)"),
  required: false,
  variadic: true
}

// Used in command help documentation
const copyCommandHelp: HelpDoc.HelpDoc = {
  description: "Copy files from source to destination",
  usage: "copy <source> [files...]",
  annotations: Context.empty(),
  flags: [],
  args: [sourceArg, filesArg]
}

copyCommandHelp.args?.map((arg) => arg.name) // => ["source", "files"]
```
