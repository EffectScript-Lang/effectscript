# EffectScript Plan 21: The deferred minors (phase 15)

> **For agentic workers:** execute task by task with TDD. Decisions are recorded in `docs/adr/`.
> Commit with explicit, gated paths (another session shares the branch).

**Goal:** the minor findings that Plans 10–20's final reviews deferred are fixed, wherever a person
or an agent could meet them. Each item names the plan that deferred it.

**Spec:** the sections of the plans named below.

## Global Constraints

- Nothing is published. Brand files are never edited.
- Tests never touch the real HOME, editors or agent CLIs.

## Review Focus

1. **Crashes and silent wrong output first:** `efx fix` on a self-referencing link, a release
   version the Marketplace mapping rejects, output an agent prints with control characters.
   *(Task 1)*
2. **The docs corpus on odd Markdown:** nested fences, indented code, `ts-node` info strings,
   CRLF and BOM inputs stay as they were. *(Task 3)*
3. **Release tooling:** every version-carrying file moves together, and a Zed `rev` that isn't a
   commit SHA is refused. *(Task 5)*

---

### Task 1: CLI and setup

- `efx fix` survives `ln -s self self` (Plan 20).
- `efx skill --global` honours `CLAUDE_CONFIG_DIR` (Plan 20).
- `marketplaceVersion` failing doesn't break `efx setup` (Plan 20).
- An npm-installed `efx` with an older extension names both versions and `--vsix` (Plan 20).
- `efx convert --ai` keeps one tail per stream and strips control characters (Plan 20).
- The `emitWarning` filter is removed after the first strip, and never throws (Plan 18).
- `setup`'s JSDoc sits on `setup`; the `--only` ids are checked complete by the type (Plan 18).
- Setup prompts treat end of input as "no" (Plan 15).
- `efx convert --ai` restores a file's mode (Plan 15).
- `efx convert` on a `.ts` file with syntax errors says so instead of "nothing to re-sugar"
  (Plan 11).

### Task 2: Editors

- VS Code decorations cover every visible editor (Plan 11).
- The tsserver plugin drops a closed file's compile (Plan 11).
- The language server logs when it skips the project's TypeScript, and why (Plan 11).
- The Zed extension gets `overrides.scm`, so quotes don't auto-close inside strings (Plan 19).
- The grammar has no unnecessary conflicts, and the parser is generated at ABI 14 for Neovim
  0.10 (Plan 19).

### Task 3: The docs corpus

- Markdown: a `ts` fence nested in another fence, code indented four spaces, `ts-node` info
  strings, CRLF and BOM inputs, and code that doesn't parse keep their text (Plan 13).
- Converted fences don't start with a blank line where an import was removed (Plan 13).
- The generator reads tracked files only, and drift ignores dotfiles (Plan 13).
- API pages: no duplicate headings when an interface and a constant share a name (Plan 13).
- Guides skip `test/` and `fixtures/` folders (Plan 13).

### Task 4: The site

- Corpus links point at the site's pages where one exists; the `#declare` anchor resolves; Effect
  pages get "Open in playground" links (Plan 16).
- Sidebar groups are capitalized; `|>` renders without a ligature (Plan 16).
- The link test checks anchors (Plan 16).
- Token spans decode whole characters (Plan 16).
- The `errors` sample's retry wording and the `http` sample's routes and 404 match their plain
  versions; the copy drops "most common complaint" and doesn't lead with `--write --ai` (Plan 16).

### Task 5: Release, distribution and the skill

- `release.ts version` also moves `zed/Cargo.lock` and `tree-sitter.json`, only in the packages
  that have them; `release.ts zed --rev <sha>` sets the grammar commit and refuses anything but a
  SHA (Plan 19).
- A list summary followed by a paragraph stays valid Markdown (Plan 20).
- The release workflow: re-running with an unchanged formula succeeds; a manual run for an older
  tag doesn't mark it latest (Plan 10).
- Local packaging on macOS embeds no extended attributes (Plan 10).
- The standalone binary embeds the same skill files as npm (Markdown only), and the generated
  `syntax.md` doesn't cite spec section numbers an installed skill can't resolve (Plan 14).
- The skill gains `match` in `SKILL.md` and a SQL pattern, type-checked like the rest (Plan 14).
- `RELEASING.md` step 11: the submodule details, and the grammar commit before the tag (Plan 19).

**Not taken (rulings):** a linear `positionAt` (fast enough at the sizes editors send),
multi-root workspace imports in conversions (rare; VS Code converts one folder), Gemini and
opencode flags (their CLIs aren't installed to verify against), the tree-sitter CLI's lock files
in `~/.cache` (the CLI's own behaviour), and Windows-only items without a Windows host to test on.
