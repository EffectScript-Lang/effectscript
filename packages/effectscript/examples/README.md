# EffectScript examples

A small app in EffectScript (`src/users.efx`, with its entry point `src/main.efx`) that runs on three paths:

- `efx run src/main.efx`, or `pnpm start`. This uses Bun when it is installed, since the package
  depends on `@effect/platform-bun` (ADR-0034). `efx run --runtime node src/main.efx` forces Node.
- Vitest, which runs the `.efx` tests through `effectscript/vite` (`vitest.config.ts`), with
  `pnpm test`.
- Bun, with `bun ./src/main.efx` or `pnpm test:bun`. The preload is set in `bunfig.toml`.

## Living docs

`src/bank.efx` is documented with doc comments written once at each definition (ADR-0042). Its
`` ```efx `` examples run as tests through one line in `test/bank.test.efx`:

```ts
doctest "../src/bank.efx"
```

`// => 70` checks a value, and `// => throws InsufficientFunds` checks a typed failure. A wrong
example fails with a diff at its own line in the doc comment.

`efx docs` writes the API pages to `docs/api/`. `efx init` sets up a Blume site in `docs/`, so
`npm run docs:dev` serves them.
