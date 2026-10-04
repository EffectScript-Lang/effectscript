# ADR-0087: `is` tests a value's tag, and `is T` on its own is a predicate

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** the user, in conversation: they asked for a shorter and sturdier way to write
  `retry({ times: 2, while: (e) => e._tag === "TimeoutError" })`, chose the `is` operator with both
  forms from the proposed options, and approved the details below
- **Related:** spec §4.4, §4.11, §4.12, §6.2, §12; ADR-0009, ADR-0010, ADR-0017, ADR-0030,
  ADR-0050, ADR-0063, ADR-0077

## Context

The site's `errors` sample retries a timeout, then catches it:

```ts
try {
  return await fetchUser(id)
    |> timeout("2 seconds")
    |> retry({ times: 2, while: (e) => e._tag === "TimeoutError" })
} catch (e: Cause.TimeoutError) {
  return new User({ id, name: "guest" })
}
```

The `catch` names the error, and the compiler writes its tag (ADR-0010). The `retry` spells the tag
as a string, inside a function whose only job is to read `_tag`. Renaming the error doesn't touch
the string. The translated Effect docs (ADR-0050) contain 38 such comparisons: `if` tests,
ternaries, predicates passed to `filter`, and bodies of hand-written refinements.

`_tag` itself stays. Effect dispatches on it at runtime: `catchTag`, `catchTags`, `Match.tag`,
`Schema.TaggedError`, and the encoding of errors over RPC and HTTP. A brand can't replace it,
because a brand exists only in types (ADR-0077) and can't be tested at runtime. What `brand` does
well is take its key from its name, so the name is the only thing written. The same idea applies
here: the source names the error, and the compiler writes the tag.

Probes with `tsc` against this repository's `effect` (error channel
`UserNotFound | RateLimited | Cause.TimeoutError`) showed what each possible output gives:

- **`e._tag === "X"`:** a tag the subject can't have is TS2367 ("no overlap"), also inside a `||`
  chain. It narrows in `if`, in `Array.filter` (TypeScript's inferred type predicates), and in
  `retry({ while })` without `times`, where the tag leaves the error channel (`Retry.Return`'s
  refinement case). It is TS2339 when a union member has no `_tag` (such as `Error`), and TS18047
  when the subject may be `null`.
- **`Predicate.isTagged(e, "X")`:** safe on `null` and on untagged members, and it narrows, but a
  misspelled tag compiles and never matches.
- **`(e): e is T => Predicate.isTagged(e, "X")`:** checked (TS2677 when `T` isn't in the channel),
  and the type name survives in the output. It needs `T` to resolve as a type
  (`Cause.TimeoutError`, not `TimeoutError`) and fails for generic types written without
  arguments (`Option.Some`).
- **Data-last `Predicate.isTagged("X")`:** `retry` loses the error type.

Prior art:

- The TC39 pattern-matching proposal (Stage 1) defines `subject is pattern`, a boolean operator,
  with `and`, `or` and `not` combinators that need parentheses when mixed. EffectScript's `match`
  already follows its `when` arms (spec §4.11).
- Kotlin has `x is T` and `!is`, and `when (x) { is T -> … }` with the subject implied. C# has
  `x is T`, `is not` and `or`. Swift has `catch is T`, and Dart has `is` and `on T catch`.
- TypeScript declined a runtime `is` (microsoft/TypeScript#1289, #63532), because it doesn't emit
  code based on types.
- Retry libraries name the error types: tenacity's `retry_if_exception_type`, Polly's
  `Handle<T>()`, resilience4j's `retryExceptions`, Spring's `@Retryable(includes = …)`.

## Decision

### Forms

- **Test:** `subject is pattern` is a boolean. It binds like `instanceof`: `a && e is A` is
  `a && (e is A)`. `is` is on the same line as the end of the subject.
- **Predicate:** `is pattern` where an expression starts is a function that tests its argument:
  `retry({ times: 2, while: is TimeoutError })`, `errors.filter(is RateLimited)`. `is (` keeps its
  JavaScript meaning, a call to a function named `is`.
- **Patterns:**
  - a tag name: an identifier or a dotted name (`Cause.TimeoutError`), without type arguments;
  - several tag names joined by `or`: `e is TimeoutError or RateLimited`;
  - `not` in front of a pattern: `state is not Open`. With `or`, it needs parentheses:
    `is not (A or B)`.

  The pattern starts on the same line as `is`.
- `is`, `or` and `not` are keywords only in these positions. Everywhere else they are names.

### Tags

The tag of a name follows the `catch` rule (ADR-0010). A name bound to a local `error`, or to a
`schema` with a `_tag`, gives its declared tag. Any other name gives its last segment. The name
isn't emitted, so it doesn't have to resolve as a type: `is TimeoutError` works without `Cause.`,
as `catch (e: TimeoutError)` already does.

### Output

| EffectScript        | TypeScript                                    |
| ------------------- | --------------------------------------------- |
| `s is A`            | `s._tag === "A"`                              |
| `s is A or B`       | `s._tag === "A" \|\| s._tag === "B"`          |
| `s is not A`        | `s._tag !== "A"`                              |
| `s is not (A or B)` | `s._tag !== "A" && s._tag !== "B"`            |
| `is A`              | `(e) => e._tag === "A"`                       |
| `is A or B`         | `(e) => e._tag === "A" \|\| e._tag === "B"`   |

- The output is wrapped in parentheses only where its parent would otherwise bind differently:
  `a && s is A or B` → `a && (s._tag === "A" || s._tag === "B")`.
- The subject is wrapped in parentheses unless it is a name, a member access or a call:
  `await load() is A` in `effect` code → `(yield* load())._tag === "A"`.
- The predicate's parameter is always `e`. Its body reads nothing but its parameter, so the name
  can't capture or shadow anything, and no fresh name is needed (ADR-0009).

### Diagnostics

All are errors, in area 7 (proposals):

- **EFX7002:** the subject of `or`, or of `not (…)`, is read once per tag, so it must be a name,
  `this`, or a chain of property reads without calls. The hint: bind it to a `const` first.
- **EFX7003:** `not` combined with `or` without parentheses.
- **EFX7004:** a pattern that isn't a tag name, such as `x is 404`. The hint names the plain
  comparison (`x === 404`).
- **EFX7005:** a predicate as a whole statement (`is A;`). It does nothing, and it is what
  `const ok = error` followed by `is RateLimited` on the next line becomes after automatic
  semicolon insertion. The hint: keep `is` on the line of the value it tests.

### Superset

In valid TypeScript, an expression is never followed by the identifier `is` on the same line. An
expression may start with `is` followed on the same line by a name only when that name is `as`,
`satisfies` or `of` (`is as Guard`, `for (is of list)`), so those three keep their TypeScript
meaning and are never patterns. Every other form is in a position where TypeScript has no parse.
Type
predicates (`(x): x is T =>`, `asserts x is T`) are type positions and keep their meaning.
`Object.is`, `Schema.is`, `is(x)` and variables named `is` keep theirs.

### Reverse compiler

Each rewrite applies only where compiling its result reproduces the input (ADR-0030):

- `s._tag === "A"` → `s is A`, and `s._tag !== "A"` → `s is not A`.
- A `||` chain of `===` tests on the same subject → `s is A or B`. An `&&` chain of `!==` tests on
  the same subject → `s is not (A or B)`.
- `(e) => e._tag === "A"` (or a chain) → `is A`. With another parameter name it becomes
  `(err) => err is A`, because only `e` compiles back to the same text.
- A tag that isn't an identifier, a reversed comparison (`"A" === s._tag`), or a name bound to a
  local declaration with a different tag stays TypeScript.

### Tooling

The tree-sitter grammar and its queries (with the Zed and Helix copies) and the TextMate grammar
learn `is`, `or` and `not` in these positions. The Volar mapping links each tag name to the
content of its string literal, so TS2367 and hovers land on the name. The skill, the site's
`errors` sample and the docs use `is`.

## Consequences

- The sample becomes `retry({ times: 2, while: is TimeoutError })` followed by
  `catch (e: TimeoutError)`. The error is named the same way in both places, and neither `_tag`
  nor a tag string appears in the source.
- The output is the comparison people write by hand, so the checking is TypeScript's own: a tag
  the subject can't have fails the build, and narrowing works in `if`, `filter` and `retry`.
- Existing Effect code converts: the reverse compiler turns `x._tag === "X"` into `x is X`, and the
  docs corpus picks up the 38 comparisons when it is regenerated.
- **Failures are loud, not `false`.** A subject that may be `null`, or a union with an untagged
  member, is a type error. In TC39 and Kotlin, `null is T` is `false`. The alternative,
  `Predicate.isTagged`, would let a misspelled tag through silently.
- **It reads a name differently from TC39.** There, a class after `is` runs the class's custom
  matcher, a brand check. Here a name is a tag, as it already is in `match`. If TC39's `is`
  reaches Stage 3, the same text would mean different things in `.ts` and `.efx` files. Today `is`
  isn't valid TypeScript, and `match` made the same choice.
- **Renaming an error doesn't rename its `is` names,** as with `catch` today, since the name isn't
  emitted as a type. TS2367 then reports each stale name.
- `is`, `or` and `not` bring layout rules (the same-line rules, `is (` as a call) that the
  compiler, tree-sitter and TextMate must all follow. Each rule gets a parser test.
- **Cost if wrong:** if the loud failure on nullable subjects proves common, a later ADR can emit
  `s?._tag` for them, or `Predicate.isTagged` with a checker diagnostic for misspelled tags
  (ADR-0017).

## Alternatives considered

- **Identify errors by a brand or a type id instead of `_tag`:** brands are type-only, and leaving
  `_tag` leaves `catchTag`, `Match` and error encoding, which is to say idiomatic Effect.
- **Output `Predicate.isTagged(s, "A")`:** safe on `null` and untagged members, but a misspelled
  tag compiles and never matches.
- **Output an annotated refinement, `(e): e is T => …`:** checked, but the name must resolve as a
  type, generic types need arguments, and it departs from the `catch` rule.
- **A type as the predicate (`while: TimeoutError`):** that is valid TypeScript today, passing the
  class itself, so it would change the meaning of existing code.
- **`instanceof`:** tests the class, not the tag, so it fails for tagged values that aren't
  instances of that class, and giving it a new meaning breaks the superset.
- **The test form only (`(e) => e is TimeoutError`):** less new syntax, but it keeps the arrow in
  every predicate position. Kotlin's `when` arms show the implied-subject form reads naturally.
- **`|` instead of `or`:** in an expression, `|` is bitwise or. TC39 patterns use `or`. `catch
  (e: A | B)` keeps `|` because its parameter is a type position.
- **A `retry` clause on `catch`** (`catch (e: TimeoutError) retry 2 { … }`, after Ruby's
  `rescue … retry`): it would remove the repeated name in the sample, but it is a larger construct
  (schedules, several clauses with different counts). It can come later.
- **Errors that declare themselves retryable:** Effect v4's `SqlError` and `AiError` reasons have
  an `isRetryable` getter, Smithy has `@retryable`, and .NET has `DbException.IsTransient`. It is a
  separate decision: it doesn't cover `Cause.TimeoutError`, and Go deprecated `Temporary()`
  because "temporary" wasn't well defined.
- **Literal and object patterns now:** the tag form covers retries and the docs corpus. Literals,
  object patterns, bindings, `and` and guards can follow `match`'s grammar later.
