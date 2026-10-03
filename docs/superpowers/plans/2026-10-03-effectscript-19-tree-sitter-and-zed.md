# EffectScript Plan 19: A tree-sitter grammar, and Zed (phase 13)

> **For agentic workers:** execute task by task with TDD. Decisions are recorded in `docs/adr/`.
> Commit with explicit, gated paths (another session shares the branch).

**Goal:** editors that highlight with tree-sitter (Neovim, Helix, Zed) understand EffectScript.

- **Today:** they borrow TypeScript's grammar, which turns every `effect`, `schema`, `|>` or
  `match` into an ERROR node, so highlighting, folding and indentation break inside them.
- **Zed** has only instructions, because a Zed language needs a tree-sitter grammar and an
  extension.

**Spec:** §7.4 (editors), §4.19 (the syntax triggers), §7.5 (`efx setup`).

**Decisions:** ADR-0058 (new): the grammar extends `tree-sitter-typescript`, is developed here,
and is published with its generated parser to `EffectScript-Lang/tree-sitter-effectscript`. The
Zed extension starts `efx lsp`. Builds on ADR-0040 (`efx lsp`), ADR-0052 (`efx setup`) and
ADR-0036 (coordinates).

## Global Constraints

- **The grammar is a superset of TypeScript's,** so valid TypeScript parses to the same tree as
  with `tree-sitter-typescript`, the way the compiler keeps the superset guarantee (§4.19).
- **The generated parser isn't committed here** (it is several megabytes). The grammar, scanner,
  queries and tests are, and `tree-sitter generate` rebuilds it.
- **Tests never touch the user's editors:** Neovim runs headless with `--clean`; Zed is only
  built, never installed into the user's Zed.
- **Nothing is published:** the grammar repository and the Zed extension are runbook steps.

## Review Focus

1. **No ERROR nodes** in any `.efx` the project ships: compiler fixtures, examples, site samples,
   the skill's examples. *(Tasks 2, 3)*
2. **TypeScript stays TypeScript:** a sample of `packages/effect/src` parses to the same
   s-expression as with `tree-sitter-typescript`. *(Task 1)*
3. **Contextual keywords:** `effect`, `schema`, `error`, `service`, `match`, `test`… used as
   ordinary identifiers in valid TypeScript (`const effect = 1`, `schema.parse(x)`) stay
   identifiers. *(Task 2)*
4. **Highlighting:** in Neovim, `effect`, `throws`, `schema` and `|>` get keyword or operator
   captures, and TypeScript's captures still apply. *(Task 4)*
5. **The Zed extension builds,** and its language server command is `efx lsp`. *(Task 5)*

---

### Task 1: Scaffold, and the superset test

- `packages/effectscript/tree-sitter` (`tree-sitter-effectscript`, private for now):
  `grammar.js` extending `tree-sitter-typescript/typescript/grammar`, `src/scanner.c` with the
  vendored TypeScript scanner, and `tree-sitter.json`.
- `pnpm-workspace.yaml`: allow `tree-sitter-cli`'s install script (it downloads the CLI), and not
  the grammar packages' native builds.
- **Tests (Vitest):** `tree-sitter generate` succeeds; a sample of `packages/effect/src` files
  parses to the same tree as with TypeScript's grammar.

### Task 2: Declarations

- `effect` functions, blocks, arrows and methods; `throws` and `needs` clauses; `error`, `schema`
  (fields and unions), `service` (with `layer` members), `layer`, `config`, `atom`, `main`,
  `defer`.
- **Tests:** a tree-sitter corpus (`test/corpus/*.txt`) per construct; identifiers named like the
  keywords stay identifiers.

### Task 3: Library constructs and expressions

- `test`, `describe` (with `.live`, `.skip`, `.only`, `with`), `doctest`, `command` with
  `--name` parameters, `group` routes and `middleware`, `api`, `impl`, `match`/`when`/`default`,
  `|>` and `%`, and `throw` and `do` in expression position.
- **Tests:** the corpus, then every shipped `.efx` file parses without ERROR or MISSING nodes.

### Task 4: Queries and Neovim

- `queries/effectscript/{highlights,locals,injections,folds,indents}.scm`: TypeScript's queries,
  plus EffectScript's keywords and operators.
- **Test:** headless Neovim loads the built parser (`tree-sitter build`) and the queries, and a
  `.efx` buffer has the expected captures.

### Task 5: Zed

- `packages/effectscript/zed`: `extension.toml`, a Rust `zed_extension_api` crate whose language
  server is `efx lsp` (found on PATH), and `languages/effectscript/` (config and queries).
- **Test:** `cargo build --target wasm32-wasip2` (opt-in when the target is installed); the
  extension's queries are the grammar's.

### Task 6: `efx setup`, docs and the runbook

- `efx setup`: Neovim and Helix configs use the grammar; Zed says how to install the extension.
- The language README's editor section, the site's editor guide (generated from it), and
  `RELEASING.md` steps for the grammar repository and the Zed extension.
- ADR-0058, spec §7.4 status, COMPATIBILITY, and this plan's execution record.

---

## Execution record

**Rulings:**

- **Tasks 2 and 3 were one change:** the declarations and expressions share rules and conflicts.
- **The superset test compares files `tree-sitter-typescript` parses cleanly.** On its own ERROR
  files the two grammars recover differently, and error recovery isn't a contract.
- **`await a |> f` parses as `(await a) |> f`;** the compiler awaits the whole pipeline. Matching
  it needs more than precedence, and highlighting is the same.
- **Several `catch` clauses per `try`** (ADR-0010); a single-catch `try` keeps TypeScript's tree.
- **One self-contained `highlights.scm`** in the order Neovim and Zed expect (later patterns win),
  and a Helix variant that inherits Helix's TypeScript queries after EffectScript's patterns.
- **`efx setup` writes the grammar settings only after the grammar repository is published:** a
  config naming an unpublished repository fails. The README documents them, with
  `scripts/export.mjs` as the local stand-in, and `efx setup` now points Zed users at the extension.
- **The wasm32-wasip2 build test is opt-in:** installing a rustup target changes the user's
  toolchain. `cargo test` checks the crate on the host, and Zed builds the wasm itself.
- **The Zed extension starts the project's `efx`, then PATH's.**

**Found while doing it:** named precedences only compare within one list, so `|>` first had no
relation to calls or `+`; the auto-added conflicts hid that, and the trees were wrong until the
pipeline joined JavaScript's operator list.

**Final review (fresh reviewer, 2 Critical, 8 Important), fixed in one pass with tests that failed
first:** keywords are type names where TypeScript reads one (`Schema.make<typeof schema>(` in
Effect's own source broke), and the superset test covers every effect source file; the Neovim
queries drop `#is-not? local`; Helix gets self-contained queries in reverse pattern order, tested
in Helix itself; `defer(x)` and a split `do … while` stay TypeScript; `|>` binds between `??` and
the conditional, as in the compiler; five valid EffectScript forms parse; export keeps a clone's
history; the parser is generated once under a lock; Neovim and Helix get folds and indents.

**Deferred minors:** the Zed `rev` isn't checked to be a SHA; the runbook's submodule details and
step order for Zed; `release.ts` leaves `Cargo.lock` and `tree-sitter.json` versions; `efx setup`
names an unpublished Zed extension; no Zed `overrides.scm`; unnecessary-conflict warnings, ABI 15,
and the CLI's lock files in `~/.cache`.
