# ADR-0061: The private repository is `EffectScript-Lang/effectscript-internal`

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** the user
- **Related:** supersedes ADR-0045's repository name; ADR-0060 (the public repository's name)

## Context

ADR-0045 put research notes, strategy and other non-public material in the private repository
`EffectScript-Lang/internal`, cloned at `../effectscript-internal`. The user renamed it so the
remote name matches the clone's and pairs with the public `EffectScript-Lang/effectscript`.

## Decision

- The private repository is **`EffectScript-Lang/effectscript-internal`**, still private, still
  cloned at `../effectscript-internal`.
- Everything else in ADR-0045 stands: private material goes there and never here, and public ADRs
  may cite a private note by its title without quoting it.

## Consequences

- The clone directory and the remote have one name. GitHub redirects the old
  `EffectScript-Lang/internal` URL.
- **Cost if wrong:** another rename.

## Alternatives considered

- **Keep `internal`:** the user didn't like the name; it says nothing about which project it serves
  in an organization that may hold more repositories.
