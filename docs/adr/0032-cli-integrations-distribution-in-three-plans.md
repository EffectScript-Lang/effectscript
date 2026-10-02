# ADR-0032: Deliver phase 7 in three plans, with a dogfooded CLI that depends on `effect`

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** agent ruling for Plan 8
- **Related:** spec §7.1, §7.2, §7.5, §13; ADR-0015, ADR-0031

## Context

Phase 7 bundles three projects of very different kinds:

- **The `efx` CLI:** `print`, `convert`, `init`, `doctor`, with command modules written in
  EffectScript.
- **Runtime integrations:** the Bun plugin and preload, the Vite plugin, and the examples package.
- **Distribution:** the standalone `bun build --compile` binary, the install script, Homebrew,
  `efx setup` (editors and agents), and `efx convert --ai`.

The CLI is written with `effect/cli` and runs on `@effect/platform-node`. Until now, `effectscript`
had no runtime dependency on `effect`; the compiler stays dependency-light and browser-safe.

## Decision

- **Plans:**
  - **Plan 8, the CLI:** `build`, `check`, `run`, `print`, `convert` (the mechanical pass with
    verification), `init` and `doctor`, dogfooded.
  - **Plan 9, runtime integrations:** `effectscript/bun`, `effectscript/vite`, the examples
    package, and `efx run` on Bun.
  - **Plan 10, distribution:** the binary, the install script, Homebrew, `setup`, `convert --ai`
    and `skill`. `skill` waits for phase 9's skill content.
- **Dependencies:** `effect` and `@effect/platform-node` become dependencies of `effectscript`,
  with the same version under lockstep (ADR-0015). Only the CLI entry imports them, and
  `effectscript/compiler` keeps its three dependencies.
- **Dogfooding mechanism:**
  - Command modules are `src/cli/*.efx`.
  - `pnpm codegen` compiles them with `toTypeScript` and formats the output with dprint into
    checked-in `src/cli/*.ts`.
  - A test fails when a checked-in file is stale.
  - Engines with no effectful structure (build staging, the conversion planner) stay TypeScript
    modules that the commands call.
- **Exit codes:** handlers fail with an `ExitCode` error that carries `Runtime.errorExitCode`, so
  `runMain` exits with a child process's code.

## Consequences

- Installing `effectscript` pulls in `effect`. Every user of the language already depends on it,
  so the cost lands on non-users of `effect` only, and there are none.
- The CLI exercises `command`, `error`, `effect`, `main` and `|>` on real code. Gaps it finds (for
  example, variadic arguments) are written in plain TypeScript inside the `.efx` file and recorded.

## Alternatives considered

- **One phase-7 plan:** too large for one review, and its parts don't depend on one another.
- **A hand-written argument parser:** no dogfooding, and it would reinvent `effect/cli`.
- **Compile the CLI at publish time only:** `pnpm check`/`lint` would then not see the code that
  ships.
