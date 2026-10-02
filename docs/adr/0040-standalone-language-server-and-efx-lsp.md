# ADR-0040: A standalone language server, run by `efx lsp`

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** agent ruling for Plan 11
- **Related:** spec §7.3, §7.5; ADR-0019, ADR-0037, ADR-0039

## Context

VS Code serves `.efx` through its built-in TypeScript server and our plugin (ADR-0019). Other
editors (Neovim, Helix, Zed, JetBrains through LSP4IJ, Emacs) speak LSP and have no TypeScript
server plugin host. Spec §7.3 names a standalone server on `@volar/language-server` and
`volar-service-typescript`. Spec §7.5 has `efx setup` point editors at `efx lsp`, and the
standalone binary (ADR-0037) should carry the server.

Volar 2.4 calls service plugins only on the compiled TypeScript of a file with generated code,
never on the `.efx` source itself. EffectScript's own results are in source positions: compiler
diagnostics, and bind hovers and tokens.

## Decision

- **`@effectscript/language` ships `efx-language-server`** (`--stdio`):
  - `createTypeScriptProject` with the language plugin over URIs;
  - `volar-service-typescript` for everything TypeScript does;
  - EffectScript's results, added by wrapping each project's language service so they stay in
    source positions:
    - compiler diagnostics (`EFX…`, source `effectscript`);
    - the bind hover;
    - bind semantic tokens (`keyword` + `effect`), merged into TypeScript's.
  - A capability-only service plugin declares the token legend, and a wrapper around the
    TypeScript services rewrites Promise-await errors (ADR-0039).
- **TypeScript 6:**
  1. `initializationOptions.typescript.tsdk`;
  2. else the nearest workspace `node_modules/typescript` (found by walking directories, never
     through `NODE_PATH`);
  3. else the server's own.

  It logs which one it uses. A TypeScript other than 6 is skipped (ADR-0019).
- **`efx lsp`:**
  - **npm:** runs the project's `efx-language-server`, or says how to install
    `@effectscript/language`.
  - **Standalone binary:** embeds a bundled server, including TypeScript 6. It is unpacked like
    the preload, run on the binary's Bun, and still prefers the project's TypeScript.
- **Editor configs** are documented (Neovim 0.11+ `vim.lsp.config`, Helix `languages.toml`).
  `efx setup` (Plan 10b) writes them. Zed needs an extension to register a new language; that is
  a later deliverable.

## Consequences

- One server for every LSP editor, with the same TypeScript behaviour as VS Code (both are
  Volar over TypeScript 6).
- The wrapper relies on `LanguageService` method shapes (`getDiagnostics`, `getHover`,
  `getSemanticTokens`) and on `service.context`. A Volar upgrade that changes them breaks the
  server tests, not users silently.
- The binary grows by about 15 MB: TypeScript's `typescript.js` (9 MB), its 107 `lib.*.d.ts`
  files (4 MB) and the server bundle (2 MB). In exchange, `efx lsp` works without any npm
  install.
- Editors must start `efx lsp` in the project root, so that it finds the project's
  `@effectscript/language`. Helix does this; the documented Neovim config passes
  `cwd = config.root_dir`.

## Alternatives considered

- **EffectScript results as a service plugin:** Volar never calls it on the `.efx` source, and
  mapping compiler diagnostics through the compiled code loses those on rewritten regions.
- **Users install `typescript-language-server` with our tsserver plugin:** two moving parts per
  editor, and Volar's own server is what Vue and Astro use for the same job.
- **No bundled TypeScript in the binary:** `efx lsp` would fail in projects that haven't run
  `npm i`, which is when people first open a file.
