# ADR-0015: Version in lockstep with Effect

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** the user, choosing against the review's recommendation (R11)
- **Related:** review R11; spec §7.6, §1 (assumptions)

## Context

The spec proposed lockstep versions: `effectscript@4.0.x` targets `effect@4.0.*`. The review
recommended independent semver plus a tested Effect range, because a breaking *language* change
gets no version signal under lockstep. The spec also said "0.x" in one place and
"4.0.0-alpha.N" in another.

## Decision

- **Lockstep now.** EffectScript's major.minor follows Effect's. The patch number is
  EffectScript's own.
- Experimental releases are `4.0.0-alpha.N`. The core package version becomes `4.0.0-alpha.0`, and
  every "0.x" mention is removed.
- Breaking language changes are allowed during alpha. After that, they ship only with an Effect
  minor and are called out in the changelog.
- **The prelude is a curated surface (accepted from R11).** Tables are regenerated for each Effect
  release, but a release PR shows the diff of newly exposed names for review. Nothing becomes a
  builtin without that review.
- **Three versions are kept distinct:** the language/compiler version, the target Effect version
  (the `// @effect 4.0` header or an option), and the version actually resolved in the project
  (detected only by Node and project integrations; the browser compiler can't know it).
- Release automation opens a reviewable PR on both green and red upgrades. Nothing publishes
  without human approval.

## Consequences

- One number tells users which Effect a release targets.
- A language-breaking change during the 4.0 line has no major bump. Mitigations: the changelog,
  the `@effect` header, and alpha status. Revisit this ADR if that causes real breakage.

## Alternatives considered

- **Independent semver with a compatibility range (the review's recommendation):** a clearer
  signal for language changes, but the user prefers that the version names the Effect it targets.
- **0.x until stable, lockstep afterwards:** offered and declined.
