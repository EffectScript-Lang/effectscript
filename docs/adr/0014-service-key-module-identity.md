# ADR-0014: Service keys include the module

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** agent ruling on review D04 (reproduced at `9a84acc32`)
- **Related:** review D04; spec §4.8

## Context

The default key was `<package>/<dir>/<Name>`, so `src/a.efx` and `src/b.efx` each declaring
`Users` both produced `app/Users`. Two different services with the same key are the same service
to `Context`. With a `packageName` but no `packageRoot`, an absolute filename also leaked
machine-specific directories into the key.

## Decision

The default key is `<package>/<dir>/<module>/<Name>`, where:

- `<dir>` is the file's directory relative to `packageRoot`, with a leading `src/` removed.
- `<module>` is the file name without its extension. It is omitted when it equals `<Name>` (ignoring
  case) or is `index`, so the common `src/users/Users.efx` keeps the short key `app/users/Users`.
- Separators are normalized to `/`.
- Without `packageRoot`, only the file name is used, never its directories. Keys never contain
  absolute paths.
- Without `packageName`, the key is `<Name>`, as before. This is for the browser playground and
  single files; project integrations always pass package information.
- `service X as "key"` still overrides everything.

Examples: `src/a.efx` → `app/a/Users`; `src/users/Users.efx` → `app/users/Users`;
`src/users/index.efx` → `app/users/Users`; `src/users/live.efx` → `app/users/live/Users`.

## Consequences

- Same-named services in different files of one package no longer collide.
- Renaming or moving a file changes its default key. Keys are runtime identities, so use `as "…"`
  for keys that must stay stable across refactors.

## Alternatives considered

- **Require explicit keys on collision:** a single-file compiler can't see other files.
- **Hash the path:** collision-free but unreadable, and keys show up in errors and traces.
