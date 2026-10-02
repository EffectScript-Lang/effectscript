# EffectScript Plan 8: The `efx` CLI

> **For agentic workers:** execute task by task with TDD. Decisions are recorded in `docs/adr/`.
> Gate every commit: `pnpm check && pnpm lint && git commit …`.

**Goal:** A dogfooded `efx` CLI, written as EffectScript `command` modules on `effect/cli`, with
seven commands: `build`, `check`, `run`, `print`, `convert` (the mechanical whole-project pass, with
verification and revert), `init` and `doctor`.

**Architecture:**

- `src/cli/*.efx` hold the commands. `pnpm codegen` compiles them into checked-in, dprint-formatted
  `src/cli/*.ts`, and a test fails on stale output.
- TypeScript engines do the work:
  - `src/cli/build.ts` (exists);
  - `src/convert/plan.ts`: file selection, import rewriting and reports, as pure functions;
  - `src/convert/project.ts`: git, files and verification.
- `src/cli/main.efx` holds the root `efx` command with subcommands and a `main` block.
  `bin/efx.js` imports the compiled entry.
- Exit codes travel as `ExitCode` failures, read through `Runtime.errorExitCode` (ADR-0032).

**Spec:** §7.1, §7.5 (`efx convert`), §13 phase 7a.

**Decisions:** ADR-0032, ADR-0022 (build), ADR-0030 (conversion safety), ADR-0021 (`run` on Node).

## Global Constraints

- `effectscript/compiler` stays browser-safe and free of `effect` imports. Only `src/cli/**`
  imports `effect`.
- Every command works without TypeScript installed, except `build` and `check`, which say how to
  install it (review I7 of Plan 3).
- `convert --write` never touches a dirty working tree without `--force`, and never loses work.
  It runs on a new branch, and a file that fails verification is reverted.
- The existing `cli.test.ts`, `bin.test.ts` and `language/test/adoption.test.ts` keep passing.

## Review Focus

1. Running `efx` with no arguments, `--help` and `--version` gives useful output and exit code 0.
   An unknown command prints help and exits 1. *(Task 2)*
2. `efx convert` in a non-git directory or on a dirty tree refuses with a clear message and
   writes nothing. *(Task 4)*
3. During `convert`, imports of renamed files are rewritten in every file that imports them,
   whatever the specifier spelling: `./x`, `./x.js`, `./x.ts` or `./x/index.ts`. `.d.ts` files,
   `node_modules` and `*.config.ts` are never renamed. *(Task 4)*
4. When verification fails after `convert`, the files that break it are reverted, and the rest
   stay converted. *(Task 4)*
5. `efx init` is idempotent: running it twice changes nothing the second time. It keeps unrelated
   tsconfig and package.json content, and it preserves JSON comments in tsconfig. *(Task 5)*

---

### Task 1: Dependencies and the codegen pipeline

- Add `effect` and `@effect/platform-node` (`workspace:^`) to `dependencies`.
- Add `scripts/compile-cli.ts`. It compiles each `src/cli/*.efx` with
  `rewriteImportExtensions: "ts"` and writes the `.ts` next to it with a generated-file header.
  `codegen` runs it and then `dprint fmt`.
- Add `test/cli-codegen.test.ts`: for each `.efx`, compile it, format it with
  `dprint fmt --stdin`, and compare with the checked-in `.ts`.
- **Test:** the codegen test fails on a deliberately stale file and passes after
  `pnpm codegen`.

### Task 2: Root command, `build`, `check`, `run`

- `src/cli/main.efx` declares:
  - `error ExitCode { code: number }` with `get [Runtime.errorExitCode]()`;
  - `command build(--project?: string)` → `build.ts`;
  - `command check(…args)` and `command run(file, …args)` → the existing spawns, failing with
    `ExitCode` on a non-zero status. Variadic arguments use plain `Argument.variadic`, a recorded
    gap in the `command` construct;
  - the root `command efx() |> withSubcommands([...])`;
  - `main { await Command.run(efx, { version }) }`.
- `bin/efx.js` imports the compiled entry (dist or src).
- **Tests:**
  - `bin.test.ts` is updated;
  - `cli.test.ts` passes unchanged;
  - `efx --version` prints the package version;
  - an unknown command exits 1.

### Task 3: `efx print`

- `efx print <file> [--to ts|efx]` prints the conversion to stdout. The default target is TS for
  `.efx` input and EffectScript otherwise.
- With `--to efx`, the `toEffectScript` notes go to stderr.
- **Tests:** printing an `.efx` file and a `.ts` file, and `--to` overriding the default.

### Task 4: `efx convert` (mechanical pass)

- **Planner (`plan.ts`, pure):**
  - Given `{ path → source }`, it chooses the files to convert: `.ts`/`.tsx` whose
    `toEffectScript` output differs from the input, excluding `.d.ts`, `node_modules`,
    `*.config.*` and files outside the given paths.
  - It computes renames `x.ts → x.efx`.
  - It rewrites relative specifiers that resolve to a renamed file (`./x`, `./x.js`, `./x.ts`,
    `./x/index…`) in every project file to `./x.efx`, and in `export … from` and literal
    `import()` too.
  - It returns a report: converted files, notes per file, and untouched files with their
    reasons.
- **Command:**
  - `efx convert [paths…] [--write] [--explain] [--force] [--no-verify] [--test <cmd>]`.
  - Without `--write`, it prints the report. With `--write`, it requires a git repository and a
    clean tree (unless `--force`), creates the branch `effectscript/convert`, and applies the
    changes with `git mv` plus file writes.
  - It then verifies with `efx check` and the test command (`--test`, or the package `test`
    script). On failure, it reverts converted files one at a time, newest first, until the
    project verifies, and reports which ones were reverted.
- **Tests:**
  - planner unit tests for every specifier form;
  - a temporary git repository end to end: a dirty tree refuses, a write creates the branch and
    the renamed files, and a file that breaks the test command gets reverted.

### Task 5: `efx init`

- **Writes:**
  - adds the `@effectscript/language` TS plugin to `tsconfig.json` (comments preserved, via text
    edits);
  - adds `"check": "efx check"` and `"build:efx": "efx build"` scripts when absent;
  - prints the install command for missing dev dependencies.
- **Afterwards:** prints the next steps, `efx convert` (and `efx setup` once Plan 10 lands).
- **Tests:**
  - idempotence;
  - JSONC comments are kept;
  - existing scripts are never overwritten.

### Task 6: `efx doctor`

- Reports, each line `ok` or `missing` with the fix:
  - the Node version (≥ 22.18), Bun if present, and TypeScript 6 if present;
  - `@effectscript/language`, the tsconfig plugin, and the `effect` version against a
    `// @effect X.Y` header.
- Exits 0 when nothing required is missing.
- **Tests:** a configured project reports all ok; an empty directory lists what is missing and
  exits 1.

### Task 7: Docs

- Spec §7.1: what's implemented and the recorded construct gaps.
- COMPATIBILITY rows.
- This plan's execution record.

---

## Execution record

**Rulings:**

- Task 1 was folded into Task 2: the codegen check needs a `.efx` module to test.
- **Generated CLI files:**
  - They get an oxlint override for `no-import-from-barrel-package`, because the forward
    compiler emits barrel imports by design.
  - The codegen script formats through dprint itself and has a `--check` mode, which the test
    runs.
- **Help:** `efx` with no arguments shows the help (`runWith(["--help"])` from `main`). A root
  handler that referenced `efx` made it implicitly `any`.
- **Arguments:** `check` and `run` forward extra arguments after `--`. `build` and `check` keep
  `-p` as an alias for existing callers.
- **`convert`:**
  - It renames only files the reverse compiler changes, leaving `.d.ts`, `*.config.*` and
    `node_modules` alone.
  - It runs `efx check` only when a tsconfig.json exists.
- **Compiler changes found by dogfooding:**
  - `override` and `super` are allowed in `schema`/`error`/`service` bodies.
  - `toEffectScript` moved to `reverse/convert.ts`, since the barrel rule flags `index.ts`
    modules.
