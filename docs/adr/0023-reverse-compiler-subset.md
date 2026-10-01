# ADR-0023: Ship the reverse compiler for the adoption-slice subset first

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** agent ruling for Plan 3, from review R07 and R08
- **Related:** review R07, R08; spec §6; ADR-0009

## Context

"You can always leave" and "you can convert in" are core promises. The full reverse compiler
(§6) is a large plan, but the adoption slice needs a working round trip for the constructs it
uses.

## Decision

`toEffectScript(source)` ships first for these shapes:

- `const f = Effect.fn("f")(function*(…) {…}[, pipeables])` → `effect f(…) {…} [|> …]`, including
  `export`. In those bodies, `yield* e` becomes `await e`, and `return yield* Effect.fail(e)` /
  `return yield* new E(…)` (a local error class) becomes `throw …`.
- `: Effect.fn.Return<A, E, R>` → `: A throws E needs R`.
- `class X extends Schema.TaggedError<X>()("X", { … }) {}` → `error X { … }`.
- `class X extends Schema.Class<X>("X")({ … }) {}` → `schema X { … }`. Fields map back through the
  §4.6 table; a field whose schema isn't in the table stays an `= <schema>` field.
- Unused `effect` imports are removed after re-sugaring.

Recognition follows binding origin: `Effect`/`Schema` must be imported from `effect`, under any
local name. A user object called `Effect` is never re-sugared. Every other node stays TypeScript,
which is valid EffectScript. `explain` notes list why a near-match was left alone.

The contract is §6.4's canonicalization: `toEffectScript(toTypeScript(x))` equals `x` up to the
listed normalizations, and canonical outputs are fixed points.

## Consequences

- The slice's "leave and come back" claim is testable now. Other shapes (`try`, `match`,
  `service`, pipelines) are added in the full reverse-compiler plan.

## Alternatives considered

- **Wait for the full reverse compiler:** the adoption slice couldn't prove the exit path.
