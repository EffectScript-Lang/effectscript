# EffectScript Plan 14: The AI skill (phase 9)

> **For agentic workers:** execute task by task with TDD. Decisions are recorded in `docs/adr/`.
> Gate every commit: `pnpm check && pnpm lint && git commit -m … -- <paths>` (another session
> shares this branch; never stage what isn't yours).

**Goal:** an agent skill that makes any coding agent write good EffectScript. `efx skill` installs
it. It contains:

- **`SKILL.md`:** when to use EffectScript, the core rules, the `async` ↔ `effect` table, and a
  decision table from Effect's best practices.
- **`references/syntax.md`:** every construct with its compiled TypeScript, generated from the
  language fixtures, so it never drifts.
- **`references/patterns.md`** and **`references/pitfalls.md`:** hand-written. Every code block is
  compiled in tests.
- **`references/effect-docs.md`:** Effect's agent guide (`LLMS.efx.md`, ADR-0050) in
  EffectScript.

**Architecture:**

- **Location:** `packages/effectscript/core/skills/effectscript/` (spec §8), shipped in the npm
  package and embedded in the standalone binary.
- **Generation:** `scripts/generate-skill.ts` writes `references/syntax.md` (from
  `test/fixtures/**/*.efx` and `.ts` pairs) and `references/effect-docs.md` (from
  `@effectscript/effect-docs`). `pnpm codegen` runs it, and a test fails on drift.
- **`src/cli/skill.ts`:** `installSkill({ target, force })`. It copies the skill into a project's
  `.claude/skills/effectscript/` (default), `~/.claude/skills/effectscript/` (`--global`), or any
  `--dir`. Other agents' locations come with `efx setup` (Plan 10b).
- **`efx skill`:** the command in `main.efx`, shared with Plan 12, so ping that session before
  editing.

**Spec:** §8, §7.5 (`efx skill`), §13 phase 9.

**Decisions:** ADR-0051 (new), the skill's layout, generation and install. Builds on ADR-0006
(the `async` table), ADR-0050 (corpus) and ADR-0038 (Plan 10b for other agents).

## Global Constraints

- Written for agents: short, imperative and scannable, following the repository's
  `.agents/skills` style. Every rule is backed by an example that compiles.
- **Every `efx` block in the skill compiles without error diagnostics.** A test runs
  `toTypeScript` on each one.
- **Install is safe:** an existing skill directory is replaced only when its `SKILL.md` names
  EffectScript, or with `--force`. Unrelated files are never touched.
- Nothing is published.

## Review Focus

1. The `async` ↔ `effect` table, laziness, and Promise awaits match the compiler's behaviour (the
   examples compile, and the pitfalls are real). *(Tasks 1–2)*
2. `syntax.md` covers every fixture directory, so a new construct without docs fails the test.
   *(Task 1)*
3. `efx skill` in a directory with an unrelated `.claude/skills/effectscript` refuses without
   `--force`. *(Task 3)*
4. The skill works when read alone: links resolve inside the skill directory, and nothing points
   at repository paths. *(Task 2)*
5. The standalone binary's `efx skill` installs the same files as the npm one. *(Task 3)*

---

### Task 1: Generated references

- `scripts/generate-skill.ts [--check]` writes:
  - `references/syntax.md`: one section per fixture directory (spec §4 order), each example as
    an `efx` block followed by its compiled `ts`;
  - `references/effect-docs.md`: `LLMS.efx.md`.
- It also joins `codegen`. Note that `core/package.json`'s scripts are shared.
- **Tests:**
  - drift fails;
  - every fixture directory has a section;
  - every `efx` block compiles.

### Task 2: `SKILL.md`, patterns and pitfalls

- **`SKILL.md`:** frontmatter (`name: effectscript`, a description that triggers on `.efx`,
  EffectScript, Effect), when to use it, the core rules, the `async` ↔ `effect` table, the
  decision table, and pointers to the references.
- **`references/patterns.md`:** services and layers, errors, schemas, config, testing, HTTP,
  CLI, resources, concurrency, retries and schedules, and streams.
- **`references/pitfalls.md`:**
  - the `try` contract;
  - `await` on Promises;
  - laziness;
  - the hoisting of `effect` declarations;
  - `catch` handler semantics;
  - `main` and layers;
  - when to write plain TypeScript.
- **Tests:** every `efx` block compiles without errors, and every relative link resolves inside
  the skill.

### Task 3: `efx skill` (ADR-0051)

- `src/cli/skill.ts` and the `skill` command: `efx skill [--global] [--dir <path>] [--force]`.
- The standalone binary embeds the skill files, as it does TypeScript's `lib`.
- **Tests:**
  - it installs into a project;
  - `--global` with a temporary HOME;
  - it refuses an unrelated directory, and `--force` replaces it;
  - the binary installs identical files.

### Task 4: Docs

- Spec §8 status, COMPATIBILITY row (shared, so ping first), and this plan's execution record.

---

## Execution record

**Rulings:**

- **Generated references are dprint-formatted by the generator.** `pnpm lint` formats every
  markdown file, so unformatted output would always look stale.
- **The examples are type-checked against the workspace `effect`, not only compiled.** That
  caught two mistakes before they shipped: a missing `needs Users`, and the compiler bug below.
- **A compiler bug was found and fixed:** an `effect` arrow whose expression body starts on the
  next line returned `undefined` (ASI after `return`). The body is now parenthesized
  (`c45e4aa78`, with a regression test).
- **The reverse compiler turns the new parenthesized form into a block-bodied arrow.** That is
  correct, but `effect (x) =>\n expr` would read better. It is deferred to polish.
- **Gates run per path during this plan,** because another session is editing the same working
  tree. The repository-wide gates run again at the end.
- **`main.efx` is shared** with the living-docs session (Plan 12). `skill` was added after its
  `docs` command, coordinated by message.
