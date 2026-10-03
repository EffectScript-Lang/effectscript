# ADR-0064: An error declares its HTTP status in its header

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** agent ruling for Plan 22 (phase 16); the need came from Plan 21's site review
- **Related:** spec §4.7, §4.14 (`group`/`api`); ADR-0063

## Context

An `HttpApi` endpoint answers a failure with the status its error schema is annotated with
(`httpApiStatus`), and with 500 when there is none. EffectScript's `error` declaration had no way
to write the annotation, so the site's `http` sample answered a missing todo with 500 where its
plain TypeScript version answered 404. Writing `Schema.TaggedError` by hand to add the
annotation gave up the declaration.

## Decision

- **`error Name status <code> { … }`**: the status sits in the header, between the name and the
  body. It compiles to the third argument of `Schema.TaggedError`: `{ httpApiStatus: <code> }`.
- The code is an integer literal from 100 to 599; anything else is refused with a message.
- `status` is a keyword only in that position; everywhere else it is a name.
- The reverse compiler gives the header back when `{ httpApiStatus: <code> }` is the class's only
  annotation, and leaves other annotations as TypeScript.
- Tree-sitter parses the header and highlights `status` as a keyword there.

## Consequences

- An `HttpApi` built from EffectScript answers each declared error with its status, and the
  site's `http` sample now behaves like its plain version.
- The status belongs to the error, not to an endpoint: one error answers the same status
  everywhere. Effect allows a status per endpoint (`HttpApiSchema.status`); that stays
  TypeScript.
- **Cost if wrong:** a header keyword is harder to extend than an annotation list; if more
  annotations are wanted, a general form would supersede this one.

## Alternatives considered

- **A `status: 404` member in the body:** reads like a field, and an error may well have a field
  named `status`.
- **A decorator, `@status(404) error …`:** TypeScript's decorators mean something else at runtime,
  and EffectScript has no decorators of its own.
- **`error TodoNotFound(404) { … }`:** reads like a constructor call or a parameter.
- **A status per endpoint (`throws TodoNotFound = 404`):** possible later; most APIs give an error
  one status, and Effect's own convention annotates the error schema.
