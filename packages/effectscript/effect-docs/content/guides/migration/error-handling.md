> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

# Error Handling: `catch*` Renamings

The `catch` combinators on `Effect` have been renamed in v4. The general
pattern: `catchAll*` is shortened to `catch*`, and the `catchSome*` family is
replaced by `catchFilter` / `catchCauseFilter`.

## Renamings

| v3                       | v4                             |
| ------------------------ | ------------------------------ |
| `Effect.catchAll`        | `Effect.catch`                 |
| `Effect.catchAllCause`   | `Effect.catchCause`            |
| `Effect.catchAllDefect`  | `Effect.catchDefect`           |
| `Effect.catchTag`        | `Effect.catchTag` (unchanged)  |
| `Effect.catchTags`       | `Effect.catchTags` (unchanged) |
| `Effect.catchIf`         | `Effect.catchIf` (unchanged)   |
| `Effect.catchSome`       | `Effect.catchFilter`           |
| `Effect.catchSomeCause`  | `Effect.catchCauseFilter`      |
| `Effect.catchSomeDefect` | Removed                        |

## `Effect.catchAll` → `Effect.catch`

**v3**

```ts
import { Effect } from "effect"

const program = Effect.fail("error").pipe(
  Effect.catchAll((error) => Effect.succeed(`recovered: ${error}`))
)
```

**v4**

```efx
const program = fail("error").pipe(
  Effect.catch((error) => succeed(`recovered: ${error}`))
)
```

## `Effect.catchAllCause` → `Effect.catchCause`

**v3**

```ts
import { Effect } from "effect"

const program = Effect.die("defect").pipe(
  Effect.catchAllCause((cause) => Effect.succeed("recovered"))
)
```

**v4**

```efx
import { Cause } from "effect"

const program = die("defect").pipe(
  catchCause((cause) => succeed("recovered"))
)
```

## `Effect.catchSome` → `Effect.catchFilter`

In v3, `catchSome` took a function returning `Option<Effect>`. In v4,
`catchFilter` uses the `Filter` module instead.

**v3**

```ts
import { Effect, Option } from "effect"

const program = Effect.fail(42).pipe(
  Effect.catchSome((error) =>
    error === 42
      ? Option.some(Effect.succeed("caught"))
      : Option.none()
  )
)
```

**v4**

```efx
const program = fail(42).pipe(
  catchFilter(
    Filter.fromPredicate((error: number) => error === 42),
    (error) => succeed("caught")
  )
)
```

## New in v4

- **`Effect.catchReason(errorTag, reasonTag, handler)`** — catches a specific
  `reason` within a tagged error without removing the parent error from the
  error channel. Useful for handling nested error causes (e.g. an `AiError`
  with a `reason: RateLimitError | QuotaExceededError`).
- **`Effect.catchReasons(errorTag, cases)`** — like `catchReason` but handles
  multiple reason tags at once via an object of handlers.
- **`Effect.catchEager(handler)`** — an optimization variant of `catch` that
  evaluates synchronous recovery effects immediately.
