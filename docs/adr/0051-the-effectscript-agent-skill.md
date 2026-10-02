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
