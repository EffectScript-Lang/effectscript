# ADR-0002: A TypeScript superset with one `.efx` extension

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** the user (name and extension), agent design (JSX handling)
- **Related:** spec §0, §2, §3.1–3.2, §4.19

## Context

The main complaint about Effect is verbosity. A new language could remove it, but a separate
language means lock-in, lost tooling, and an all-or-nothing migration, which would stop people
from trying it.

## Decision

- EffectScript is a strict superset of TypeScript. Every valid `.ts`/`.tsx` file is a valid
  `.efx` file with the same meaning. New syntax only triggers where TypeScript has no valid parse
  (§4.19). The automatic prelude (ADR-0007) is the one documented exception.
- One extension, `.efx`, covers both TS and TSX. The compiler parses in TS mode first and falls
  back to JSX mode, and emits `.ts` or `.tsx` to match.
- Files can be mixed freely: `.ts` imports `.efx` and the reverse, and TS and EffectScript can be
  mixed inside one file.

## Consequences

- Adoption can be gradual, per file or per function, and leaving is possible (reverse compiler,
  §6).
- Every contextual keyword needs a superset proof. A CI identity test compiles the whole
  `packages/effect/src` tree and checks it is unchanged.
- Generic arrows versus JSX are resolved by the TS-then-JSX fallback rather than by the
  extension.

## Alternatives considered

- **`.ets`:** taken by other ecosystems (ArkTS) and reads as "Effect TS", not a new language.
- **`.efx` plus `.efxx` (a TSX variant):** two extensions for one language; auto-detection makes
  the second unnecessary.
- **A non-superset language:** loses "no risk to try", the core of the pitch.
