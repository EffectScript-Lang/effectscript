# ADR-0045: Research and strategy live in a private repository

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** the user
- **Related:** ADR-0008 (public fork), ADR-0036 (EffectScript-Lang organization)

## Context

This repository is public (ADR-0008, ADR-0036). Some research draws on private sources: the
Plan 12 language-feature research read a private design book. Business strategy and partner notes
aren't meant to be public either. A research note was nearly committed here.

## Decision

- **Private material goes to `EffectScript-Lang/internal`.** That covers research notes, strategy,
  outreach and unannounced plans. The private repository is cloned next to this one, at
  `../effectscript-internal`.
- **Decisions stay public.** Every design decision is still recorded here as an ADR (`.agents/AGENTS.md`).
  When private research informed a decision, the ADR names the note by its title. It never quotes
  or links private material.
- **No `docs/research/` here.**

## Consequences

- Agents working here need access to the private repository to read the research. The public ADRs
  have to stand on their own.
- Nothing from a private source reaches the public history by accident.

## Alternatives considered

- **Keep research here and leave out the private parts:** too easy to get wrong, and git history is
  permanent.
- **Keep research outside git:** research needs history and review, the same as code.
