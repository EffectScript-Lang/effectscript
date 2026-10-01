# ADR-0013: `name?: T` maps to `Schema.optionalKey`

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** agent ruling on review R06 (reproduced at `9a84acc32`)
- **Related:** review R06; spec §4.6; success criterion 1 (`exactOptionalPropertyTypes`)

## Context

`schema User { email?: string }` emitted `Schema.optional(Schema.String)`. That accepts
`{ email: undefined }`, so the schema's type differed from the TypeScript type the user wrote,
under `exactOptionalPropertyTypes`.

## Decision

| Field                      | Schema                          |
| -------------------------- | ------------------------------- |
| `name?: T`                 | `Schema.optionalKey(T)`         |
| `name?: T \| undefined`    | `Schema.optional(T)`            |
| `name: T \| undefined`     | `Schema.UndefinedOr(T)`         |

This applies to class-form schemas, `error` fields, ADT variants and alias type literals alike.
Schemas produce readonly types: `T[]` becomes `ReadonlyArray<T>`, and `Set`/`Map` become their
readonly forms. That is documented as deliberate, not as exact preservation.

## Consequences

- Decoded types match the source types exactly, including absence versus explicit `undefined`.
- Existing goldens change (`optional` → `optionalKey`).
- Recursive and forward schema references still need an `=` field with `Schema.suspend`. A
  targeted diagnostic is future work.

## Alternatives considered

- **Keep `Schema.optional`:** accepts values the TypeScript type rejects.
