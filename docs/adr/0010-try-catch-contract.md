# ADR-0010: One `try`/`catch` contract inside `effect` code

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** the user ("catches everything, like JS"); agent rulings on the lowering, from
  review findings R02 and R03
- **Related:** review R02, R03; spec §4.4; supersedes the "effectful `try`" rule in Plan 1

## Context

Plan 1 lowered a `try` inside `effect` code to Effect only when its block contained `await` or
`throw`; otherwise it stayed a native JS `try`. Adding one unrelated `await` could change what an
existing `catch` caught: a `JSON.parse` exception went from caught to an uncaught defect. Several
typed clauses were alternatives when grouped into `catchTags`, but chained when unions forced
sequential `catchTag` calls. A native generator `finally` also doesn't run when a yielded effect
fails.

## Decision

Inside `effect` code, **every** `try` statement compiles to Effect, whatever its contents:
`Effect.gen(try block)` piped through handlers. Outside `effect` code, `try` is native
JavaScript.

**What the clauses catch.** Clauses are alternatives over the original outcome of the try block,
checked in source order:

- `catch (e: T)` / `catch (e: A | B)` matches typed failures by `_tag`.
- An untyped `catch (e)` or `catch` must be the last clause. It matches every failure that no
  typed clause matched, and every **defect** of the try block, including synchronous exceptions
  such as `JSON.parse` errors.
- Defects reach a catch clause as `Cause.UnknownError`, with the thrown value in `e.cause`. This is
  Effect's own convention for thrown values (`Effect.try`, `Effect.tryPromise`). An untyped `e` is
  therefore typed `E | Cause.UnknownError`, and `catch (e: UnknownError)` catches only thrown
  exceptions.
- **Interruption is never caught.**
- A failure or defect raised inside a handler propagates out of the `try`. Sibling clauses never
  see it.
- `finally` always runs: on success, failure, defect and interruption (`Effect.ensuring`).

**Tags.** A tag comes from the declaration when the type names a local `error`, or a `schema`
with a `_tag`. Custom `_tag` values are respected. Otherwise the tag is the last segment of the
type name. In that case `catchTag`'s signature (`K extends Tags<E>`) makes TypeScript reject a tag
that isn't in the error channel.

**Lowering.** One dispatch combinator, so clauses are always alternatives:

| Clauses                                   | Handlers after `Effect.gen(…)`                                          |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| any clause that catches defects (untyped, or `UnknownError`) | first `Effect.catchDefect((defect) => Effect.fail(new Cause.UnknownError(defect)))` |
| untyped only                              | `Effect.catch((e) => …)`                                                 |
| one typed (single tag or union) [+ untyped] | `Effect.catchTag(K, (e) => …[, (e) => …])`                           |
| several single-tag typed [+ untyped]      | `Effect.catchTags({ A: …, B: … }[, (e) => …])`                           |
| several typed, some unions [+ untyped]    | nested `orElse`: `Effect.catchTag(K1, h1, (e) => Effect.catchTag(Effect.fail(e), K2, h2[, …]))` |
| `finally`                                 | `Effect.ensuring(Effect.gen(…))`                                         |

The control-flow rules stay: every path returns or none does (EFX2020); no `break`/`continue`
across the `try`, and no `return` in `finally` (EFX2021). EFX2022 ("typed catch needs an
effectful try") is removed: every `try` in `effect` code is effectful.

## Consequences

- A harmless added `await` never changes what a `catch` catches.
- `catch (e)` in `effect` code gives `e: E | Cause.UnknownError` instead of `e: E`. Code that
  relied on the narrower type must use typed clauses. This is the honest type: the clause really
  does receive defects.
- Every `try` in `effect` code costs an `Effect.gen`, even around purely synchronous code. That is
  more output, but the meaning is predictable.
- The reverse compiler recognizes exactly these shapes. A native `try` around `yield*` stays
  TypeScript (§6.3).

## Alternatives considered

- **Keep the hybrid** (native `try` unless the block awaits or throws): the discontinuity in R02.
- **Typed failures only** (defects pass through; sync code needs `tryCatch`): stable, but
  surprising to TypeScript developers and AI. The user chose "everything, like JS".
- **`Effect.catchCause` with `Cause.squash`** (the `e` is the raw thrown value): closest to JS, but
  `e` becomes `unknown` even for typed failures, and typed plus untyped clauses would need a
  hand-written dispatch or a duplicated handler.
- **Sequential `catchTag` calls (chaining):** later clauses could catch failures raised by earlier
  handlers. That contradicts how multi-catch works in Java/C#, and is what R03 reported.
