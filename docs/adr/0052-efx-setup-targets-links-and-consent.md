# ADR-0052: `efx setup`: what it touches, how it links the skill, and when it asks

- **Status:** Accepted; amended by ADR-0059 (upgrades, config variables)
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

## The AI pass (`efx convert --ai`)

- **The agent:** after the mechanical pass and its verification, `--ai` runs the user's own
  coding agent non-interactively, one converted file at a time, on the files that still have
  "stays TypeScript" notes. The agent is `--agent claude|codex|gemini|opencode`, or the first one
  on PATH:
  - `claude -p … --permission-mode acceptEdits`
  - `codex exec --full-auto …`
  - `gemini -p … --yolo`
  - `opencode run …`
- **The prompt** names the file, lists the notes with their line numbers, points at a temporary
  copy of the skill, and asks for edits to that file only.
- **Keep or revert:**
  - Edits to any other file are undone, and new files are removed, by comparing the files git
    sees before and after.
  - The file's edit is kept only if the agent exits 0 within `--timeout` seconds (default 300),
    the file compiles without errors, and the project verifies (ADR-0033). Otherwise the file is
    restored.
- **Nothing leaves the machine** except through the agent the user installed and configured. With
  no agent installed, the mechanical conversion stands and `efx` says so.

## Amendment 1 (Plan 15 final review)

- **The AI pass never deletes what existed before.**
  - It records every path first (ignored ones included) and restores the files git saw. Only
    then does it list again, and only new paths may be removed. Ignored files such as `.env`
    survive an agent that empties `.gitignore`. Edits to ignored files can't be undone.
  - Git listings use a large buffer, and a git failure aborts the pass rather than acting on a
    partial list.
- **Agents run in their own process group,** which is killed on timeout and after the agent
  exits, so nothing it started edits files after verification. A target the agent deletes or
  renames is restored.
- **Agent flags:**
  - `codex exec --sandbox workspace-write` (codex-cli 0.160 removed `--full-auto`);
  - `claude … --add-dir <skill>`;
  - `gemini --approval-mode auto_edit --include-directories <skill>`.

  The skill copy lives in the git directory.
- **Setup:**
  - An agent is linked only to an installed EffectScript skill, and a linked shared directory (a
    checkout) is never written through.
  - `--project` keeps a project's own skill of the same name.
  - The `.vsix` is resolved only when an extension is installed, so listing writes nothing.
- **Helix:** the config is parsed (`smol-toml`), and a user's own `efx` server, `effectscript`
  language or `.efx` file type is left alone. The server id is `effectscript-lsp`. Our block sits
  between markers, is rewritten on later runs, is validated before writing, and is written
  atomically.
- **Neovim:** the plugin returns early before 0.11, and reads `(config or {}).root_dir` (0.11
  passes no config).
- **Editor configs use `efx lsp`** when the `efx` on PATH is this `efx`, so they survive
  upgrades.
- **Windows:** commands and agents are called through quoted command lines (`.cmd` shims and
  paths with spaces), with a single-line prompt.
