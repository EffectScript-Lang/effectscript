# ADR-0090: A Convex extension, sketched on Confect: tables, function specs and their impls

- **Status:** Proposed (the syntax waits for the user's review); the playground shows it as a
  proposal
- **Date:** 2026-10-05
- **Deciders:** the user, in conversation: "btw also we have alchemy etc. i want some sample in the
  playground for a possible confect.dev version too. for convex/effect". Agent proposal for the
  syntax.
- **Related:** ADR-0083 (extensions: this adds a candidate), ADR-0086 (the infra sketch, the same
  approach), ADR-0089 (imports name the module's file), ADR-0077 (`where`), ADR-0013 (optional fields), ADR-0088 (the playground's files),
  spec §4.14 (`rpc`/`impl`, which this mirrors)

## Context

[Confect](https://confect.dev) integrates Effect with Convex. A Confect app has three kinds of
file:

- **A table per file** (`confect/tables/notes.ts`), whose name is the table's:
  `export default Table.make(() => Schema.Struct({ … })).index("by_tag", ["tag"])`.
- **A spec per group** (`notes.spec.ts`), shared with clients:
  `GroupSpec.make().addFunction(FunctionSpec.publicQuery({ name, args, returns, error }))`, each
  part a schema or a callback returning one.
- **An impl beside each spec** (`notes.impl.ts`): a `FunctionImpl.make(databaseSchema, spec, name,
  handler)` per function, provided to `GroupImpl.make(databaseSchema, spec)` and checked complete
  by `GroupImpl.finalize`.

Confect's docs also recommend importing Effect from its submodules (`effect/Schema`), because a
Convex function's cold start evaluates the module graph its entry point reaches.

The spec and impl split is the one EffectScript already writes for RPC: `rpc` declares
signatures, and `impl` builds the handlers' layer. Confect is Effect v4, as EffectScript is.

## Decision (proposed)

### Switching it on

- **The header:** `// @efx convex`, as the infra sketch writes `// @efx infra cloudflare`
  (ADR-0086). How a project switches extensions on is still ADR-0083's open question.
- **The prelude:** Confect's generated names (`DatabaseReader`, `DatabaseWriter`, `Auth`,
  `Scheduler`, `Id`) come from `confect/_generated/`, by the relative path from the file.
- **Imports name each module's own file** (`effect/Schema`, `effect/Effect`), as ADR-0089 decides
  for all compiler output, and as Confect recommends for cold starts.

### `table`

- **Form:** `[export] table name { fields; index name(field, …) }`.
- **Fields:** the `schema` class form's rules (ADR-0013's optional fields, ADR-0077's `where`).
- **Output:** `export default Table.make(() => Schema.Struct({ … }))`, then one `.index(…)` per
  index line.
- **The name** must match the file's name, which is how Confect names a table. A mismatch is a
  diagnostic.

### Types for Convex

In schema positions, `Id<"notes">` is Confect's `Id("notes")` and `Doc<"notes">` is the table's
document schema, `notes.Doc` (imported from `_generated/tables/notes`).

### `functions`

- **Form:** `[export] functions name { … }`, with one signature per line, as in `rpc`:
  `query list(): Doc<"notes">[]`, `mutation create(text: string): Id<"notes">`, and `action`.
  `internal` before the kind makes it internal.
- **Signatures:** the parameters are the args' fields, the return type is `returns`, and `throws`
  is `error`, a union when there are several.
- **Output:** `export default GroupSpec.make().addFunction(FunctionSpec.publicQuery({ … }))…`, with
  each schema behind the callback Confect expects.
- **The name** must match the file (`notes.spec.efx`), which is how Confect names a group.
- **Return types:** a function that returns nothing returns `null`, as Confect requires; `void` is
  a diagnostic.

### `impl`

- **The core's `impl`, with its meaning:** it builds the handlers of a declared group as a layer.
  `impl notes { return { … } }` in `notes.impl.efx` implements the sibling spec. It lowers to a
  `FunctionImpl.make` per handler, provided to `GroupImpl.make(…)` and closed by
  `GroupImpl.finalize`.
- **Spans:** each handler is an `effect` method, and its span is named `notes.list`, as `impl`
  names its handlers' spans.

### Keywords

`table`, `index` (in a table body), `functions`, `query`, `mutation`, `action` and `internal` (in
a `functions` body). `impl`, `throws` and `where` keep their core meaning.

## Consequences

- **Size:** a Confect group's three files become declarations. The table is a schema with index
  lines, the spec is four signature lines, and the impl is its handlers with no `FunctionImpl`,
  `GroupImpl` or layer plumbing.
- **Typed errors end to end:** `throws NoteNotFound` on a signature is the spec's `error`, which
  Confect decodes at every call site.
- **The client needs nothing new:** a React component using `@confect/react` is plain TSX, so it
  is EffectScript already. The playground's `src/App.efx` compiles today.
- **Confect's codegen reads `*.spec.ts` and `*.impl.ts`:** with `.efx` sources, either the build
  writes those files, or Confect's CLI learns to compile `.efx`. That integration is the open
  question to settle before building this.
- **Unverified against Confect:** the lowering follows Confect's docs and quickstart, but nothing
  has run against it.
- **Not on the landing page:** the landing page lists the three extension candidates of ADR-0083.
  Adding Convex there is a later decision.

## Alternatives considered

- **Write it in today's EffectScript:** works, but it shows the ceremony an extension would
  remove: `FunctionSpec.publicQuery({ name, args: () => …, returns: () => … })`, and
  `FunctionImpl.make(databaseSchema, spec, name, …)` per function.
- **Reuse `rpc` for the spec:** `rpc` means `effect/rpc`, and a Convex function also has a kind
  (`query`, `mutation`, `action`) that changes what it may do. A separate word keeps the two from
  overlapping (ADR-0083).
- **`spec notes { … }`, Confect's own word:** close to Confect, but "spec" reads as a test file in
  most of the ecosystem. `functions` says what the block contains, in Convex's own terms.
- **Spec and impl in one file:** shorter to read, but Confect shares the spec with clients without
  server code, so the two stay apart, as Confect's own file conventions keep them.
- **Table names in PascalCase, like other EffectScript declarations:** Convex table names are the
  identifiers code queries by (`reader.table("notes")`), so the declaration keeps Convex's name.
