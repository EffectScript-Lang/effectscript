# ADR-0069: `rpc` groups, signature lines, and a generic `impl Name`

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** agent ruling for Plan 23 (phase 17), from the spec §14 roadmap
- **Related:** spec §4.14 (`group`/`api`/`impl`); ADR-0070, ADR-0071, ADR-0072

## Context

`effect/rpc` declares procedures with `Rpc.make(tag, { payload, success, error, stream })`,
collects them with `RpcGroup.make`, and implements them with `group.toLayer(handlers)`, where
`group.of` types the handler object. `effect/ai` toolkits and `effect/cluster` entities follow the
same pattern (`toLayer` and `of`). EffectScript already writes HttpApi groups as a block of lines
and implements them with `impl Api.group { … }`.

## Decision

- **`rpc Name { lines }`**, where each line is a signature: `name(field: T, other?: U): A throws E`.
  The fields are the payload's struct fields, so call sites read `client.name({ field })`.
  - No fields → no `payload`; no return type → `success` is left out (`void`).
  - `throws A | B` → `error: Schema.Union([A, B])`: `Rpc.make` takes one error schema.
  - A return type `Stream<A>` or `Stream<A, E>` → `success: A`, `stream: true`; the handler
    returns a `Stream`.
  - The tag is the line's name, as written.
- **Output:** `const Name = RpcGroup.make(\n  Rpc.make(…),\n  …\n)`, one line per procedure.
- **`impl Name { … }`** (one identifier) → `Name.toLayer(Effect.gen(function*() { … }))`, with every
  top-level `return { … }` wrapped in `Name.of(…)`. It isn't specific to RPC: any value with
  `toLayer` and `of` works. `effect` methods are spanned `Name.method`, the layer owns the scope,
  and `|>` pipes apply to the layer. `impl Api.group { … }` keeps its HttpApi meaning.
- `rpc` and `impl` are contextual: `const rpc = …` and `rpc.call()` stay TypeScript.
- The reverse compiler gives `rpc Name { … }` back from the canonical
  `const Name = RpcGroup.make(Rpc.make(…), …)` shape, and `impl Name` from the exact `toLayer`/`of`
  shape. RPC recognition requires `Rpc` and `RpcGroup` to resolve to value imports from
  `effect/rpc`; every member must be a `Rpc.make` with a canonical string tag, and options must use
  the forward order (`payload`, `success`, `error`, `stream`). Payload fields and schemas must have
  reverse type mappings. Unsupported options, unmappable schemas, and comments inside the group
  leave the declaration as TypeScript. A stream's error schema is written after `throws`, so
  `Stream<A, E>` canonicalizes to `Stream<A> throws E`.

## Consequences

- RPC procedures read like method signatures, with typed failures and streams, and their
  implementation reads like a service layer.
- Options EffectScript doesn't write (`defect`, `primaryKey`, middleware, class-form RPCs) stay
  TypeScript; a group using them stays TypeScript in the reverse compiler.
- **Cost if wrong:** a later need for per-procedure options would add syntax to the signature line
  (or an annotation), superseding this ADR.

## Alternatives considered

- **A schema as the payload (`getUser(payload: GetUserRequest)`):** the call site would become
  `client.getUser(new GetUserRequest({ … }))`; struct fields are what `Rpc.make` and its examples
  use. A schema payload stays TypeScript.
- **PascalCase tags derived from the name:** the line's own name is what the client calls.
- **A separate `impl` keyword per module (`handlers`, `implement`):** one `impl` reads the same for
  HttpApi groups, RPC groups, toolkits and entities.

## Amendment 1 (Plan 23 final review)

- `impl` followed by `as`, `satisfies`, `in`, `instanceof` or `of` is a variable named `impl`, not a
  construct.
- A streaming line's own error (`Stream<A, E>`) and its `throws F` are both its error:
  `Schema.Union([E, F])`.
- **Known gaps**, for `rpc`, `entity`, `tool`, `toolkit` and `workflow` signatures, as for HttpApi
  `group`: the declaration is regenerated whole, so comments inside it don't reach the compiled
  TypeScript, and the names and types in it have no editor navigation (go-to-definition, rename)
  in `.efx` files. Bodies (`impl`, workflow and activity bodies, the workflow key) keep both. The
  fix is to emit names, fields and types around the user's text instead of replacing the
  declaration; it is left for a later plan.
