# ADR-0021: Run `.efx` on Node with `module.registerHooks` and transform-mode type stripping

- **Status:** Accepted, amended by ADR-0024
- **Date:** 2026-10-02
- **Deciders:** agent ruling for Plan 3, from review R09 and a spike
- **Related:** review R09; spec §7.2

## Context

Node's native TypeScript support only strips erasable syntax (no enums or parameter properties,
and no JSX). Plain `format: "module-typescript"` would therefore reject valid TypeScript that
EffectScript passes through.

## Decision

- `effectscript/register` registers synchronous hooks (`module.registerHooks`). For a `.efx` URL it
  compiles with the `node` runtime, fails on error diagnostics, and runs
  `stripTypeScriptTypes(code, { mode: "transform" })`, which handles enums and other non-erasable
  syntax. It returns `format: "module"`.
- `.ts` files that import `.efx`, and `.efx` files that import `.ts`, both work: Node loads `.ts`
  itself.
- `.efx` that compiles to TSX is rejected on this path with a clear error (Node has no JSX
  transform). JSX uses Bun, Vite or `efx build`.
- **Qualified host:** Node 24.21 (`registerHooks` and `stripTypeScriptTypes` are experimental in
  Node). Other versions are unqualified until tested.

## Consequences

- `node --import effectscript/register app.ts` works with no build step, for TS and EffectScript.
- Node prints an experimental-feature warning for `stripTypeScriptTypes`.

## Alternatives considered

- **`format: "module-typescript"`:** rejects non-erasable TypeScript.
- **TypeScript's `transpileModule`:** needs TypeScript at runtime and is slower.
