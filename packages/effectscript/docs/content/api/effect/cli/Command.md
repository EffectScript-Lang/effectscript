# effect/cli/Command

The examples in the JSDoc of `packages/effect/src/cli/Command.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Command

**Defining CLI commands**

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

// Simple command with no configuration
const version: Command<"version", {}, {}, never, never> = Command.make(
  "version"
)

// Command with flags and arguments
const deploy: Command<
  "deploy",
  {
    readonly env: string
    readonly force: boolean
    readonly files: ReadonlyArray<string>
  },
  {},
  never,
  never
> = Command.make("deploy", {
  env: Flag.String("env"),
  force: Flag.Boolean("force").pipe(Flag.withDefault(false)),
  files: Argument.String("files").pipe(Argument.variadic())
})

// Command with handler
const output: Array<string> = []
const greet = Command.make("greet", {
  name: Flag.String("name")
}, (config) => sync(() => output.push(`Hello, ${config.name}!`)).pipe(asVoid))

await runPromise(
  Command.runWith(greet, { version: "1.0.0" })(["--name", "Alice"]).pipe(provide(CliTestLayer))
)
output // => ["Hello, Alice!"]
```

## Command.Config

**Configuring command input**

```efx
import { Argument, Flag } from "effect/cli"
import type { Command as CliCommand } from "effect/cli"

// Simple flat configuration
const simpleConfig = {
  name: Flag.String("name"),
  age: Flag.Int("age"),
  file: Argument.String("file")
} satisfies CliCommand.Command.Config

// Nested configuration for organization
const nestedConfig = {
  user: {
    name: Flag.String("name"),
    email: Flag.String("email")
  },
  server: {
    host: Flag.String("host"),
    port: Flag.Int("port")
  }
} satisfies CliCommand.Command.Config

[simpleConfig.name.kind, nestedConfig.server.port.kind] // => ["flag", "flag"]
```

## Command.Config.Infer

**Inferring command input**

```efx
import { Flag } from "effect/cli"
import type { Command as CliCommand } from "effect/cli"

const config = {
  name: Flag.String("name"),
  server: {
    host: Flag.String("host"),
    port: Flag.Int("port")
  }
} as const

type Result = CliCommand.Command.Config.Infer<typeof config>
// {
//   readonly name: string
//   readonly server: {
//     readonly host: string
//     readonly port: number
//   }
// }

const inferred: Result = {
  name: "Alice",
  server: { host: "localhost", port: 8080 }
}
inferred // => { name: "Alice", server: { host: "localhost", port: 8080 } }
```

## CommandContext

**Accessing parent command context**

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

const parent = Command.make("app").pipe(
  Command.withSharedFlags({
    verbose: Flag.Boolean("verbose").pipe(Flag.withDefault(false)),
    config: Flag.String("config")
  })
)

const output: Array<string> = []
const child = Command.make("deploy", {
  target: Flag.String("target")
}, (config) =>
  effect {
    // Access parent's config by yielding the parent command
    const parentConfig = await parent
    await sync(() => output.push(`Verbose: ${parentConfig.verbose}`))
    await sync(() => output.push(`Config: ${parentConfig.config}`))
    await sync(() => output.push(`Target: ${config.target}`))
  })

const app = parent.pipe(Command.withSubcommands([child]))

await runPromise(
  Command.runWith(app, { version: "1.0.0" })([
    "--verbose",
    "--config",
    "prod.json",
    "deploy",
    "--target",
    "staging"
  ]).pipe(provide(CliTestLayer))
)
output // => ["Verbose: true", "Config: prod.json", "Target: staging"]
```

## make

**Creating commands**

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

// Simple command with no configuration
const version = Command.make("version")

// Command with simple flags
const greet = Command.make("greet", {
  name: Flag.String("name"),
  count: Flag.Int("count").pipe(Flag.withDefault(1))
})

// Command with nested configuration
const deploy = Command.make("deploy", {
  environment: Flag.String("env").pipe(
    Flag.withDescription("Target environment")
  ),
  server: {
    host: Flag.String("host").pipe(Flag.withDefault("localhost")),
    port: Flag.Int("port").pipe(Flag.withDefault(3000))
  },
  files: Argument.String("files").pipe(Argument.variadic),
  force: Flag.Boolean("force").pipe(
    Flag.withDescription("Force deployment"),
    Flag.withDefault(false)
  )
})

// Command with handler
const output: Array<string> = []
const deployWithHandler = Command.make("deploy", {
  environment: Flag.String("env"),
  force: Flag.Boolean("force").pipe(Flag.withDefault(false))
}, (config) =>
  effect {
    await sync(() => output.push(`Starting deployment to ${config.environment}`))

    if (!config.force && config.environment === "production") {
      return await fail("Production deployments require --force flag")
    }

    await sync(() => output.push("Deployment completed successfully"))
  })

await runPromise(
  Command.runWith(deployWithHandler, { version: "1.0.0" })([
    "--env",
    "staging",
    "--force"
  ]).pipe(provide(CliTestLayer))
)
output // => ["Starting deployment to staging", "Deployment completed successfully"]
```

## withHandler

**Adding command handlers**

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

// Command without initial handler
const greet = Command.make("greet", {
  name: Flag.String("name")
})

// Add handler later
const output: Array<string> = []
const greetWithHandler = greet.pipe(
  Command.withHandler((config: { readonly name: string }) =>
    sync(() => output.push(`Hello, ${config.name}!`)).pipe(asVoid)
  )
)

await runPromise(
  Command.runWith(greetWithHandler, { version: "1.0.0" })(["--name", "Alice"]).pipe(
    provide(CliTestLayer)
  )
)
output // => ["Hello, Alice!"]
```

## withSubcommands

**Adding subcommands**

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

// Parent command with shared flags
const git = Command.make("git").pipe(
  Command.withSharedFlags({
    verbose: Flag.Boolean("verbose").pipe(Flag.withDefault(false))
  })
)

// Subcommand that accesses parent config
const output: Array<string> = []
const clone = Command.make("clone", {
  repository: Flag.String("repo")
}, (config) =>
  effect {
    const parent = await git // Access parent's parsed config
    if (parent.verbose) {
      await sync(() => output.push("Verbose mode enabled"))
    }
    await sync(() => output.push(`Cloning ${config.repository}`))
  })

const app = git.pipe(Command.withSubcommands([clone]))

await runPromise(
  Command.runWith(app, { version: "1.0.0" })([
    "--verbose",
    "clone",
    "--repo",
    "github.com/foo/bar"
  ]).pipe(provide(CliTestLayer))
)
output // => ["Verbose mode enabled", "Cloning github.com/foo/bar"]
```

## withDescription

**Setting descriptions**

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

const output: Array<string> = []
const deploy = Command.make("deploy", {
  environment: Flag.String("env")
}, (config) =>
  effect {
    await sync(() => output.push(`Deploying to ${config.environment}`))
  }).pipe(
    Command.withDescription("Deploy the application to a specified environment")
  )

await runPromise(
  Command.runWith(deploy, { version: "1.0.0" })(["--env", "staging"]).pipe(provide(CliTestLayer))
)
output // => ["Deploying to staging"]
```

## unlisted

**Unlisting a subcommand**

```efx
import { Command } from "effect/cli"

// `experimental` still runs when invoked as `mycli experimental`,
// but it does not appear under SUBCOMMANDS in `mycli --help`.
const experimental = Command.make("experimental").pipe(
  Command.unlisted
)

const root = Command.make("mycli").pipe(
  Command.withSubcommands([experimental])
)

root.subcommands[0].commands[0].unlisted // => true
```

## withExamples

**Adding usage examples**

```efx
import { Command } from "effect/cli"

const login = Command.make("login").pipe(
  Command.withExamples([
    { command: "myapp login", description: "Log in with browser OAuth" },
    { command: "myapp login --token sbp_abc123", description: "Log in with a token" }
  ])
)

login.examples.map((example) => example.command) // => ["myapp login", "myapp login --token sbp_abc123"]
```

## provide

**Providing command services**

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

const output: Array<string> = []
const deploy = Command.make("deploy", {
  env: Flag.String("env")
}, (config) =>
  effect {
    const fs = await FileSystem
    await sync(() => output.push(`Using file system for ${config.env}`))
  }).pipe(
    // Provide FileSystem based on the --env flag
    Command.provide((config) =>
      config.env === "local"
        ? FileSystem.layerNoop({})
        : FileSystem.layerNoop({
          access: () =>
            fail(
              PlatformError.badArgument({
                module: "FileSystem",
                method: "access"
              })
            )
        })
    )
  )

await runPromise(
  Command.runWith(deploy, { version: "1.0.0" })(["--env", "local"]).pipe(provide(CliTestLayer))
)
output // => ["Using file system for local"]
```

## wizard

**Constructing command arguments**

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

const command = Command.make("app")
const silentConsole: Console.Console = Object.assign(Object.create(console), {
  log: () => {}
})

const program = Command.wizard(command).pipe(
  provideService(Console.Console, silentConsole),
  provide(CliTestLayer)
)

await runPromise(program) // => ["app"]
```

## run

**Running commands with standard input**

```efx

const CliTestLayer = Layer.mergeAll(
  FileSystem.layerNoop({}),
  Path.layer,
  Stdio.layerTest({
    args: succeed(["--name", "Alice"])
  }),
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

const output: Array<string> = []
const greetCommand = Command.make("greet", {
  name: Flag.String("name")
}, (config) =>
  effect {
    await sync(() => output.push(`Hello, ${config.name}!`))
  })

// Automatically gets args from the Stdio service
const program = Command.run(greetCommand, {
  version: "1.0.0"
})

await runPromise(program.pipe(provide(CliTestLayer)))
output // => ["Hello, Alice!"]
```

## runWith

**Running commands with explicit arguments**

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

const output: Array<string> = []
const greet = Command.make("greet", {
  name: Flag.String("name"),
  count: Flag.Int("count").pipe(Flag.withDefault(1))
}, (config) =>
  effect {
    for (let i = 0; i < config.count; i++) {
      await sync(() => output.push(`Hello, ${config.name}!`))
    }
  })

// Test with specific arguments
const testProgram = effect {
  const runCommand = Command.runWith(greet, { version: "1.0.0" })

  await runCommand(["--name", "Alice", "--count", "2"])
}

await runPromise(testProgram.pipe(provide(CliTestLayer)))
output // => ["Hello, Alice!", "Hello, Alice!"]
```
