# EffectScript Plan 9: Bun and Vite Integrations, Examples

> **For agentic workers:** execute task by task with TDD. Decisions are recorded in `docs/adr/`.
> Gate every commit: `pnpm check && pnpm lint && git commit …`.

**Goal:** `.efx` runs and is tested natively on Bun (`bun run`, `bun test`) and on Vite, Vitest
and Astro, through `effectscript/bun` and `effectscript/vite`. `efx run` picks Bun when the project
can run on it (ADR-0034). A private examples package proves all three paths.

**Architecture:**

- **`src/bun.ts`:** a structural `BunPlugin`, with `onLoad` for `.efx` → `{ contents, loader }`
  compiled with `runtime: "bun"`, and `onResolve` for extensionless relative specifiers that
  name an `.efx` file.
- **`src/bun-preload.ts`:** calls `Bun.plugin(efx())`.
- **`src/vite.ts`:** `efx(options?)`, with `enforce: "pre"`.
  - It adds `.efx` to `resolve.extensions`.
  - `transform` compiles `.efx` and returns the TS with its map and `moduleType: "ts" | "tsx"`,
    so Vite's own oxc pass strips the types and chains the source maps.
  - The runtime is `browser` for client code and `node` for SSR/Vitest.
- **Examples:** `packages/effectscript/examples` (private), with an app, `.efx` tests on Vitest,
  and a Bun test.

**Spec:** §7.1 (`efx run`), §7.2, §13 phase 7b. **Decisions:** ADR-0034, ADR-0021.

## Global Constraints

- `effectscript/compiler` stays browser-safe. `bun.ts` and `vite.ts` import nothing from Bun or
  Vite at runtime; they use structural types only.
- Compile errors surface as errors that carry the formatted EFX diagnostic, with file, line and
  column. They never become silent TS.
- Bun tests run only when `bun` is installed (they are skipped otherwise). The same goes for the
  examples' Bun test.

## Review Focus

1. A compile error in an `.efx` file fails the Bun load and the Vite transform with the EFX code
   and its position, and the dev server shows it. *(Tasks 1, 3)*
2. Source maps: a runtime error thrown in `.efx` code under Vitest reports the `.efx` line.
   *(Task 3)*
3. Query ids (`?import`, `?v=…`) and virtual modules never reach the compiler. *(Task 3)*
4. Extensionless `.efx` imports resolve under Bun, `./x` → `./x.efx`, without breaking `.ts`
   resolution. *(Task 1)*
5. With no flag, `efx run` stays on Node in a project without `@effect/platform-bun`, even when
   Bun is installed. *(Task 2)*

---

### Task 1: `effectscript/bun` and the preload

- **Exports:** `./bun` and `./bun-preload`, with `publishConfig` mirrors.
- **Tests (skipped without Bun):**
  - `bun --preload <preload> run main.efx` runs a program with a `main` block and an
    extensionless `.efx` import;
  - `bun test --preload <preload>` runs a test file that imports `.efx`;
  - a compile error prints `EFX`, file and line.

### Task 2: `efx run --runtime`

- `run.ts` takes `runtime: "node" | "bun" | undefined` and resolves it per ADR-0034.
- `doctor` reports the runtime that `efx run` will use.
- **Tests:**
  - `--runtime node` uses Node;
  - `--runtime bun` uses Bun (skipped without Bun);
  - with no flag and no `@effect/platform-bun`, it uses Node.

### Task 3: `effectscript/vite`

- **Export:** `./vite`. Vite becomes an optional peer and a dev dependency.
- **Tests:**
  - a Vite `build()` of an app with `.efx` modules, in client and SSR builds (`main` excluded),
    produces JS;
  - a Vitest run of an `.efx` test file passes;
  - an EFX error fails with its code and position;
  - query ids are ignored;
  - a stack trace from `.efx` code points at the `.efx` line.

### Task 4: Examples package

- `packages/effectscript/examples` holds:
  - `src/app.efx` (service, schema, effects, `main`);
  - `test/app.test.efx` (`describe`/`test`);
  - `vitest.config.ts` (`effectscript/vite`);
  - `bunfig.toml` (the preload).
- It is registered as a root Vitest project.
- **Tests:**
  - the examples' Vitest project passes in the root suite;
  - `efx run src/app.efx` prints the expected output.

### Task 5: Docs

- Spec §7.2 status, COMPATIBILITY rows (Bun, Vite/Vitest), the README of the examples, and this
  plan's execution record.

---

## Execution record

**Rulings:**

- **Task 1 (Bun):** Bun 1.4's runtime `onResolve` fires only for entry points. So extensionless
  `.efx` imports resolve from `.efx` importers, rewritten in `onLoad`, and `.ts` importers write
  `./x.efx`. Bun runs `.efx` entries directly, because `bun run` treats them as script names.
- **Task 2 (`efx run`):** the `@effect/platform-bun` check walks `node_modules` instead of using
  `require.resolve`. Package managers set `NODE_PATH` for scripts, which made every project look
  Bun-ready.
- **Task 3 (Vite):** two plugins (compile, then `transformWithOxc`) rather than returning
  `moduleType`. `vite:oxc` only matches `.ts`/`.tsx`/`.jsx`/`.mts` ids, and separate transforms
  let Vite chain the source maps.
- **Task 4 (examples):** a library (`users.efx`) and an entry (`main.efx`), because importing a
  module that has a `main` block runs the program. The root package gains `effectscript` as a dev
  dependency for the Vitest project's plugin.
