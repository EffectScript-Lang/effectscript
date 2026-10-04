# ADR-0068: The editor extension installs from the checkout as a symlink

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Gunther Brunner, with the agent
- **Related:** ADR-0041, ADR-0055

## Context

Trying an extension change in the editor we use day to day (Cursor, and VS Code) meant packaging a
`.vsix` and reinstalling it. The extension can't load straight from `packages/effectscript/vscode`:
the editor wants CommonJS bundles (`out/extension.cjs` and the tsserver plugin pack), the icons live
in `brand/icons/editor`, and the manifest needs the Marketplace version (ADR-0041, ADR-0055).

Recent VS Code builds, Cursor included, load user extensions from the profile's `extensions.json`,
not from whatever folders are in the extensions directory, so a symlink alone isn't picked up.

## Decision

- `scripts/stage.ts` builds the extension into a directory exactly as the editor loads it; both
  `package.ts` (the `.vsix`) and `dev-install.ts` use it.
- `pnpm --filter effectscript-vscode dev-install [--editor cursor|code]` stages into
  `packages/effectscript/vscode/.dev-extension` (gitignored). On the first run it installs the
  staged extension with the editor's CLI, so the editor records it in `extensions.json`, then
  replaces the installed folder with a symlink to `.dev-extension`.
- Later runs only rebuild `.dev-extension` (staged beside it and swapped in). "Developer: Reload
  Window" loads the new build.

## Consequences

- One command and a window reload put the checkout's extension in the editor.
- The registration names the version current at the first run. A version bump keeps working through
  the link; if the editor reinstalls or updates the extension, the link is gone and the next
  `dev-install` restores it.
- A Marketplace install of the same extension replaces the link; uninstalling it in the editor
  removes the link, not `.dev-extension`.

## Alternatives considered

- **Symlink the folder without installing:** the editor doesn't load extensions that
  `extensions.json` doesn't list.
- **Reinstall a `.vsix` on every change:** works, but slower, and the editor keeps old version
  folders around.
- **`--extensionDevelopmentPath`:** loads the extension only in a separate development window, not
  in the editor we work in.
- **Write the `extensions.json` entry by hand:** depends on an internal file format the CLI already
  writes for us.
