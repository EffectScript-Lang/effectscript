# ADR-0041: VS Code extension packaging and commands

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** agent ruling for Plan 11
- **Related:** spec §7.4; ADR-0019, ADR-0039, ADR-0040

## Context

The extension declares `typescriptServerPlugins: @effectscript/language`. tsserver loads it with
`require` from the extension's `node_modules`, and VS Code loads the extension's `main` the same
way.

VS Code ^1.95 runs on Electron's Node 20, which has no `require(esm)`. The workspace packages are
ESM with TypeScript sources, so a `.vsix` must carry CommonJS bundles.

`vsce package --no-dependencies` excludes `node_modules` entirely, and `.vscodeignore` can't bring
any of it back.

Spec §7.4 names three commands: Show Compiled TypeScript, Convert File to EffectScript and
Convert File to TypeScript.

## Decision

- **Package layout** (`scripts/package.ts`, esbuild):
  - `out/extension.cjs`: the extension, with `vscode` external;
  - `node_modules/@effectscript/language/{index.js,package.json}`: the TS server plugin factory,
    with the compiler inside and `typescript` external. The plugin name in the manifest is
    unchanged, so the workspace and the `.vsix` load the same name.
- **The staged manifest's only dependency is that plugin pack**, and `vsce package` runs without
  `--no-dependencies`. vsce packages what `npm list --production` reports, which is the pack.
- **The extension package is `"type": "module"`** and its bundle is `.cjs`. TypeScript then
  checks the sources as ESM, while Node and VS Code always load the `.cjs` file as CommonJS.
- **Icons:** the extension and `.efx` file icons are copied from `brand/icons/editor` when
  packaging, so the brand folder stays the only source.
- **Commands:**
  - **Show Compiled TypeScript:** an `efx-compiled:` virtual document (path `<file>.efx.ts`, so
    it is TypeScript). It opens beside the source and updates on every edit. Recovered code shows
    its errors in a header comment.
  - **Convert File to EffectScript:** `planConversion` over the workspace's source files (open
    editors win) with `only: {file}`.
  - **Convert File to TypeScript:** `toTypeScript`, plus `retargetImports` for its importers. It
    refuses when there are compile errors or when the target exists.
  - Both conversions are one `WorkspaceEdit`: rename, the new text, and the importers. It is
    applied, then saved, so the disk matches the editors. A conversion whose target exists is
    refused with the reason.
- **Effect-`await` decorations** use the theme color `effectscript.effectAwait` (ADR-0039).
- **Tests:**
  - package contents;
  - both bundles load under `node --no-experimental-require-module`;
  - a real tsserver loads the packed plugin on that Node;
  - an opt-in end-to-end run (`EFX_VSCODE_E2E=1`) installs the `.vsix` into the installed VS Code
    in a throwaway profile, then checks the hover, the rewritten Promise error, Show Compiled
    TypeScript, and a Convert round trip.

## Consequences

- One `.vsix` works from VS Code 1.95 on. The CommonJS loading is verified on Node without
  `require(esm)`; the full editor run is verified on the installed VS Code (1.138).
- The bundle includes the compiler and Volar, a few MB. That is the cost of not depending on the
  user's Node.
- Converting saves the touched files. Undo still reverts the edit, as for any refactoring.

## Alternatives considered

- **`--no-dependencies` with `.vscodeignore` negations:** vsce drops `node_modules` before
  reading the ignore file.
- **A renamed pack (`@effectscript/typescript-plugin-pack`):** the manifest would name a package
  that doesn't exist in the workspace, so development hosts couldn't load the plugin.
- **Leave converted files unsaved:** the disk would hold a `.efx` file with the old TypeScript
  until the user saves, which surprises tools and `git status`.
