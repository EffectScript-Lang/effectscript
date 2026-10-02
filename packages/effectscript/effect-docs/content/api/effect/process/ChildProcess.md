# effect/process/ChildProcess

The examples in the JSDoc of `packages/effect/src/process/ChildProcess.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## PipeOptions

**Piping stderr between commands**

```efx
import { ChildProcess } from "effect/process"

// Pipe stderr instead of stdout
const pipeline = ChildProcess.make`my-program`.pipe(
  ChildProcess.pipeTo(ChildProcess.make`grep error`, { from: "stderr" })
)
const result = [pipeline._tag, pipeline.options.from] // => ["PipedCommand", "stderr"]
```

## CommandOptions.additionalFds

**Configuring additional file descriptors**

```efx
import { ChildProcess } from "effect/process"

// Output fd3 - read data from child
const cmd1 = ChildProcess.make("my-program", [], {
  additionalFds: {
    fd3: { type: "output" }
  }
})

// Input fd3 - write data to child
const cmd2 = ChildProcess.make("my-program", [], {
  additionalFds: {
    fd3: { type: "input" }
  }
})
const result = [cmd1.options.additionalFds?.fd3?.type, cmd2.options.additionalFds?.fd3?.type]
result // => ["output", "input"]
```

## make

**Creating commands**

```efx
import { ChildProcess } from "effect/process"

// Template literal form
const cmd1 = ChildProcess.make`echo "hello"`

// With options
const cmd2 = ChildProcess.make({ cwd: "/tmp" })`ls -la`

// Array form
const cmd3 = ChildProcess.make("git", ["status"])

const result = [cmd1.command, cmd2.options.cwd, cmd3.args[0]] // => ["echo", "/tmp", "status"]
```

## pipeTo

**Piping command output**

```efx
import { ChildProcess } from "effect/process"

// Pipe stdout (default)
const pipeline1 = ChildProcess.make`cat file.txt`.pipe(
  ChildProcess.pipeTo(ChildProcess.make`grep pattern`)
)

// Pipe stderr instead of stdout
const pipeline2 = ChildProcess.make`my-program`.pipe(
  ChildProcess.pipeTo(ChildProcess.make`grep error`, { from: "stderr" })
)

// Pipe combined stdout and stderr
const pipeline3 = ChildProcess.make`my-program`.pipe(
  ChildProcess.pipeTo(ChildProcess.make`tee output.log`, { from: "all" })
)

const result = [pipeline1._tag, pipeline2.options.from, pipeline3.options.from]
result // => ["PipedCommand", "stderr", "all"]
```

## prefix

**Prefixing commands**

```efx
import { ChildProcess } from "effect/process"

const command = ChildProcess.make`echo "foo"`

const prefixed = command.pipe(
  ChildProcess.prefix`time`
)

// now prefixed will execute `time echo "foo"`
const result = prefixed._tag === "StandardCommand" ? `${prefixed.command} ${prefixed.args[0]}` : prefixed._tag
result // => "time echo"
```

## setCwd

**Setting command working directories**

```efx
import { ChildProcess } from "effect/process"

const cmd = ChildProcess.make`ls -la`.pipe(
  ChildProcess.setCwd("/tmp")
)
const result = cmd._tag === "StandardCommand" && cmd.options.cwd // => "/tmp"
```

## setEnv

**Setting command environment variables**

```efx
import { ChildProcess } from "effect/process"

const cmd = ChildProcess.make`node script.js`.pipe(
  ChildProcess.setEnv({ NODE_ENV: "test" })
)
const result = cmd._tag === "StandardCommand" && cmd.options.env?.NODE_ENV // => "test"
```

## splitByWhitespaces

```ts
ChildProcess.exec`echo foo\n bar`
// We should run `["echo", "foo\n", "bar"]`

ChildProcess.exec`echo foo
 bar`
// We should run `["echo", "foo", "bar]`
```
