# ADR-0024: `effectscript/register` falls back to strip mode where transform mode is unavailable

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** agent ruling while executing Plan 3, Task 5
- **Related:** amends ADR-0021

## Context

ADR-0021 runs compiled `.efx` through `stripTypeScriptTypes(code, { mode: "transform" })`. That
works on Node 24.21, the qualified host. The `@types/node` 26 typings only allow `mode: "strip"`,
which indicates transform mode is gone in newer Node. This is unverified on Node 26.

## Decision

`effectscript/register` tries transform mode first. If Node rejects the mode
(`ERR_INVALID_ARG_VALUE`), it uses strip mode. In strip mode, non-erasable TypeScript (enums,
parameter properties, namespaces with values) fails with Node's own error. The compatibility
matrix lists strip-only hosts as running erasable syntax only.

## Consequences

- The same register module works across Node versions, with the best mode each supports.
- On strip-only hosts, users with enums in `.efx` need `efx build`, Bun or Vite.

## Alternatives considered

- **Always use TypeScript's `transpileModule`:** TypeScript becomes a runtime dependency, and
  startup is slower.
