# ADR-0099: `schema { … }` is a struct schema written as its type

- **Status:** Accepted
- **Date:** 2026-10-06
- **Deciders:** the user (asked for inline struct literals: "`Struct` or `struct`, if it makes
  sense"); agent ruling on the form
- **Related:** ADR-0013 (optional fields), ADR-0077, ADR-0092 (rubric), ADR-0094 (corpus)

## Context

EffectScript's `schema` declarations turn TypeScript types into schemas, but only where a schema
is declared: `schema User { … }`, `schema Point = { … }`. Real Effect code also uses schemas as
values, inline, where nothing is declared. In the converted real-projects corpus (ADR-0094),
3,439 `Schema.Struct(` calls and 3,913 `Schema.optional(` calls are still written out, mostly as a
tool's `parameters`, an RPC's `success` or `payload`, an `input`/`output`, an argument to a decoder,
and constants without a type alias. Each field pays for `Schema.` twice over:
`Schema.Struct({ query: Schema.String, limit: Schema.optional(Schema.Number) })`.

## Decision

- **Form:** `schema` followed on the same line by a type literal is an expression:
  `parameters: schema { query: string; limit?: number }`. It lowers by the same type-to-schema table
  as the declarations (spec §4.6), to `Schema.Struct({ query: Schema.String, limit:
  Schema.optionalKey(Schema.Number) })`, keeping comments between members.
- **No new meaning for TypeScript:** an identifier followed by `{` on the same line is a syntax
  error in TypeScript, so `schema` used as a name (`const schema = …`, `schema.parse(x)`,
  `{ schema }`) reads as before.
- **One form:** the reverse compiler writes every inline `Schema.Struct({ … })` whose fields have a
  type spelling as `schema { … }`. One with comments inside stays TypeScript, since the type
  spelling would drop them.

## Consequences

- Docs corpus: 102 more examples re-sugar (1,957 → 2,059); the saving moves from 15.0% to 15.1%,
  and every vocabulary of the panel improves (qwen3 14.8% → 14.9%, deepseek-v3 15.1% → 15.3%,
  glm-4.6 15.0% → 15.1%).
- Real projects: 13,032 Effect files convert (from 12,823); the saving moves from 3.2% to 3.3%.
- The site's gallery doesn't change: none of its scenarios writes a schema inline.
- Tree-sitter gains a `schema_expression` node and VS Code highlights its keyword.

## Alternatives considered

- **`struct { … }`:** a new word for what Effect calls a `Struct`, beside the `schema` keyword that
  already means "this type is a schema" (rule 5, rule 3).
- **A bare `Struct({ … })` in the prelude:** saves `Schema.` once, while every field keeps its
  `Schema.String`. `Struct` is also a module of its own in Effect (`Struct.pick`), so the bare
  name would clash.
- **Any type after `schema` (`schema string[]`, `schema "a" | "b"`):** `schema (`, `schema [` and
  `schema <` already parse as a call, an index or a comparison, so only some types could follow.
  The object literal is the common case and the unambiguous one.
