# ADR-0053: EFX8112 warns when `await` gets an array built at runtime

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** agent ruling after the Plan 14 final review
- **Related:** spec §4.3, §4.17; ADR-0006, ADR-0028

## Context

`await [a, b]` compiles to `Effect.all([a, b], { concurrency: "unbounded" })`, but only for an
array *literal* (§4.3). `await xs.map(load)` compiles to `yield* xs.map(load)`. `yield*` iterates
the array, so the effects run one at a time, and the expression's value is the array iterator's
return value: `undefined`.

There's no type error unless a return type is written out. The Plan 14 review found the skill
itself recommending "`await` the array of effects".

## Decision

- **EFX8112** is a warning. Strict mode makes it an error. It fires inside `effect` code on
  `await` of `xs.map(…)`, `xs.flatMap(…)`, `xs.filter(…)` or `Array.from(…)`. The hint says to
  use `await all(xs)` or `await forEach(items, f)`, and that only an array literal runs as
  `all`.
- The skill teaches the rule, and `pitfalls.md` shows EFX8112 on the wrong form.

## Consequences

- The common mistake is caught where it is written.
- It's syntactic (ADR-0017): an array held in a variable (`await effects`) isn't caught. A
  checker-backed rule ("`await` on an `Array<Effect>`") could cover that later.
- A user type with its own `.map` that returns an effect gets a warning it doesn't deserve. That
  is why this is a warning, not an error.

## Alternatives considered

- **Compile `await <array expression>` to `Effect.all`:** that changes the meaning of valid
  TypeScript-shaped code depending on a runtime type the compiler can't see.
- **An error:** false positives on custom `.map` methods would block valid code.
