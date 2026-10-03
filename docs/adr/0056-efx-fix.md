# ADR-0056: `efx fix` rewrites through the round trip, and only EFX8101

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** agent ruling for Plan 18 (phase 12)
- **Related:** spec §4.17, §7.1; ADR-0028, ADR-0030; Plan 18 Task 3

## Context

Spec §4.17 says "`efx fix` applies the fixes" for the strict-mode warnings, and the EFX8101 hint
("`Effect.gen` written by hand") told people to run it. It didn't exist. EFX8101 is the one
warning whose fix is mechanical: Effect TypeScript inside an `.efx` file has an EffectScript form
that the reverse compiler already knows. The other warnings (`any`, timers, `fetch`, `new Date()`,
nullable service types…) need a decision only a person can make, such as which error to throw or
which service to use.

## Decision

- **`efx fix [paths] [--check]`** takes `.efx` files (default: the project, without
  `node_modules`, `dist`, `build`, `coverage` and dot directories). For each file it compiles the
  file to TypeScript, converts that back with the reverse compiler, and keeps the result only when
  the result compiles to the identical TypeScript (the round-trip contract, ADR-0030). A fix can
  therefore never change what a program does.
- **Only that rewrite.** Other strict warnings keep their hints; `efx fix` doesn't guess.
- **A file that doesn't compile is skipped and reported,** and the command exits 1. `--check`
  writes nothing and exits 1 when a file would change, for CI.
- **One cosmetic step:** where the file began with an `import` the prelude now provides, the
  reverse compiler leaves a blank first line; `efx fix` removes leading blank lines when the file
  didn't start with one. That can't change the program.

## Consequences

- The EFX8101 hint is true, and a project converted by hand, or written by an agent in TypeScript
  style, can be brought to canonical EffectScript in one command.
- The whole file is canonicalised, not only the EFX8101 spans: a non-canonical but valid form
  elsewhere in the file may also be rewritten, always to the same TypeScript.
- **Cost if wrong:** a rewrite someone finds less readable; `git diff` shows it, and the TypeScript
  is provably the same.

## Alternatives considered

- **Rewrite only the spans EFX8101 reports:** needs the reverse compiler to work on fragments
  inside EffectScript, which it can't parse. The whole-file round trip reuses the tested path.
- **Fix every strict warning:** most have no single right answer, and a wrong automatic fix is
  worse than a hint.
- **Drop `efx fix` from the spec and the hint:** loses the one mechanical fix that the language's
  "one canonical way" promise depends on.
