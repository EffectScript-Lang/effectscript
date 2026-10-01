# EffectScript compatibility matrix

**States:**

- **planned:** designed, not built.
- **implemented:** code exists, no automated evidence yet.
- **locally tested:** an automated test passes in this repository.
- **host-qualified:** tested against the named host version.
- **released:** published.

Nothing is released yet. Last updated 2026-10-02.

| Path                                                                 | Host / version                                | State          | Evidence                                                             | Limits                                                                            |
| -------------------------------------------------------------------- | --------------------------------------------- | -------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Compile `.efx` → TS/TSX (`toTypeScript`)                             | any JS runtime, browser-safe                  | locally tested | `core/test/compile.test.ts`, `typecheck.test.ts`, `runtime.test.ts`  | Purely syntactic (ADR-0017)                                                       |
| Output type-checks against `effect`                                  | TypeScript 6.0.3, `effect` 4.0 (workspace)    | host-qualified | `core/test/typecheck.test.ts`                                        | `strict` + `exactOptionalPropertyTypes`                                           |
| Superset identity (valid TS unchanged)                               | `packages/effect/src`                         | locally tested | `core/test/superset.test.ts`                                         | Prelude exception (ADR-0007)                                                      |
| Reverse compiler (`toEffectScript`)                                  | any JS runtime                                | locally tested | `core/test/reverse.test.ts`, `language/test/adoption.test.ts`        | Subset only: `effect` declarations, `error`, `schema` class (ADR-0023)            |
| Incomplete-code recovery                                             | —                                             | locally tested | `core/test/recover.test.ts`, `language/test/languageService.test.ts` | Neutralizes up to two lines (ADR-0020)                                            |
| `efx-tsc` (real tsc, mapped errors)                                  | TypeScript 6.0.3, Volar 2.4.28                | host-qualified | `language/test/efxTsc.test.ts`                                       | TypeScript 7 native: unsupported (ADR-0019)                                       |
| TS server plugin (VS Code path)                                      | tsserver from TypeScript 6.0.3 on Node 24.21  | host-qualified | `language/test/tsserver.test.ts`                                     | VS Code itself not yet tested; the extension's bundled CommonJS plugin is planned |
| Language service: definition, rename, hover, completion, diagnostics | TypeScript 6.0.3                              | locally tested | `language/test/languageService.test.ts`                              | —                                                                                 |
| VS Code extension manifest + grammar                                 | VS Code ^1.95 (manifest), Shiki 4.4 (grammar) | locally tested | `language/test/vscode.test.ts`                                       | Not packaged as `.vsix` yet                                                       |
| `node --import effectscript/register`                                | Node 24.21                                    | host-qualified | `core/test/register.test.ts`                                         | No JSX (EFX1101). Strip-only Node versions run erasable syntax only (ADR-0024)    |
| `efx build` (graph-aware, `.js` + `.d.ts`)                           | TypeScript 6.0.3, Node 24.21                  | host-qualified | `core/test/cli.test.ts`, `language/test/adoption.test.ts`            | Non-literal dynamic `import()` of `.efx` is not rewritten                         |
| `efx run` / `efx check`                                              | Node 24.21                                    | locally tested | `core/test/cli.test.ts`, `language/test/adoption.test.ts`            | `check` needs `@effectscript/language` + `typescript@6`                           |
| Packed package, plain TS consumer                                    | TypeScript 6.0.3 `tsc`, Node 24.21            | host-qualified | `language/test/adoption.test.ts` (step 4)                            | —                                                                                 |
| Bun plugin / Bun runtime                                             | —                                             | planned        | —                                                                    | —                                                                                 |
| Vite / Vitest / Astro plugin                                         | —                                             | planned        | —                                                                    | —                                                                                 |
| Standalone `efx` binary, Homebrew                                    | —                                             | planned        | —                                                                    | —                                                                                 |
| Language server for other editors (Neovim, Zed, Helix)               | —                                             | planned        | —                                                                    | —                                                                                 |
| TypeScript 7 native (tsgo)                                           | —                                             | unsupported    | —                                                                    | No plugin API yet (ADR-0019)                                                      |
