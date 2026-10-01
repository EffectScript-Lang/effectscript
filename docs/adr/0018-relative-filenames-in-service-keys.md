# ADR-0018: Relative filenames keep their directories in service keys

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** agent ruling while executing Plan 2, Task 7
- **Related:** amends ADR-0014; spec §4.8

## Context

ADR-0014 said that without a `packageRoot`, a service key uses only the file name, never its
directories, so absolute paths can't leak into keys. That rule also discarded the directories of
*relative* filenames such as `src/db/Database.efx`, which carry no machine-specific information
and were already used to build readable keys (`acme/db/Database`).

## Decision

Without a `packageRoot`:

- a **relative** filename keeps its directories (minus `./` and a leading `src/`), as with a root;
- an **absolute** filename (`/…` or a drive letter such as `C:/…`) keeps only its file name.

Everything else in ADR-0014 stands.

## Consequences

- Integrations that pass project-relative filenames get full keys without having to pass a root.
- Keys still never contain absolute paths.

## Alternatives considered

- **File name only for any filename without a root (ADR-0014 as written):** loses useful,
  harmless directory information.
