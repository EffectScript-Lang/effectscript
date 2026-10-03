# ADR-0063: `match` guards and object patterns

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** agent ruling for Plan 22 (phase 16), from the spec §14 roadmap
- **Related:** spec §4.11; ADR-0030 (reverse identity)

## Context

`match` (spec §4.11) had tag, literal and `default` arms. Two forms people reach for were missing:
a condition on a matched case (`when Circle(c) if c.radius > 10`), and matching an object by its
fields (`when { status: 404 }`), which Effect's `Match.when` supports natively.

A guard is hard to type in `Match`. A plain predicate leaves the case unhandled, which is right,
but types the handler as the whole input. A refinement to the case types the handler, but tells
`Match` the case is handled, so `Match.exhaustive` would accept a match that fails at runtime.
Probing Effect v4's types showed:

- a predicate typed by the case, `(c: Circle) => …`, is refused by `when`'s constraint;
- `Match.whenAnd({ _tag: "Circle" }, guard, handler)` types the handler `unknown`;
- a refinement to `Case & Brand` keeps the case in the remaining input (the case isn't
  assignable to the branded type, so nothing is excluded) and gives the handler `Case & Brand`,
  which reads as the case.

## Decision

- **Guards:** `when <pattern> if <expression>:`. The guard is a binary-level expression (a
  conditional needs parentheses) and may not `await`: it is a predicate.
- **Object patterns:** `{ key: value, name }`. Values are literals or nested object patterns; a
  shorthand field binds it; an identifier as a value is refused with a message, so `{ status: ok }`
  can't silently mean either a binding or a comparison.
- **Output:**
  - an object pattern → `Match.when({ … }, ({ bindings }) => …)`;
  - a guarded tag arm → `Match.when((c): c is Extract<typeof c, { readonly _tag: "Circle" }> &
    { readonly "~effectscript/guard": true } => c._tag === "Circle" && guard, (c) => …)`;
  - a guarded object arm → the same with `Match.Types.WhenMatch<typeof v, PatternType>`, the field
    comparisons before the guard (so a union narrows), and the guard's bindings read through an
    immediately invoked arrow on the checked value;
  - a guarded literal → `Match.when((v) => v === "x" && guard, () => …)`.
- **A guarded arm never makes a match exhaustive.**
- The reverse compiler recognizes each output by its exact shape (the brand marks a guard), and
  leaves hand-written predicates as TypeScript.
- A multi-line match ends with `Match.exhaustive` on its own line.

## Consequences

- Guards and object patterns work in tag, literal and object matches, typed, and the type checker
  still catches a non-exhaustive match.
- The output for a guarded arm is long, because the brand and the refinement are spelled out
  instead of coming from a helper: EffectScript has no runtime of its own.
- The guard of an object arm casts the checked value to Match's type for the pattern
  (`_ as Match.Types.WhenMatch<…>`), because comparing a nested optional field doesn't narrow
  its parent. The comparisons just made make that cast true.
- **Cost if wrong:** if Effect's `Match` changes how it excludes refinements, the brand trick
  could start removing cases, and a match could pass type checking and fail at runtime. The
  test "doesn't count a guarded arm as handling its case" catches that on upgrade.

## Alternatives considered

- **`Match.whenAnd(pattern, guard, handler)`:** short, but the handler loses the case's type,
  and the guard can't destructure a union's case.
- **A plain predicate and a cast in the handler:** the handler would need the case's type by name,
  which a tag pattern doesn't have when the union isn't a declared schema.
- **Merging every arm of a tag into one `Match.tag` with `if`/`else` inside:** idiomatic, but it
  copies a fallback arm's body into each merged handler, and the arms no longer map one to one to
  the source for the editor.
- **Identifiers as bindings in object patterns (`{ status: code }`), as in the TC39 proposal:**
  ambiguous with comparing to a constant, which reads the same; shorthand-only binding avoids the
  question.

## Amendment 1 (Plan 22 final review)

- **Tests before reads:** a guarded tag arm tests `Predicate.isTagged(c, "Circle")`, and a guarded
  object arm tests `Predicate.hasProperty(v, "key")` for each top-level field before comparing it.
  Reading `c._tag` or `v.status` directly failed to type-check on `Shape | null` or on a union
  whose members don't all have the field, and would throw on `null` at runtime; `Match.when`'s own
  object patterns already check this.
- **Bindings keep their mapping:** an object pattern's shorthand bindings stay the user's text in
  one parameter (the handler's, or the guard's for a guarded arm), so go-to-definition and rename
  start from the pattern.
- **Reserved words:** a reserved word can't be a shorthand binding (`when { default }`); match its
  value with `{ default: … }`.

