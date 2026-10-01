# ADR-0005: `effect` is the keyword

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** the user
- **Related:** spec §1 decisions table, §4.1

## Context

The first draft used `fx` for effect functions and blocks. The user asked whether `effect` is
better.

## Decision

The contextual keyword is `effect`: `effect name() {}`, `effect {}`, `effect (x) => …`.

## Consequences

- Self-explanatory to readers, and it is the brand itself.
- It costs the same number of tokens as `fx` for common tokenizers.
- `effect` as an identifier still works everywhere it is valid TS. The keyword only triggers when
  followed on the same line by a name, `{`, or arrow parameters.

## Alternatives considered

- **`fx`:** cryptic to newcomers, with no token savings.
- **`gen`:** describes the mechanism, not the meaning.
