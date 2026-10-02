# ADR-0034: `efx run` picks Bun only when the project can run `main` on Bun

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** agent ruling for Plan 9
- **Related:** spec §7.1, §7.2, §4.10; ADR-0021, ADR-0024

## Context

Spec §7.1 says that from npm, `efx run` "uses a local Bun if present, otherwise Node". The
compiler picks `main`'s runtime from the `runtime` option: on Bun, `main` imports
`@effect/platform-bun`. Most Node projects don't install that package, so following the spec
literally would break `main` programs on any machine that happens to have Bun.

## Decision

`efx run [--runtime node|bun] <file> …`:

- **`--runtime bun`:** runs `bun --preload effectscript/bun-preload <file>`. The preload registers
  the Bun plugin, which compiles `.efx` with `runtime: "bun"`.
- **`--runtime node`:** runs Node with `effectscript/register` (ADR-0021).
- **No flag:** Bun when it is on PATH and `@effect/platform-bun` resolves from the project, and
  Node otherwise.

The standalone binary (Plan 10) embeds Bun and always runs on it.

## Consequences

- A project set up for Bun gets Bun without a flag. Everyone else keeps today's Node behavior,
  and installing Bun never breaks a working project.
- `efx doctor` reports which runtime `efx run` will use.

## Alternatives considered

- **Bun whenever it is installed (the spec's wording):** it breaks `main` programs in Node
  projects.
- **Always Node unless `--runtime bun`:** Bun projects would always need the flag.
