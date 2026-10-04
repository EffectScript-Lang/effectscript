# ADR-0007: Automatic prelude and bare Effect builtins

- **Status:** Accepted, import shape amended by ADR-0089
- **Date:** 2026-10-02
- **Deciders:** the user ("reserve as many keywords as we can", "`retry()` over `Effect.retry()`",
  "only import what is needed")
- **Related:** spec §4.5, §4.13; ADR-0009 (hygiene of generated references)

## Context

Imports and `Effect.` qualifiers are a large share of Effect's ceremony. The user wanted Effect
primitives to feel native, and files to import only what they use.

## Decision

- A *free* identifier that names an `effect` module export (or a subpath module export, from
  generated tables) is imported automatically. Only names that are actually used are imported.
- Every value export of `Effect` is a bare builtin (`retry`, `sleep`, `all`, …), emitted fully
  qualified (`Effect.retry`). The namespace follows the construct: `Layer` in layers, `Schema` in
  schema fields, and so on.
- Names that shadow JS, Web or Node globals are excluded (generated from TS libs and
  `@types/node`).
- Resolution is lexical: a local binding always wins.
- Opt-outs: the `// @efx no-prelude` directive and `prelude: false`.

## Consequences

- Most files need no imports.
- The one superset exception: a `.ts` file that relies on a *global* named like a prelude module
  changes meaning. This is documented.
- The prelude is a compatibility surface: new upstream exports can change how a free name
  resolves. Tables are regenerated and reviewed per Effect release (ADR-0015).

## Alternatives considered

- **Explicit imports only:** safe but verbose. It fails the main goal.
- **A global namespace object:** not idiomatic, and defeats tree-shaking.
