# EffectScript Plan 18: DX polish (phase 12)

> **For agentic workers:** execute task by task with TDD. Decisions are recorded in `docs/adr/`.
> Commit with explicit, gated paths (another session shares the branch).

**Goal:** the first hour with EffectScript has no rough edges. Every problem below was found by
using the packed release (Plan 17) or by a final review, and each has a person-visible symptom.

**Spec:** §4.17 (strict mode: `efx fix`, the strictest `tsconfig`), §7.1 (CLI), §7.5, §9.

**Decisions:** ADR-0056 (new), `efx fix`: what it rewrites and how it stays safe. ADR-0057 (new),
the CLI's defaults for a first run: quiet `efx run`, `efx init` writes a `tsconfig.json`, and
install hints name exact versions.

## Global Constraints

- Nothing is published. Brand files are never edited.
- `efx fix` never changes what a file compiles to: the rewritten `.efx` must compile to exactly the
  TypeScript the original compiled to (the round-trip contract, ADR-0030).
- Tests never touch the real HOME, editors or agent CLIs.

## Review Focus

1. **`efx fix` on mixed files:** sugar, comments and formatting outside the rewritten spans
   survive, and a file that doesn't compile is left alone. *(Task 3)*
2. **Quiet runs:** only Node's `stripTypeScriptTypes` warning is filtered. Other warnings, and
   errors, still print. *(Task 1)*
3. **`efx init` in an empty folder:** the `tsconfig.json` it writes type-checks `.efx` files with
   `efx check`, and an existing `tsconfig.json` is never replaced. *(Task 2)*
4. **Flag validation:** an unknown `--only` or `--agent` id, or a `--timeout` below 1, is refused
   with the valid choices, before anything is touched. *(Task 5)*
5. **The playground on a same-page share link:** opening a `#code=` link while on `/playground`
   loads it. *(Task 6)*

---

### Task 1: A quiet `efx run` (ADR-0057)

- `effectscript/register` drops Node's `ExperimentalWarning` for `stripTypeScriptTypes`, and only
  that warning.
- **Test:** `node --import effectscript/register app.efx` prints the program's output and nothing
  on stderr; a program's own `process.emitWarning` still reaches stderr.

### Task 2: `efx init` for a new project (ADR-0057)

- Without a `tsconfig.json`, `efx init` writes the strictest one (spec §4.17), with the plugin.
- The Install line lists `effect` and `@effect/platform-node` when they are missing (they are
  peers now, ADR-0055), and pins `effectscript` and `@effectscript/language` to the CLI's own
  version. The hints in `efx lsp`, `efx check` and `efx doctor` pin `@effectscript/language` too.
- **Tests:** the written `tsconfig.json`; `efx check` with it reports a type error in an `.efx`
  file; the Install line names the peers and the exact version; an existing `tsconfig.json` keeps
  its text.

### Task 3: `efx fix` (ADR-0056)

- `efx fix [paths] [--check]`: for each `.efx` file, compile it to TypeScript, convert that back
  to EffectScript, and keep the result only when it compiles to the identical TypeScript. Writes
  in place; `--check` only reports and exits 1 when a file would change.
- The EFX8101 hint names `efx fix` truthfully.
- **Tests:** an `Effect.gen` in an `.efx` file becomes an `effect` function; a file that is
  already canonical is unchanged; a file with errors is skipped and reported; `--check` exits 1
  and writes nothing.

### Task 4: The reverse compiler's multi-line `effect` arrow

- `effect () =>` with its body on the next line compiles to `function*() { return (\n …) }`
  (Plan 14's ASI fix). `toEffectScript` turns that back into the original arrow, not
  `effect () => { return (…) }`.
- **Test:** the round trip of a multi-line arrow is the identity.

### Task 5: Flag validation

- `efx setup --only <id>` and `efx convert --agent <id>` refuse an unknown id, listing the valid
  ones. `--timeout` below 1 is refused. `efx skill --global --dir` is refused as a conflict.
- **Tests:** each refusal, with exit code 1 and nothing written.

### Task 6: Playground and site polish

- A `hashchange` loads a share link on the same page; the preset menu says "Shared code" for one.
- "Link copied" only when the clipboard write succeeds; otherwise the link is shown to copy.
- A compile that takes over 5 seconds restarts the worker and says so.
- The Monaco editors have `ariaLabel`s. The landing's install block is highlighted as shell.
- **Tests:** the protocol pieces (hash parsing on change, the watchdog's timer logic) in
  `test/playground.test.ts`; then a browser check.
