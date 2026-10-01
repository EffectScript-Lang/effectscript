# ADR-0008: Live in a public fork of the Effect monorepo

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** the user
- **Related:** spec §7, §10

## Context

EffectScript tracks Effect closely: prelude tables come from Effect's source, and output is
type-checked against it. The user didn't want to maintain several repositories. The site uses the
same stack as the Effect website.

## Decision

- Everything lives under `packages/effectscript/*` in a fork of the Effect monorepo: compiler,
  CLI, language tooling, VS Code extension, site, and examples. It follows the monorepo's
  conventions (pnpm, `tsc -b`, vitest projects, dprint, oxlint).
- The fork is public and moves from `gunta/effect-lang` to the `EffectScript-Lang` GitHub
  organization when the work is complete. The user changed this from private to public.

## Consequences

- Type checks and tests run against the exact workspace `effect`, and upstream syncs are merges.
- Root files are shared with upstream (for example `.agents/AGENTS.md`), so keep our additions in
  separate sections to limit merge conflicts.

## Alternatives considered

- **A standalone repo depending on published `effect`:** drifts from upstream, and needs a second
  toolchain setup.
- **Several repos (compiler, site, extension):** more maintenance, and the user rejected it.
