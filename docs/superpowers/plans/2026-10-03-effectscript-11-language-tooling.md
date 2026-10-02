# EffectScript Plan 11: Language tooling (phase 8)

> **For agentic workers:** execute task by task with TDD. Decisions are recorded in `docs/adr/`.
> Gate every commit: `pnpm check && pnpm lint && git commit …`.

**Goal:** EffectScript editing works in every editor:

- a standalone language server (`efx-language-server`, `efx lsp`) for Neovim, Helix, Zed and
  others;
- the `await` guardrails of ADR-0006 in VS Code and in the language server;
- a packaged VS Code extension (`.vsix`) with its commands, icons and a bundled CommonJS
  TypeScript plugin.

**Architecture:**

- **Compiler:** the compile result gains `binds`, the source ranges of the `await` keywords that
  became `yield*`.
- **`@effectscript/language`:**
  - **`src/guardrails.ts`:** the hover text, and the rewrite of "awaited a Promise" type errors.
    Both hosts use it:
    - the tsserver plugin, through `getQuickInfoAtPosition` and `getSemanticDiagnostics` proxies;
    - the language server, through a Volar service plugin plus a wrapper around
      `volar-service-typescript`'s diagnostics.
  - **`src/languageServer.ts`** and **`bin/efx-language-server.js`:** `@volar/language-server`
    with `volar-service-typescript` and the EffectScript service.
- **`efx lsp`:** runs the project's language server, or the one embedded in the standalone binary
  when the project has none.
- **VS Code extension (`packages/effectscript/vscode`):**
  - **`src/extension.ts`:**
    - **Show Compiled TypeScript:** a live virtual document, opened beside the source;
    - **Convert File to EffectScript / to TypeScript:** one undoable `WorkspaceEdit`, which also
      rewrites the files that import the converted one;
    - effect-`await` decorations, with a themable color.
  - **`scripts/package.ts`:** esbuild bundles the extension (CJS) and the TS plugin pack (CJS, in
    `node_modules/@effectscript/typescript-plugin-pack`); the brand icons are copied in; then
    `vsce package`.

**Spec:** §7.3, §7.4, §7.5 (editor wiring for `efx setup`, Plan 10b), §13 phase 8.

**Decisions:**

- **New:**
  - ADR-0039: the `await` guardrails in the editor;
  - ADR-0040: the standalone language server and `efx lsp`;
  - ADR-0041: VS Code extension packaging and commands.
- **Builds on:** ADR-0006 (await guardrails), ADR-0019 (Volar on TS 6), ADR-0020 (recovery),
  ADR-0037 (binary).

## Global Constraints

- TypeScript 6 JS API only (ADR-0019). The server and plugin use the project's `typescript` when
  it is installed (`tsdk`/workspace).
- `effectscript/compiler` stays browser-safe and dependency-light. `binds` is plain data.
- The `.vsix` runs on VS Code ^1.95, whose Electron Node lacks `require(esm)`. Everything the
  extension host or tsserver `require`s is a CommonJS bundle.
- Nothing is published. Marketplace and Open VSX publishing is release prep (phase 11).
- Editor end-to-end tests use isolated profiles (temp `--user-data-dir` and extensions dir) and
  never touch the user's editor settings or extensions.

## Review Focus

1. Guardrails act only on effect `await`s. An `async` function's `await` in the same file gets no
   effect hover and no rewritten error. *(Tasks 2–3)*
2. Incomplete code (recovery, ADR-0020) never makes hovers, diagnostics or the commands throw.
   *(Tasks 2, 3, 5)*
3. **Convert File** on a file that other files import updates those imports in the same undoable
   edit, and refuses (with a message) a target that already exists. *(Task 5)*
4. The language server keeps working when the project has no `typescript`: it falls back to its
   own, and says which one it uses. *(Task 3)*
5. The `.vsix` contains no workspace symlinks or `.ts` sources that tsserver would `require`, and
   installs into a clean profile. *(Task 5)*

---

### Task 1: `binds` in the compile result (ADR-0039)

- `CompileResult.binds: ReadonlyArray<{ start; end }>`: the source range of each `await` keyword
  turned into `yield*` (including `await [..]`/`await {..}`). An `async` function's `await` is
  never included.
- **Tests:** binds for a plain, a concurrent, a nested and a returned `await`; none for `async`
  code or for `await` outside `effect`; and binds under `recover: true`.

### Task 2: Guardrails in the TS server plugin (ADR-0039)

- **`src/guardrails.ts`:**
  - `bindAt(binds, offset)`;
  - `bindHover`: "Effect bind (`yield*`): runs this effect here and short-circuits on failure";
  - `isPromiseAwaitError(diagnostic)`: the TS error codes for `yield*` over a Promise, found by
    probing TS 6;
  - `promiseAwaitMessage`: "Cannot `await` a Promise inside `effect`: use
    `await tryPromise(() => …)`".
- **The tsserver plugin:**
  - in `getQuickInfoAtPosition`, an effect `await` returns the bind hover;
  - in `getSemanticDiagnostics`, a Promise-await error whose start lies on a bind is rewritten
    (code kept, message replaced).
- **Tests** (`tsserver.test.ts` and `languageService.test.ts`): a hover on an effect `await` and
  on an `async` `await`, a rewritten error, an untouched `async` error, and incomplete code.

### Task 3: Standalone language server (ADR-0040)

- `src/languageServer.ts`:
  - `createConnection` (stdio) and `createServer`;
  - `createTypeScriptProject(ts, …, () => ({ languagePlugins: [createLanguagePlugin(ts)] }))`;
  - the services `volar-service-typescript` plus the EffectScript service (hover on binds,
    semantic tokens for binds as `keyword` + `effect`, and the diagnostic rewrite by wrapping the
    TS service's `provideDiagnostics`).
- **TypeScript:** `initializationOptions.typescript.tsdk`, else the workspace's `typescript`,
  else the server's own. It logs which one it uses.
- `bin/efx-language-server.js` (`--stdio`), and the package `bin` `efx-language-server`.
- **Tests** (`languageServer.test.ts`, JSON-RPC over stdio):
  - initialize;
  - open a `.efx` file and receive its diagnostics (an EFX diagnostic and a rewritten
    Promise-await error);
  - hover on a bind, completion of a service member, go-to-definition into a `.ts` file;
  - semantic tokens contain the bind;
  - a workspace without `typescript` still serves.

### Task 4: `efx lsp`, the binary, and Neovim (ADR-0040)

- `efx lsp [--stdio]`:
  - **npm:** runs the project's `@effectscript/language` server (like `check`), or explains how
    to install it.
  - **Standalone binary:** the build embeds a bundled language server, including TypeScript 6.
    It is unpacked like the preload and run with `BUN_BE_BUN=1`, and it prefers the project's
    TypeScript.
- **Docs:** configs for Neovim 0.11+ (`vim.lsp.config`), Helix (`languages.toml`) and Zed (a
  generic LSP note; the extension is later).
- **Tests:**
  - `efx lsp` answers `initialize` (npm path);
  - the binary's `efx lsp` answers `initialize` and a hover in a project without
    `@effectscript/language`;
  - an end-to-end Neovim run, skipped without `nvim`: headless, a temp config, open a `.efx`, wait
    for attach, hover on a bind, assert the text.

### Task 5: VS Code extension (ADR-0041)

- **`src/extension.ts`:**
  - **Show Compiled TypeScript:** an `efx-compiled:` virtual document that updates on change and
    opens beside the source.
  - **Convert File to EffectScript:** `planConversion` over the workspace's source files with
    `only: {file}`. It is applied as one `WorkspaceEdit` (rename and contents, plus importers),
    with the notes shown, and refused when the target exists.
  - **Convert File to TypeScript:** `toTypeScript` with `rewriteImportExtensions: "ts"`, the
    rename, and importers retargeted `.efx` → `.ts` by `retargetImports` (new, in
    `effectscript/convert/plan`).
  - Decorations on binds (`effectscript.effectAwait` color, themable).
  - File icons for `.efx`.
- **`scripts/package.ts`:**
  - esbuild produces `dist/extension.js` (CJS, `vscode` external) and
    `node_modules/@effectscript/typescript-plugin-pack/index.js` (CJS);
  - the manifest's `typescriptServerPlugins` names the pack;
  - icons are copied from `brand/icons/editor`;
  - `vsce package --no-dependencies` writes `effectscript-<version>.vsix`.
- **Tests:**
  - `retargetImports` unit tests;
  - the bundles load with `node --no-experimental-require-module`;
  - tsserver serves a `.efx` file through the pack;
  - the `.vsix` contents (no `.ts` sources or symlinks);
  - an end-to-end run, opt-in with `EFX_VSCODE_E2E=1`: `@vscode/test-electron` against the
    installed VS Code in a temp profile. It installs the `.vsix`, opens a `.efx` file, and checks
    the hover on a bind, the Show Compiled TypeScript content, and a Convert round trip.

### Task 6: Docs

- Spec §7.3, §7.4 and §13.
- COMPATIBILITY rows.
- The language package README (editor setup).
- This plan's execution record.
