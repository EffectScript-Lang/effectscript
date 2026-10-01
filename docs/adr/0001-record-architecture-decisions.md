# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** the user
- **Related:** `.agents/AGENTS.md` ("Architecture Decision Records"), `CLAUDE.md`

## Context

EffectScript is built mostly by agents, across many sessions whose context is summarized or lost.
The spec says *what* the language does, but the reasons behind a choice (a user preference, a
review finding, an Effect API constraint) were scattered across conversations. A later agent that
can't see the reason will "fix" a deliberate choice, or keep a bad one because it looks
deliberate.

## Decision

Every decision with real alternatives gets an ADR in `docs/adr/`, written in the same change that
implements it. Decisions change only by writing a new ADR that supersedes the old one. The rule is
in `.agents/AGENTS.md`. The root `CLAUDE.md` imports that file, so Claude Code and agents that read
`AGENTS.md` follow the same instructions.

The ADRs 0002–0008 backfill decisions made before this rule existed.

## Consequences

- Any agent can answer "why is it like this?" from the repository alone.
- Writing a short record adds a little work to each decision.
- The spec stays the description of the current design. When an ADR and the spec disagree, the
  newest accepted ADR wins and the spec is fixed.

## Alternatives considered

- **Rationale in the spec only:** the spec is rewritten in place, so superseded reasoning
  disappears, and the spec mixes the what with the why.
- **Rationale in commit messages:** hard to find, and many decisions are made before any code.
- **Agent memory files:** local to one machine and one agent; not reviewable in the repo.
