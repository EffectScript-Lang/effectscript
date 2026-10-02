# ADR-0031: Deliver the full reverse compiler in two plans

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** agent ruling for Plan 6
- **Related:** spec §6, §13, ADR-0016, ADR-0023

## Context

The §6.2 table has about 30 rows. One half inverts the language core (§4.1–4.13): effect forms,
types, builtins, resources, `try`, pipelines, schema, service, match and main. The other half
inverts the library constructs and ambient capture (§4.14–4.15): `config`, `layer`, `atom`,
`test`, `group`/`api`/`impl` and `command`. A single plan of that size would run its later tasks
on a compacted context and give one review a very large diff.

## Decision

- **Plan 6:** reverse the language core, add the §6.3 blockers, and add the ADR-0030 test
  harness.
- **Plan 7:** reverse the library constructs and ambient forms.

Spec §13 phase 6 becomes 6a/6b. Later phases keep their numbers.

## Consequences

- Each plan gets its own final review, and that review sees a diff of reviewable size.
- Until Plan 7 lands, library constructs come back as TypeScript (valid EffectScript). That is safe
  under ADR-0030.

## Alternatives considered

- **One plan:** rejected for review quality and context length.
- **Library constructs first:** the core shapes (generator bodies, pipes, imports) are what the
  library constructs are built from, so the core goes first.
