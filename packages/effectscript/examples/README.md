# EffectScript examples

A small app in EffectScript (`src/users.efx`, with its entry point `src/main.efx`) that runs on three paths:

- `efx run src/main.efx`, or `pnpm start`. This uses Bun when it is installed, since the package
  depends on `@effect/platform-bun` (ADR-0034). `efx run --runtime node src/main.efx` forces Node.
- Vitest, which runs the `.efx` tests through `effectscript/vite` (`vitest.config.ts`), with
  `pnpm test`.
- Bun, with `bun ./src/main.efx` or `pnpm test:bun`. The preload is set in `bunfig.toml`.
