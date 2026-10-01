# ADR-0017: Syntactic diagnostics in the compiler, typed ones in the checker

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** agent ruling on review R13
- **Related:** review R13; spec §4.17, §5.1, §12; ADR-0006

## Context

The compiler is purely syntactic (ADR-0004). Rules such as "floating effect" or "`await` on a
Promise" can't be decided reliably without types: `Effect.isEffect(x)` is pure, and an imported
function may return an Effect. `CompileResult` also documented "diagnostics empty when
successful", which conflicts with warnings on successful compiles.

## Decision

- **The compiler reports syntactic diagnostics.** Rules that guess at meaning without types are
  labeled heuristic in their message. They must avoid known false positives: pure Effect
  predicates and constructors don't count as floating effects.
- **Type-backed rules live in the checker** (the language service and `efx check`): floating
  effects from imported functions, Promise-versus-Effect `await`, and leaking requirements.
- **Success is decided by severity.** A compile fails only when a diagnostic has severity
  `error`. Warnings never abort output unless `strict: true` promotes them. The `CompileResult`
  doc comment is fixed accordingly.
- **Diagnostic areas** gain 8 = strict rules (`EFX8xxx`). Area 1 also covers internal errors
  (`EFX1000`) and configuration (`EFX1003`).
- One configuration contract (strictness, ambient capture, observability, runtime, target Effect
  version, prelude) is defined in a single module before the strict-mode plan. Each option states
  whether it is browser-safe or project-only.

## Consequences

- No false confidence: compiler rules never claim to prove capability safety.
- Some rules show up only in editors and in `efx check`, not in a bare `toTypeScript` call.

## Alternatives considered

- **Use the TypeScript checker inside the compiler:** breaks browser-safety and per-keystroke
  speed.
- **Syntactic rules only:** misses most real floating effects, which come from imported functions.
