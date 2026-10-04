# ADR-0077: `brand` takes its key from its name, and `where` adds checks

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** the user, in conversation: they asked for brands without the repeated name, then
  chose the `brand` declaration and `where` on every field from the proposed options
- **Related:** spec §4.6, §4.7, §4.14, §4.19, §6.2, §6.4; proofs spec §4.1; ADR-0009, ADR-0013,
  ADR-0014, ADR-0030, ADR-0063, ADR-0076

## Context

A branded type was written `schema UserId = string & Brand<"UserId">`, with the key repeating the
declared name. Every `Brand<…>` in the repository's `.efx` files, and every `Schema.brand(…)` in
upstream's `ai-docs`, uses the declaration's own name. Other declarations already take their
string identifiers from their names: `schema User` gives `Schema.Class<User>("User")`, `error` its
tag, `service` its key, and an `effect` method its span. The brand key was the one place a name was
still written twice.

A brand usually needs checks: an email matches a pattern, a port is between 1 and 65535, an amount
isn't negative. EffectScript couldn't write that. The alias form takes a type, and checks existed
only as an `=` field of the class form (`age = Int.check(isGreaterThan(0))`). Struct aliases and
ADT variants couldn't have checks at all, since ADT variants refuse `=` fields (EFX3003). Such code
stayed TypeScript, and the reverse compiler left it that way.

The decision relies on these Effect v4 behaviors, each checked with a probe against this
repository's `effect`:

- `Schema.brand` changes only the type. `make` on a branded schema runs the schema's checks: with a
  non-negative check, `Money.make(-5)` throws.
- Checks reach the JSON Schema: `isNonEmpty()` gives `minLength: 1`, and
  `isBetween({ minimum: 1, maximum: 50 })` gives `minimum` and `maximum`. That is how a tool's
  parameters reach the model.
- `Arbitrary.schema` generates only values that pass the checks: 1,000 samples each of a checked
  `Money` and `Port`, none invalid.
- TypeScript reduces `(T | null) & Brand<"X">` to `T & Brand<"X">`, while the schema still decodes
  `null`.

## Decision

### `brand`

- **Form:** `[export] brand Name = Type [where …]`, in statement position. `brand` is a keyword only
  when an identifier and `=` follow it on the same line; everywhere else it is a name.
- **Output:** `const Name = <schema of Type>[.check(…)].pipe(Schema.brand("Name"))` and
  `type Name = typeof Name.Type`, the same pair as the alias form. Checks come before the brand.
- **Key:** the declared name, unqualified.
- **Type:** anything a schema position accepts: a primitive, a vocabulary schema such as `Int`, a
  literal union, a struct, or a reference to another schema. A brand of a brand
  (`brand AdminId = UserId`) carries both brands.
- **No `null` or `undefined`** in the type (**EFX3006**): brand the value, and write `Name | null`
  where it's used.
- **No type parameters** (EFX3002, as for `schema`).
- **`T & Brand<"X">` stays valid** in every schema position, for a key that isn't the declaration's
  name or for a second brand.

### `where`

- **Form:** a declaration's type (`brand`, the `schema` alias form) or a schema field's type may end
  with `where` and a comma-separated list of check expressions. Schema builtins are bare in the
  list, as in `=` fields. The list compiles to one `.check(c1, c2)` on the type's schema.
- **Schema fields** are those of `schema` and `error` bodies, ADT variants, members of a type
  literal in a schema position (the alias form, nested objects, `group` endpoint sections), and the
  parameters of `rpc`, `tool`, `entity` and `workflow` signature lines.
- **`null` and `undefined` stay outside the checks.** The checks apply to the type without its
  top-level `null` and `undefined` members, and those members wrap the checked schema
  (`Schema.NullOr`, `UndefinedOr`, `NullishOr`). An optional field's `optionalKey` or `optional`
  (ADR-0013) wraps it too. A check on the whole union is written as an `=` field.
- **Not allowed** (**EFX3005**) on a nested type (an array element, a union member, a type
  argument), on `config` fields (they compile to `Config`, and their `=` is a default), or on
  `command` parameters. The hint names the alternative: an `=` field, or a `brand` or alias used as
  the field's type.
- **Layout:**
  - `where` is on the same line as the end of the type, so a member named `where` on the next line
    keeps its meaning.
  - The list may continue onto the next line after `where` or after a comma.
  - The list ends at `;`, a closing bracket, a line break that doesn't follow a comma, or a comma
    followed by the next member or parameter: a name (an identifier or a string, optionally after
    `readonly`) followed by `:` or `?:`. No check expression starts that way.
- **`=` fields** keep taking any schema expression.

### Reverse compiler

- `const X = S.pipe(Schema.brand("X"))` plus `type X = typeof X.Type` becomes `brand X = <type>`.
  With `S.check(…)` before the brand, it becomes `brand X = <type> where …`. A key other than the
  name stays `schema X = T & Brand<"K">`.
- A field whose schema is `S.check(…)`, alone or inside `optionalKey`, `optional`, `NullOr`,
  `UndefinedOr` or `NullishOr`, becomes a `where` field. That is the canonical form of a checked
  field: the reverse compiler no longer writes `age = Int.check(…)`.
- Only the shapes the forward compiler emits convert (ADR-0030): one `.check(…)` directly on a
  schema that has a type form. `S.check(a).check(b)` and `S.pipe(Schema.check(a))` stay `=` fields,
  or TypeScript where `=` fields aren't allowed. A brand on a type that includes `null` stays
  TypeScript.

### Tooling

The tree-sitter grammar and its queries (with the Zed and Helix copies), the TextMate grammar, and
`efx docs` (a `brand` kind) learn both keywords. The skill, the site and the docs teach `brand` and
`where`.

## Consequences

- A branded type is one line with no repeated name: `brand UserId = string`.
- Checked types and fields are EffectScript wherever a field can be written. The checks run when
  decoding and in `make`, appear in JSON Schema (HttpApi, a tool's parameters), and constrain
  generated values, so a `law` over a checked `Money` only sees valid amounts, with no `requires`.
- Struct aliases, ADT variants and signatures with checked fields now convert from TypeScript.
- There are two new contextual keywords, and `where` brings layout rules (the same-line rule, the
  comma rule) that the compiler, tree-sitter and TextMate must all follow. Each rule gets a parser
  test.
- Two spellings compile to the same output: `brand X = T` and `schema X = T & Brand<"X">`, and
  `x: T where c` and `x = T.check(c)`. The reverse compiler writes the first of each, so converted
  code is uniform. Nothing has been published, so the old spellings get no warning and no
  deprecation.
- An unqualified key makes two same-named brands in different modules interchangeable, as they are
  in hand-written Effect. The explicit form gives a distinct key when that matters. If that need
  turns out to be common, a later ADR can add a key override like `service … as "key"`.
- In the Bend model (ADR-0076), a `brand` is erased like `T & Brand<"X">`, and `where` checks map as
  `.check(…)` does.
- Plans 24–27 and their running example, `examples/src/bank.efx`, keep
  `schema Money = Int & Brand<"Money">`. Their laws rely on `Money` admitting negative values, and
  the long form compiles whether those plans land before or after this change.
- **Cost if wrong:** `T | null where c` checks `T`, not the union, which is the one place `where`
  doesn't read literally. If that misleads people, a later ADR can require the union to be written
  as an `=` field instead.

## Alternatives considered

- **`schema UserId = brand string`:** keeps one keyword for data types, but `brand` would work only
  at the top of an alias, since a field has no type name to take a key from. It is a declaration
  modifier that looks like a type operator, and it's longer.
- **`schema UserId = string & Brand`** (a bare `Brand`, keyed by the name): the smallest parser
  change, but it keeps the `& Brand` encoding and leaves no place for checks.
- **`schema UserId = Brand<string>`:** reads well, but in Effect the argument of `Brand<…>` is the
  key, so the same spelling would mean two things.
- **`newtype` or `opaque`:** `opaque` is wrong for brands, which still pass as their base type.
  `newtype` is Haskell's word; `brand` is Effect's (`Schema.brand`, `Brand`), so its users and
  models already know it.
- **Brand every primitive alias implicitly:** that changes the meaning of aliases written for
  documentation or for literal unions.
- **A module-qualified key, like service keys (ADR-0014):** a brand key exists only in types, where
  it appears in every hover and error. It would change when a file moves, and it would differ from
  what Effect code writes by hand. Service keys are qualified because they are looked up at
  runtime.
- **`if` instead of `where`:** `if` takes a boolean guard in `match` (ADR-0063); a check is a Schema
  check value, not a boolean.
- **Joining checks with `&&` or `and`:** `&&` would give a JavaScript operator a new meaning, and
  `and` would be one more keyword. The comma mirrors `.check(a, b)`.
- **Checks on the whole nullable union:** almost every check (`isMaxLength`, `isPattern`,
  `isBetween`) refuses `null`, so `T | null where c` would rarely type-check.
- **`where` on nested types:** it needs precedence rules (`string where c | null`), and an `=` field
  covers the case.
- **`where` on `config` fields:** they compile to `Config`, not Schema, and their `=` is a default.
  A `brand` or alias used as the field's type (`Config.schema`) covers the case; mapping `where`
  there can come later.
- **Predicate functions in `where`** (`where (s) => …` as `Schema.makeFilter`): not now.
  `where makeFilter((s) => …)` is explicit and works.
- **A warning on the long forms:** nothing has been published, the explicit brand form is still
  needed for other keys, and the reverse compiler already writes the short forms.
