# ADR-0009: Generated references are hygienic

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** agent ruling on review finding R01 (reproduced at `9a84acc32`)
- **Related:** review R01, D02; ADR-0007; spec §4.13

## Context

The compiler emits references such as `Effect.fn`, `Schema.Struct`, `Context.Service`, `pipe`, or
`NodeRuntime`. Until now it emitted those names literally and skipped the import when the module
already bound that name. Both cases below compiled with no diagnostics and silently called the
user's object:

```ts
const Effect = { fn: () => () => "wrong" }
export effect f() { return 1 }        // → Effect.fn("f")(…) calls the user's object
export effect g(Effect: unknown) {     // → the inner Effect.gen resolves to the parameter
  return effect { return 1 }
}
```

Pipeline temporaries (`$`, `$$`, `$$$`, then an unchecked `$topic`) could also capture or be
captured by names used in the right-hand side.

## Decision

- **Compiler-owned references** are requested through one function, `ref(module, export)`. It
  returns the local name to emit, decided once per file:
  1. If the file imports that export from that module (a value or type-only named specifier,
     possibly aliased, e.g. `import { Effect as E } from "effect"`), and the local name is bound
     nowhere else in the file, reuse it. A type-only import is upgraded to a value import.
  2. Otherwise, if the export's name is bound nowhere in the file (in either the value or the type
     namespace), import it under its own name.
  3. Otherwise, import it under a fresh alias (`Effect$`, `Effect$2`, …), for example
     `import { Effect as Effect$ } from "effect"`, and use the alias everywhere in the file.
- **Prelude references written by the user** (a free `Schema`, `retry`, …) resolve as before. They
  are free at their site, so importing under the real name is correct. A builtin's generated
  qualifier (`retry` → `Effect.retry`) is compiler-owned and goes through `ref`.
- **Temporaries** (pipeline topics, handler parameters, catch causes) use a fresh name that doesn't
  occur as any identifier anywhere in the file.
- "Fresh" means checked against every identifier in the file, bound or free. This is simpler and
  stronger than per-site scope checks.

## Consequences

- No user binding can capture a compiler reference, and no compiler binding can capture a user
  reference.
- Ordinary files keep the plain spelling (`Effect.fn`). Only files that bind `Effect` themselves
  get `Effect$`, which looks odd but is correct and rare.
- A file may import the same export twice (`{ Schema, Schema as Schema$ }`) when user code uses
  the free name at module level and an inner scope shadows it. That is valid TS.
- The reverse compiler must recognize Effect APIs by binding origin (the import), never by
  spelling (to be built in a later plan).

## Alternatives considered

- **Per-site decisions** (plain name where unshadowed, alias elsewhere): more readable in rare
  cases, but mixes two spellings in one file and is harder to reason about.
- **Always alias (`Effect$`):** unreadable and non-idiomatic output for every file.
- **Diagnose shadowing instead of aliasing:** turns valid TypeScript into an error, breaking the
  superset guarantee (ADR-0002).
