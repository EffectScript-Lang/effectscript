# ADR-0011: `using` is function-level only; `defer` is function-scoped

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** the user (`using`: "top-level only for now"); agent ruling for `defer`, from
  review R05
- **Related:** review R05; spec §4.3; ADR-0010

## Context

`using x = await e` in `effect` code makes the enclosing `effect` scoped (`Effect.scoped`), so a
resource lives until the whole function exits. In a nested block or loop, JS `using` readers
expect release at the end of the block. Instead resources would pile up until function exit.

## Decision

- **`using x = await e`** is allowed only as a statement directly in the top-level body of an
  `effect` function, block, method, arrow or `main`. Anywhere else (nested blocks, loops, `if`, a
  `try` block) it is error **EFX2013**: "move it to the top of the `effect`, or put the block in
  its own `effect { … }` and `await` it". The resource is released when the `effect` exits, in
  reverse acquisition order, on success, failure and interruption.
- **`using x = e` without `await`** keeps native TypeScript semantics (`Symbol.dispose`) everywhere.
- **`defer`** is function-scoped, like Go's `defer`, and allowed anywhere in `effect` code. Every
  executed `defer` registers a finalizer that runs when the enclosing `effect` exits, in reverse
  registration order. A `defer` in a loop registers one finalizer per iteration. The expression is
  evaluated at cleanup time (`addFinalizer(() => e)`), unlike Go, which evaluates arguments
  immediately.
  - `defer { … }` without `await` → `Effect.addFinalizer(() => Effect.sync(() => { … }))`.
  - `defer { … }` with `await` → `Effect.addFinalizer(() => Effect.gen(function*() { … }))`.
  - A finalizer must not fail (it is `Effect<…, never>`). The output's type check reports a
    failing one; handle it with `orDie` or a `try`.
- Layer-constructor `effect` blocks are never wrapped in `Effect.scoped`: the layer owns the scope.

## Consequences

- No silent resource accumulation from `using` in loops.
- Block-lifetime `using` remains possible later (a new ADR) by lowering nested blocks to scoped
  sub-effects.
- `defer` in a loop accumulates finalizers, as in Go. It is documented, and a candidate for a
  strict-mode warning.

## Alternatives considered

- **Block lifetime for `using` now:** correct and familiar, but needs a scoped lowering of nested
  blocks with the same control-flow limits as `try`. Deferred.
- **Function lifetime anywhere:** silently keeps resources alive across loop iterations.
