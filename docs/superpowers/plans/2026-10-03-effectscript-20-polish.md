# EffectScript Plan 20: Polish from the deferred minors (phase 14)

> **For agentic workers:** execute task by task with TDD. Decisions are recorded in `docs/adr/`.
> Commit with explicit, gated paths (another session shares the branch).

**Goal:** the deferred minors that a person meets in normal use get fixed. Each item below was
deferred by a final review (Plans 10–19), and each has a visible symptom; the rest stay in their
plan's execution record.

**Spec:** §7.1, §7.5, §9.

## Global Constraints

- Nothing is published. Brand files are never edited.
- Tests never touch the real HOME, editors or agent CLIs.

## Review Focus

1. **Upgrades:** after updating `efx`, `efx setup` brings a stale skill up to date, and says so.
   *(Task 1)*
2. **Custom config locations:** `CLAUDE_CONFIG_DIR`, `CODEX_HOME` and `NVIM_APPNAME` are where
   `efx setup` looks and writes. *(Task 1)*
3. **A failing agent says why:** `efx convert --ai` shows the end of the agent's output when it
   fails or times out. *(Task 2)*

---

### Task 1: `efx setup` on upgrades and custom locations

- An installed skill older than this `efx` is replaced (its manifest names the version), with a
  line saying so; a current one is still skipped.
- Detection and writes follow `CLAUDE_CONFIG_DIR`, `CODEX_HOME` and `NVIM_APPNAME`.
- **Tests:** a stale manifest is upgraded; each variable moves the target.

### Task 2: `efx convert --ai` reports the agent's output

- The agent's output is captured (bounded), and its last lines are printed when the edit is
  reverted because the agent failed or timed out.
- **Test:** a fake agent that prints and exits 1; its output appears in the report.

### Task 3: Small CLI and release fixes

- `efx fix` doesn't follow directory symlinks into loops.
- `release.ts version --effect x.y` refuses a minor below the workspace Effect's; `changelog`
  writes no empty bullet, and a list summary stays a list.
- `install.sh`: Ctrl-C exits 130; a relative `EFX_INSTALL` prints an absolute PATH line.
- **Tests:** each.

### Task 4: Repository and runbook

- `.gitattributes` marks generated files (`effect-docs/content`, the tree-sitter queries, the
  compiled CLI) as `linguist-generated`, so pull requests collapse them.
- `RELEASING.md`: `pnpm exec vsce`/`ovsx` instead of `npx`; how `NPM_TOKEN`, `VSCE_PAT` and
  `OVSX_PAT` are provided.
- The playground's manual share link updates or disappears after an edit.
- **Tests:** the `.gitattributes` entries match existing paths; the playground piece in
  `protocol.ts`.
