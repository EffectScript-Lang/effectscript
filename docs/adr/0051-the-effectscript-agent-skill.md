# ADR-0051: The EffectScript agent skill: generated where it can be, type-checked where it's written

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** agent ruling for Plan 14 (phase 9)
- **Related:** spec §8, §7.5; ADR-0006, ADR-0037, ADR-0038, ADR-0050

## Context

Spec §8 calls for a skill that teaches coding agents EffectScript:

- `SKILL.md`;
- a syntax reference generated from the language fixtures;
- patterns and pitfalls;
- `efx skill` to install it.

An agent copies what a skill shows, so a wrong example is worse than none. Writing the patterns
surfaced two such mistakes before they shipped:

- an `effect` function that used a service without `needs`;
- an `effect` arrow whose body started on the next line. That one exposed a compiler bug:
  `return` followed by a line break returned `undefined`. It is fixed, with a regression test.

## Decision

- **Location:** `packages/effectscript/core/skills/effectscript/`, shipped in the npm package
  (`files`) and embedded in the standalone binary.
- **Generated references** (`scripts/generate-skill.ts`, part of `pnpm codegen`, with a drift
  test):
  - `references/syntax.md`: every fixture directory in spec §4 order, each example's EffectScript
    beside the TypeScript it compiles to. The golden tests verify those pairs. A fixture directory
    with no section fails generation.
  - `references/effect-docs.md`: Effect's agent guide in EffectScript (`LLMS.efx.md`, ADR-0050).

  Both are dprint-formatted by the generator, the same as every other markdown file in the
  repository.
- **Hand-written files:** `SKILL.md`, `references/patterns.md` and `references/pitfalls.md`.
  - Every `efx` block compiles with no errors **and type-checks against the workspace `effect`**.
  - Every `efx wrong EFXnnnn` block produces the diagnostic it names.
  - Links resolve inside the skill, so it works when copied anywhere.
- **`efx skill`:**
  - **Where:** into the project's `.claude/skills/effectscript/` by default, user-wide with
    `--global` (`~/.claude/skills/effectscript/`), or anywhere with `--dir`.
  - **Replacing:** an existing directory is replaced only when its `SKILL.md` is the EffectScript
    skill (`name: effectscript`), or with `--force`. Replacing removes files the new version no
    longer has.
  - **Other agents:** their locations (Codex, Cursor, Gemini CLI, opencode) come with
    `efx setup` (Plan 10b, ADR-0038).

## Consequences

- The syntax reference can't drift from the compiler, and a new construct can't ship without a
  section.
- Type-checking the examples costs about 10 s in the test suite. That is cheaper than an agent
  learning a wrong signature.
- The skill is about 110 KB. The Effect guide is the largest part, and it lets an agent work
  without network access.

## Alternatives considered

- **Hand-write the syntax reference:** it would drift, the way spec examples already had.
- **Compile-only checks for examples:** both mistakes above compile; only the type checker
  catches them.
- **Install for every agent now:** each agent's skill location and format needs the per-agent
  detection that `efx setup` is designed for.

## Amendment 1 (Plan 14 final review)

- **Installs are safe:** a manifest (`.efx-skill.json`) records what `efx skill` and `efx setup`
  wrote.
  - An update removes only those files. It never deletes recursively and keeps files the user
    added.
  - `--force` only allows writing the skill's files next to another skill's `SKILL.md`.
  - The working directory, the home directory, their ancestors, and git repositories are refused
    as targets, even with `--force`.
- **Good examples are strict-clean:** every `efx` block, including indented ones in `SKILL.md`,
  compiles with no diagnostic at all under strict mode, and type-checks.
- **Links in `effect-docs.md`** point at the examples on GitHub (ADR-0036), and the link check
  covers the generated files too.
- **New content:**
  - `await` on a runtime array (EFX8112, ADR-0053);
  - `try` paths (EFX2020), `for await` limits (EFX2010), `effect` class methods (EFX2002);
  - the test clock and console, and `test.live`;
  - running a `command` from `main` with `// @efx no-ambient`;
  - serving an `api`;
  - the names constructs generate.
- **Size:** the skill is about 85 KB (72 KB before this review), not 110 KB.
