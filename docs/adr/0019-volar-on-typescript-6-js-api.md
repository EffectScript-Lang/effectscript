# ADR-0019: Editor and checker integration through Volar on the TypeScript 6 JS API

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** agent ruling for Plan 3, from review R09 and a spike
- **Related:** review R08, R09; ADR-0016; spec §7.3

## Context

`.efx` must type-check with real `tsc` and get full IntelliSense, including across `.ts` ↔ `.efx`
imports. The monorepo root uses TypeScript 7 (the native port), which exposes no JS compiler API
or language-service plugin API. EffectScript core already develops against TypeScript 6. Volar
2.4 (used by Vue, Astro and MDX) maps a virtual TypeScript file onto a source file and patches the
JS compiler and language service.

A spike against the real compiler (2026-10-02) confirmed, with Volar 2.4.28 and TypeScript 6.0.3:

- A `.ts` file can import `./x.efx` with schema types flowing across.
- Go-to-definition and rename work across both files; hover and completion work inside `.efx`.
- `runTsc` reports `.efx` type errors at the original line and column.

## Decision

- A new package, `@effectscript/language`, holds one Volar `LanguagePlugin` that runs
  `toTypeScript` and exposes the result as a TS or TSX service script with the compiler's
  mappings. It is used in two places:
  - `efx-tsc`: Volar's `runTsc` over the TypeScript 6 `tsc.js`. Real `tsc`, with diagnostics mapped
    to `.efx`.
  - A TypeScript server plugin (`createLanguageServicePlugin`), which VS Code's built-in TS server
    loads in hybrid mode.
- **Supported TypeScript:** `typescript@^6` (the JS API). TypeScript 7 native is unsupported for
  checking and editing until it exposes an equivalent plugin API; `efx` says so explicitly when it
  finds only TS 7.
- The plugin builds its own script snapshots: `runTsc` passes the `tsc.js` namespace, which has
  no `ScriptSnapshot`.
- Hosts must provide `resolveModuleNameLiterals` and accept non-TS root files. Volar decorates
  these, and the in-process test harness mirrors what tsserver provides.

## Consequences

- One plugin serves the checker and the editor, the same model as `vue-tsc` and the Vue TS plugin.
- Users on TypeScript 7 alone need TypeScript 6 installed alongside to check or edit `.efx`.
- VS Code loads TS server plugins with `require`, so the extension ships a bundled CommonJS build
  of the plugin (Plan 7). Slice tests load it on Node 24, which supports `require(esm)`.

## Alternatives considered

- **A standalone language server only:** VS Code users would lose the built-in TypeScript
  experience in `.ts` files that import `.efx`.
- **TypeScript 7 native:** no plugin API yet.
