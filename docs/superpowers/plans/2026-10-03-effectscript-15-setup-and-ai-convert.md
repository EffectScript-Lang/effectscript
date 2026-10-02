# EffectScript Plan 15: `efx setup` and `efx convert --ai` (Plan 10b)

> **For agentic workers:** execute task by task with TDD. Decisions are recorded in `docs/adr/`.
> Gate with `pnpm check && pnpm lint` on your paths and commit with explicit paths (another
> session shares the branch).

**Goal:**

- `efx setup` wires EffectScript into every editor and coding agent on this machine, asking
  before each write.
- `efx convert --ai` lets the user's own coding agent convert what the mechanical pass left as
  TypeScript, and keeps an edit only when the project still verifies.

**Architecture:**

- **`src/setup/detect.ts` (pure, injectable environment):** finds editors (VS Code, Cursor,
  Windsurf, VSCodium, Neovim, Helix, Zed, JetBrains) and agents (Claude Code, Codex, Cursor,
  Gemini CLI, opencode). It looks at CLIs on PATH, macOS app bundles and the agents' home
  directories.
- **`src/setup/plan.ts` (pure):** turns detections into actions, `{ id, description, run }`:
  - **Skill:** install it once into `~/.agents/skills/effectscript`, then link it from each agent's
    skills directory (`~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`, `~/.gemini/skills`,
    `~/.config/opencode/skills`). Copy where links can't be made.
  - **VS Code family:** `<cli> --install-extension <vsix>`. The standalone binary embeds the
    `.vsix`; the npm CLI uses a `.vsix` path or the Marketplace id.
  - **Neovim:** a drop-in `~/.config/nvim/plugin/effectscript.lua` (filetype, `vim.lsp.config`
    starting in the root, `vim.lsp.enable`).
  - **Helix:** append to `languages.toml`, and the `; inherits: typescript` query files.
  - **Zed and JetBrains:** printed instructions (no automatic write).
- **`src/cli/setup.ts`:**
  - asks `[Y/n]` per action on a TTY;
  - `--yes` runs everything, and `--dry-run` lists without writing;
  - `--project` installs the skill into `./.claude/skills` and `./.agents/skills` instead.
- **`src/convert/ai.ts`:**
  - finds the agent: `--agent claude|codex|gemini|opencode`, or the first one on PATH;
  - for each file with notes, after the mechanical pass, runs the agent non-interactively with
    the skill and the "left as TypeScript because …" notes;
  - verifies after each file and reverts that file when verification fails.

  Nothing is sent anywhere except through the user's own agent CLI.

**Spec:** §7.5 (`efx setup`, `efx convert` step 4), §8.

**Decisions:** ADR-0052 (new), setup's targets, linking and consent, and the AI pass contract.
Builds on ADR-0038 (the split), ADR-0040 (`efx lsp`), ADR-0041 (`.vsix`) and ADR-0051 (skill).

## Global Constraints

- **Never write without consent:** each action needs a `y`, `--yes`, or a non-TTY with `--yes`.
  Without a TTY and without `--yes`, `setup` only lists.
- **Idempotent:** running it twice changes nothing the second time, and existing user
  configuration is never overwritten. Append-only edits are guarded by a marker comment.
- **Tests are hermetic:** a temp HOME and PATH, with fake CLIs. The real environment is used only
  in a manual `--dry-run` check.
- **The AI pass:** never runs on a dirty tree (it inherits `convert --write`'s rules), never
  keeps a failing edit, and prints which agent and command it uses.

## Review Focus

1. **Second runs and existing config:** a user's own `plugin/effectscript.lua`, a Helix
   `[[language]] name = "effectscript"`, or a non-EffectScript skill directory are kept, and the
   action reports why it skipped. *(Task 2)*
2. **Missing agents and editors:** none installed means a clear "nothing to set up" and exit 0.
   A Windows-like environment without symlinks falls back to copies. *(Tasks 1–2)*
3. **Broken agent output:** an agent that hangs, exits non-zero or breaks the build has its
   file reverted, and the run continues with the next file. *(Task 4)*
4. **`--dry-run` writes nothing**, verified by comparing the temp HOME before and after.
   *(Task 3)*
5. **The `.vsix` path:** the binary's embedded `.vsix` is the one `scripts/package.ts` builds.
   *(Task 3)*

---

### Task 1: Detection

- `detect(env)`, where `env` is `{ home, platform, path, exists, which }`. It returns editors and
  agents with their CLI, config directory and evidence.
- **Tests:** a fake HOME and PATH per tool, macOS app bundles, nothing installed, and Windows
  paths.

### Task 2: Setup actions (ADR-0052)

- `plan(detections, options)` produces the actions above, each idempotent and reporting
  `done | skipped (why) | failed`.
- **Tests** (temp HOME, fake CLIs that record their argv):
  - each action runs;
  - running twice changes nothing;
  - user configuration is kept;
  - link with copy fallback.

### Task 3: `efx setup` command

- The flags `--yes`, `--dry-run` and `--project`, and the prompts.
- The standalone build embeds the `.vsix` (built by `packages/effectscript/vscode/scripts/package.ts`).
- `efx init` and the Homebrew caveats mention `efx setup`. `init.ts` is shared, so ping first.
- **Tests:**
  - `--dry-run` writes nothing;
  - `--yes` applies everything;
  - without a TTY and without `--yes`, it only lists;
  - the binary embeds the `.vsix`.

### Task 4: `efx convert --ai`

- `--ai` and `--agent` on `convert`.
- **Per file:** run the agent with a prompt naming the file, the notes and the skill path; then
  verify (as in ADR-0033) and keep or revert. A `--timeout` applies per file.
- **Tests:** fake agents that improve, break, hang and fail.

### Task 5: Docs

- Spec §7.5 status and COMPATIBILITY (shared, so ping first), the core README, and this plan's
  execution record.

---

## Execution record

**Rulings:**

- **Where skills go:** observed on the user's machine. Every agent loads `<home>/<agent>/skills/<name>/SKILL.md`,
  and the user already keeps skills in `~/.agents/skills` with links into each agent, so
  `efx setup` follows that layout.
- **`--only <ids>`:** added. It is useful by itself, and it keeps tests away from editors
  installed in `/Applications` (this Mac has VS Code, Cursor, Zed and a JetBrains IDE).
- **The language server command** written into editor configs is the running `efx` itself (the
  binary path, or Node plus `bin/efx.js`), never a bare `efx`.
- **Writes go through the skill manifest** (ADR-0051 amendment). An existing copy of our skill is
  updated in place rather than replaced by a link, so nothing the user added is lost.
- **The `--ai` pass** targets converted files that still have notes. Files the mechanical pass
  couldn't change at all aren't sent to the agent yet.
- **Gates and commits:** gates run per path and commits name their paths, because the
  living-docs session works in the same tree.
