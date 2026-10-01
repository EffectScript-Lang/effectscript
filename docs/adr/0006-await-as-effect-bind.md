# ADR-0006: `await` binds effects, with guardrails

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** the user, after a multi-angle review of the options
- **Related:** spec §1 decisions table, §4.3, §4.17 (EFX8111), §7.3

## Context

Inside `effect` code we need a bind operator (`yield*`). The user worried that `await` changes
semantics (effects are lazy; Promises are eager and not cancellable). New words are unfamiliar,
and `yield*` is the verbosity we are removing.

## Decision

Inside `effect` code, `await e` means `yield* e`. Guardrails:

- **EFX8111:** an error when `await` is applied to a visible Promise (`fetch(…)`, `new Promise`,
  `.then`, a local `async` function). The hint suggests `await tryPromise(() => …)`.
- Editor styling and hover text that mark an effect `await` as different.
- Promise-await type errors are rewritten in plain English.
- The docs and the skill lead with an `async` ↔ `effect` table, including laziness.

## Consequences

- Code reads like familiar async TypeScript.
- Promise-versus-effect confusion is possible, and EFX8111 can only catch visible cases.
  Checker-backed detection is planned (ADR-0017).

## Alternatives considered

- **`yield*`:** the verbosity we exist to remove.
- **`run e` / `perform e`:** new words with no intuition behind them.
- **A postfix `.run`:** collides with real methods and reads poorly.
