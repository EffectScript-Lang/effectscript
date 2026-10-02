# effect/cli/Prompt

The examples in the JSDoc of `packages/effect/src/cli/Prompt.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## all

**Collecting prompt results**

```efx
import { Prompt } from "effect/cli"

const terminal = Terminal.make({
  columns: succeed(80),
  rows: succeed(24),
  readInput: succeed({} as never),
  readLine: die("unused"),
  display: () => Effect.void
})
const services = Layer.mergeAll(
  FileSystem.layerNoop({}),
  Path.layer,
  Layer.succeed(Terminal.Terminal, terminal)
)

const username = Prompt.succeed("alice")
const password = Prompt.succeed("secret")

const allWithTuple = Prompt.all([username, password])

const allWithRecord = Prompt.all({ username, password })

await runPromise(provide(allWithTuple, services)) // => ["alice", "secret"]
await runPromise(provide(allWithRecord, services)) // => { username: "alice", password: "secret" }
```

## AutoComplete

**Filtering choices with autocomplete**

```efx
import { Prompt } from "effect/cli"

const language = Prompt.AutoComplete({
  message: "Choose a language",
  choices: [
    { title: "TypeScript", value: "ts" },
    { title: "Rust", value: "rs" },
    { title: "Kotlin", value: "kt" }
  ]
})

Prompt.isPrompt(language) // => true
```
