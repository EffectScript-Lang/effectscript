# ADR-0022: `efx build` compiles to a staging tree, then lets TypeScript emit

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** agent ruling for Plan 3, from review R10
- **Related:** review R10; spec §7.1

## Context

A published package must work for consumers who have no EffectScript tooling: plain `.js` plus
`.d.ts`. Import specifiers must point at real output files. A single-file compiler can't know
whether an imported `.efx` becomes `.ts` or `.tsx`.

## Decision

`efx build`:

1. **Compiles the whole project graph.** Every `.efx` under the project's root directory is
   compiled first. Its output mode (`ts`/`tsx`) is recorded in a manifest keyed by absolute path.
2. **Writes a staging tree** that mirrors the sources. `.efx` files become `.ts`/`.tsx`, and other
   files are copied. Relative imports of `.efx` modules (static imports, re-exports, and literal
   dynamic imports) are rewritten from the manifest to the exact staged extension. Non-literal
   dynamic imports are left alone and documented.
3. **Lets TypeScript 6 emit** from the staging tree with the project's compiler options, plus
   `rewriteRelativeImportExtensions`, so `.ts`/`.tsx` specifiers become `.js` in the output, with
   `.js` and `.d.ts` in `outDir`.

The compiler core stays single-file and pure. Graph knowledge lives in the CLI and integrations,
and reaches the core through the `rewriteImportExtensions` option or explicit specifier edits.

## Consequences

- The output is ordinary TypeScript build output, consumable with no plugin.
- Builds need TypeScript 6 installed (an optional peer of `effectscript`).

## Alternatives considered

- **Blind `.efx` → `.js` rewriting:** wrong for TSX output and for checking the staged TS.
- **Emitting JS directly from Volar's proxied program:** not a supported path for virtual files.
