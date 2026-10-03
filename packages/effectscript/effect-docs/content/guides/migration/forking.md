> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

# Forking: Renamed Combinators and New Options

The `fork*` family of combinators has been renamed in v4 for clarity, and all
variants now accept an options object for controlling fiber startup behavior.

## Renamings

| v3                            | v4                  | Description                                  |
| ----------------------------- | ------------------- | -------------------------------------------- |
| `Effect.fork`                 | `Effect.forkChild`  | Fork as a child of the current fiber         |
| `Effect.forkDaemon`           | `Effect.forkDetach` | Fork detached from parent lifecycle          |
| `Effect.forkScoped`           | `Effect.forkScoped` | Fork tied to the current `Scope` (unchanged) |
| `Effect.forkIn`               | `Effect.forkIn`     | Fork in a specific `Scope` (unchanged)       |
| `Effect.forkAll`              | —                   | Removed                                      |
| `Effect.forkWithErrorHandler` | —                   | Removed                                      |

## `Effect.fork` → `Effect.forkChild`

**v3**

```ts
import { Effect } from "effect"

const fiber = Effect.fork(myEffect)
```

**v4**

```efx
const fiber = forkChild(myEffect)
```

## `Effect.forkDaemon` → `Effect.forkDetach`

**v3**

```ts
import { Effect } from "effect"

const fiber = Effect.forkDaemon(myEffect)
```

**v4**

```efx
const fiber = forkDetach(myEffect)
```

## Fork Options

In v4, `forkChild`, `forkDetach`, `forkScoped`, and `forkIn` all accept an
optional options object with the following fields:

```ts
{
  readonly startImmediately?: boolean | undefined
  readonly uninterruptible?: boolean | "inherit" | undefined
}
```

- **`startImmediately`** — When `true`, the forked fiber begins executing
  immediately rather than being deferred. Defaults to `undefined` (deferred).
- **`uninterruptible`** — Controls whether the forked fiber can be interrupted.
  `true` makes it uninterruptible, `"inherit"` inherits the parent's
  interruptibility, and `undefined` uses the default behavior.

**Usage as data-last (curried)**

```efx
const fiber = myEffect.pipe(
  forkChild({ startImmediately: true })
)
```

**Usage as data-first**

```efx
const fiber = forkChild(myEffect, { startImmediately: true })
```

## Removed Combinators

**`Effect.forkAll`** and **`Effect.forkWithErrorHandler`** have been removed in
v4. For `forkAll`, fork effects individually with `forkChild` or use
higher-level concurrency combinators. For error handling on forked fibers,
observe the fiber's result via `Fiber.join` or `Fiber.await`.
