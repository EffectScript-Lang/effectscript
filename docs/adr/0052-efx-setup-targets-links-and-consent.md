# ADR-0052: `efx setup`: what it touches, how it links the skill, and when it asks

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** agent ruling for Plan 15 (the Plan 10b part of ADR-0038)
- **Related:** spec §7.5, §8; ADR-0038, ADR-0040, ADR-0041, ADR-0051

## Context

Spec §7.5 has `efx setup` wire EffectScript into every editor and coding agent on a machine. It
writes only after you confirm each item, and supports `--yes` for CI.

On a real machine (the user's), each agent loads skills from its own directory:
`~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`, `~/.gemini/skills` and
`~/.config/opencode/skills`. Skills are often kept once in `~/.agents/skills` and symlinked from
there. Editors differ more: VS Code-family editors install a `.vsix` through their CLI, Neovim
reads `plugin/*.lua` from its config, and Helix reads `languages.toml` plus query files.

## Decision

- **Detection** (`src/setup/detect.ts`) is pure over an injected environment: PATH, HOME,
  `XDG_CONFIG_HOME`, `APPDATA` and `LOCALAPPDATA`, file existence, and directory listings. It finds:
  - **Editors:** VS Code, Cursor, Windsurf, VSCodium (on PATH or as macOS app bundles), Neovim,
    Helix, Zed, and JetBrains IDEs.
  - **Agents:** Claude Code, Codex, Cursor, Gemini CLI and opencode (their CLI, or their home
    directory).
- **Actions** (`src/setup/plan.ts`) are idempotent. They report `done`, `skipped` (with the
  reason), `manual` or `failed`:
  - **The skill:** written once to `~/.agents/skills/effectscript`, then symlinked from each
    agent's skills directory. Where links fail (Windows without developer mode), it is copied.
    Another skill of the same name is kept. Writes go through the skill manifest (ADR-0051
    amendment), so nothing the user added is deleted.
  - **VS Code family:** `<cli> --install-extension <vsix>`, skipped when `--list-extensions`
    shows it. The `.vsix` comes from `--vsix`, or from the standalone binary, which embeds the one
    `vscode/scripts/package.ts` builds.
  - **Neovim:** a drop-in `plugin/effectscript.lua` (filetype, `vim.lsp.config` starting in the
    root, `vim.lsp.enable`). A file at that path that `efx setup` didn't write is kept.
  - **Helix:** a marked block appended to `languages.toml` (unless an `effectscript` language is
    already there), and the `; inherits: typescript` query files.
  - **Zed and JetBrains:** instructions only.
- **Consent:**
  - In a terminal, `efx setup` asks `[Y/n]` per action.
  - `--yes` applies everything; `--dry-run` only lists.
  - Without a terminal and without `--yes`, it only lists, so a script never writes by surprise.
  - `--only <ids>` narrows the run, and `--project` installs the skill into the project's
    `.claude/skills` and `.agents/skills` instead of the machine.
- **The language server command** written into editor configs is this `efx`: the standalone
  binary's path, or Node with this package's `bin/efx.js`. It is never a bare `efx` that might
  not be on the editor's PATH.

## Consequences

- One `~/.agents/skills/effectscript` updates every agent at once; `efx setup` again refreshes it.
- Tests never touch the real editors: they use a temporary HOME and PATH with fake CLIs, and
  `--only` keeps detected apps (such as an installed VS Code) out.
- An editor config pointing at a binary path breaks if that binary moves; rerunning `efx setup`
  rewrites the config it owns.

## Alternatives considered

- **Copy the skill into every agent:** five copies to keep in step. Links keep one.
- **Edit `init.lua`:** risky on hand-written configs. A file in `plugin/` loads automatically.
- **Bare `efx` in editor configs:** editors often run with a different PATH than the shell.
