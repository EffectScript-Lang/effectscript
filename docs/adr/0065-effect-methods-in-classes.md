# ADR-0065: `effect` methods in classes are prototype methods returning `Effect.gen`

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** agent ruling for Plan 22 (phase 16), from the spec §14 roadmap
- **Related:** spec §4.1; ADR-0063

## Context

`effect` functions, arrows, blocks and object methods all compile to Effect (spec §4.1), but an
`effect` method in a `class` or `schema` body was error EFX2002 ("not supported yet"). Schema
classes are where data lives, and methods on them that need Effect (a lookup, a log, a typed
failure) had to be written as TypeScript or as free functions.

An `effect` declaration compiles to `Effect.fn("name")(function*…)`, which gives a span and a
call-site trace. For a class, that would be an instance field:
`greet = Effect.fn("User.greet")(function*(this: User) …)`. An instance field puts a function on
every instance: two equal `User`s would no longer be `Equal`, and the field would sit beside the
schema's own data.

## Decision

- `effect m(…): A throws E needs R { … }` in a `class`, `schema` or `error` body compiles to a
  **prototype method**: `m(…): Effect.Effect<A, E, R> { return Effect.gen({ self: this },
  function*() { … }).pipe(Effect.withSpan("Class.m")) }`.
- `{ self: this }` is passed only when the body uses `this`, as for `effect` blocks.
- A one-line body stays on one line. A multi-line body keeps its lines, one indentation step
  deeper (the method's own indentation decides tabs or spaces); lines inside template literals
  and strings are left as they are.
- The span is named `Class.method`. A computed method name gets no span.
- A method without a body (in a `declare class` or an overload) is EFX2002.
- The reverse compiler recognizes the method by its exact shape, including the span naming its own
  class.

## Consequences

- Schema instances stay plain data: `Equal.equals` compares their fields only.
- The method is a span but not an `Effect.fn`, so it has no call-site stack frame of its own; the
  span and the stack inside it are the same as for an `effect` block.
- **Cost if wrong:** if `Effect.fn` gains a prototype-friendly form, the output could move to it
  with a superseding ADR and a reverse compiler that reads both.

## Alternatives considered

- **An `Effect.fn` instance field:** a function on every instance, which breaks structural
  equality for schema classes and differs from how people write class methods.
- **A static `Effect.fn` plus a forwarding method:** two declarations for one method, and the
  output no longer reads as the source.
- **Keeping EFX2002:** the roadmap item exists because people reach for methods on their data.

## Amendment 1 (Plan 22 final review)

- `super` and `arguments` in an `effect` method body (arrows included, nested functions not) are
  error EFX2009: the body runs in a generator function, where `super` doesn't parse and
  `arguments` is the generator's.
- A one-line method with `defer` closes `Effect.gen(…)` before `.pipe(Effect.scoped)`.
