# ADR-0012: Pipelines evaluate the head first

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** agent ruling on review R04 (reproduced at `9a84acc32`)
- **Related:** review R04; spec §4.9; ADR-0009 (fresh temporaries)

## Context

`makeValue() |> obj.method(%)` compiled to `obj.method(makeValue())`, so a getter on
`obj.method` ran before the head. The TC39 topic proposal evaluates the head first. F#-style
grouping into `pipe(head, s1, s2)` evaluates every stage expression before applying any of them.

## Decision

- **Hack style (`%`):** the head is always evaluated first.
  - A step is inlined into the head only when nothing observable is evaluated before the topic
    in the right-hand side: only literals, identifiers, and member reads on an imported module
    namespace (`Effect.map`, `Option.some`). The topic must also occur exactly once and be
    evaluated unconditionally.
  - Any other step becomes a function stage `($) => rhs` in `pipe(…)`, which evaluates the head
    first.
- **F# style (no `%`):** `a |> f |> g` → `pipe(a, f, g)` or `a.pipe(f, g)`. It has the evaluation
  order of Effect's `pipe`: head, then every stage expression, then each application in order. That
  is exactly what an Effect user writes by hand. Stage expressions are almost always pure combinator
  constructions (`retry({ times: 3 })`). This order is documented as different from a strictly
  sequential reading.
- **`.pipe` only with evidence:** `.pipe(…)` is used only for heads known to be pipeable (an
  `effect` block, or a call to a module-level `effect` declaration without declaration pipes);
  `pipe(…)` otherwise.
- **Temporaries:** topic parameters use names that occur nowhere in the file (ADR-0009).
- A Hack step that must become a function cannot contain an effect `await` (it would put a
  `yield*` inside an arrow). That is error **EFX5002**: "assign the awaited value to a variable
  first".

## Consequences

- Getters, proxies and side-effecting heads keep source order.
- Fewer steps are inlined. Calls on local objects (`obj.m(%)`) become function stages, which
  read a little less directly.
- EffectScript's F# order differs from a sequential interpretation. If that ever matters, a new
  ADR can change the lowering to nested calls.

## Alternatives considered

- **Sequential F# (`g(f(a))` as nested calls):** matches a "left to right" reading, but isn't
  idiomatic Effect and doesn't round-trip with `pipe(…)`.
- **Always use function stages for Hack:** correct, but noisy for the common `Effect.map(%, f)`
  case.
