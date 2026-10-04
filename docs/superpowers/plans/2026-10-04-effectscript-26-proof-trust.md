# EffectScript Plan 26: Trust: the model against the code, the kernel, the law lock (phase 20)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans. Steps use `- [ ]`. Execute task by task with TDD. Decisions are
> recorded in `docs/adr/`. Commit with explicit, gated paths:
> `pnpm check && pnpm lint && git commit <paths>`. Plans 24 and 25 must be done first. Bend at the
> pinned version is needed, as in Plan 25. Task 2 also needs Lean 4.34 (or `$BENDTT`).

**Goal:** every *proved* in `efx verify` is earned three ways:

- the model agrees with the compiled TypeScript on generated inputs;
- the proof can be rechecked by Bend's Lean-proven kernel (`--kernel`);
- the laws it proves can't change without a person accepting them (`laws.lock`).

Agents get `--explain` to start and repair proofs. Docs show each law's rung.

**Architecture:**

- **Differential testing** (`src/compiler/bend/convert.ts`, pure, and `src/cli/differential.ts`):
  - a `?samples` virtual module lists each modeled declaration's inputs (schemas) and a runner of
    the TypeScript;
  - Bend compiles `model.bend` to a `.mjs`;
  - generated converters move values between the two;
  - outcomes are compared as canonical JSON.
- **The kernel rung** reruns proofs with `bend --verdict`.
- **The lock** (`src/cli/lock.ts`) fingerprints law tokens.
- **`--explain`** writes a starter proof and prints Bend's goal.
- **`--json`** prints the verdicts as JSON for CI and for `efx docs --verdict`.

**Tech stack:** Bend `-o <file>.mjs` (ES module of non-IO defs), `effect/Arbitrary` (`sampleEffect`),
Node's register hooks, Lean 4.34 for the kernel.

**Spec:** `docs/superpowers/specs/2026-10-04-effectscript-proofs-design.md` §6–§8; ADR-0074–0076.

## Global Constraints

- **Comparisons:**
  - Values are compared as canonical JSON:
    - integers as decimal strings;
    - schema values as `{ "_tag"?: …, fields… }` with keys in declaration order;
    - lists as arrays;
    - `Option` as `{ "_tag": "None" }` or `{ "_tag": "Some", "value": … }`;
    - an exit as `{ "_tag": "Success", "value": … }` or
      `{ "_tag": "Failure", "error": { "_tag": <error name>, fields… } }`.
  - Generated integers stay within ±(2^47 − 1), Bend's compiled `Nat` limit, and the verdict says so.
- **The lock file** `laws.lock` is JSON with sorted keys:

  ```json
  { "version": 1, "laws": { "<file>#<name>": { "sha256": "…", "text": "…" } }, "files": { "<file>": { "sha256": "…" } } }
  ```

  - `text` is the law's source without comments, so a lock diff in a pull request shows the change.
  - A missing lock is a warning ("laws aren't locked: `efx verify --accept-laws` creates
    `laws.lock`"); once it exists, it is enforced.
- **Exact texts:**
  - **EFX9410:** "laws changed since laws.lock: <added/changed/removed list>. A person reviews them
    and runs `efx verify --accept-laws`"
  - **Kernel refused:** "kernel refused: <first line>". The law stays *proved*.
- **JSON output** holds only paths relative to the package root, no absolute paths, and has
  `"version": 1`.
- Nothing is published.

## Review Focus

1. **Values at the edges of the differential test:**
   - integers at ±(2^47 − 1), and 0 against `-0`;
   - empty lists;
   - strings with emoji;
   - nested ADTs;
   - a failure that carries fields;
   - `Option.none`.

   Each round-trips through the converters. *(Task 1)*
2. **Edits that must not trip the lock:**
   - whitespace or comment edits;
   - reordering laws.

   **Edits that must trip it:**
   - renaming a law (removed + added);
   - moving it to another file;
   - changing a predicate inside a `*.laws.efx` file.

   *(Task 3)*
3. **A kernel that refuses a proof bend2 accepts.** The law stays *proved* with the note. It is
   never *fails* or *tested*. *(Task 2)*
4. **`--explain` on a law that isn't provable** prints the root cause (Plan 25's `rootCause`) and
   writes no starter file. On a law that already has a working proof, it says so and changes
   nothing. *(Task 4)*
5. **JSON a dashboard can trust:**
   - laws are in a stable order (file, then line);
   - rungs and notes are exactly the text output's;
   - no absolute paths;
   - the efx and bend versions are included.

   *(Task 5)*

---

### Task 1: Differential testing

**Files:**
- Create: `packages/effectscript/core/src/compiler/bend/convert.ts`.
- Create: `packages/effectscript/core/src/doc/samples.ts`, which builds the `?samples` module, and
  extend `src/register.ts` for it, as for `?laws`.
- Create: `packages/effectscript/core/src/cli/differential.ts`.
- Modify: `packages/effectscript/core/src/cli/verify.ts` (step 7 of spec §6.1).
- Test: `packages/effectscript/core/test/differential.test.ts`, with fixture projects under
  `test/fixtures/differential/`.

**Interfaces:**

```ts
// convert.ts: the text of a JS module with one converter pair per type the model uses
export const convertersSource: (output: BendOutput, module: string) => string
// exports: toModel_<Type>(tsValue) and fromModel_<Type>(bendValue) → canonical JSON value,
// for Int, Bool, String, List, Maybe, Pair, every schema type, Errors and Exit<…>

// samples.ts: `<module>.efx?samples` = the module's source plus
//   export const $efxSamples = { <declaration>: { inputs: { <param>: <schema> }, run: (input) => <a call returning an Exit or a value> } }
// for each modeled, exported or not, non-service declaration
export const samplesSource: (file: string, source: string, modeled: ReadonlyArray<string>) => { readonly code: string; readonly diagnostics: ReadonlyArray<Diagnostic> }

// differential.ts
export interface Agreement { readonly declaration: string; readonly runs: number; readonly mismatch?: { readonly input: unknown; readonly ts: unknown; readonly model: unknown } }
export const compareModule: (module: string, options: { readonly runs: number; readonly seed: number | undefined }) => Promise<ReadonlyArray<Agreement>>
```

**Steps of `compareModule`:**

1. Build `model.bend -o <tmp>/model.mjs` and import it.
2. Write `convertersSource` to `<tmp>/converters.mjs` and import it.
3. Import `<module>.efx?samples`.
4. For each declaration a *proved* law reaches:
   - sample `runs` inputs with `Arbitrary.sampleEffect`, over the inputs' schemas, filtered to
     integers within ±(2^47 − 1);
   - run both sides;
   - compare the canonical JSON.

   The first mismatch stops that declaration.

In `verify.ts`:

- a mismatch turns every law reaching that declaration into *fails*, with the note
  "model disagrees with the code on <input>: TypeScript <ts>, model <model>";
- agreement adds "model agrees on <n> inputs" to each *proved* law;
- the default `n` is 100, set by `--runs`.

- [ ] **Step 1: Write the failing tests**
  - **`agree/`:** Plan 24's `bank.efx` with a real proof. The verdict has
    "model agrees on 100 inputs".
  - **`disagree/`:** the same project, with a test-only `EFX_BEND_MODEL_HOOK` environment variable
    that names a script `differential.ts` runs on `model.bend` before compiling it. The script
    replaces `Efx.Int.sub(balance, amount)` with `Efx.Int.sub(amount, balance)`, the spike's
    mutation A. Expect *fails*, with an input and both outputs, and exit 1.
  - **Converters:** an edge-values test per Review Focus 1 that builds TS values, converts them to
    the model and back, and expects canonical JSON equality. It skips without Bend, because it needs
    `-o .mjs`.
- [ ] **Step 2: Run them and see them fail.** Run:
  `pnpm test --run --project effectscript packages/effectscript/core/test/differential.test.ts`
- [ ] **Step 3: Implement** `convert.ts`, `samples.ts`, `differential.ts`, and verify's step 7.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Commit**

```bash
pnpm check && pnpm lint && git commit packages/effectscript/core/src/compiler/bend/convert.ts packages/effectscript/core/src/doc/samples.ts packages/effectscript/core/src/register.ts packages/effectscript/core/src/cli/differential.ts packages/effectscript/core/src/cli/verify.ts packages/effectscript/core/test/differential.test.ts packages/effectscript/core/test/fixtures/differential -m "feat(effectscript): efx verify tests the Bend model against the compiled code (Plan 26 Task 1, ADR-0074)"
```

### Task 2: The kernel rung (`--kernel`)

**Files:**
- Modify: `packages/effectscript/core/src/cli/bend.ts` (`findKernel`).
- Modify: `packages/effectscript/core/src/cli/verify.ts` (step 6).
- Modify: `packages/effectscript/core/src/cli/main.efx` (`--kernel`), then `pnpm codegen`.
- Modify: `.github/workflows/effectscript-proofs.yml`. Add an optional `kernel` job that:
  - installs elan and `leanprover/lean4:v4.34.0`;
  - caches `~/.elan` and `~/.bend/bendtt`;
  - runs `efx verify --check --kernel` in the examples.
- Test: `packages/effectscript/core/test/verify.test.ts`.

**Interfaces:**

```ts
export const findKernel: (env?: NodeJS.ProcessEnv) => { readonly bendtt?: string } | undefined
// $BENDTT if set; else undefined when neither ~/.elan/toolchains/leanprover--lean4---v4.34.0 nor `lean` is on PATH
```

**Behavior of `--kernel`:**

- Each *proved* law is rerun with `runBend(…, { verdict: true })`, with `BENDTT` passed through.
- Checked makes it *proved, kernel*.
- Anything else keeps it *proved*, with "kernel refused: <first line>".
- With no kernel, a warning says how to get one:
  - `elan toolchain install leanprover/lean4:v4.34.0`;
  - or set `$BENDTT` to a kernel built from Bend's `bendtt.lean` with `lean -c` and `leanc`
    (Lean 4.34.1 worked in the spike).

- [ ] **Step 1: Write the failing tests.**
  - **Fake bend:** it answers `--verdict` with `ALL PROOFS CHECK` for one file, and with
    `SOME PROOFS FAIL\nSorry - this is a mismatch …` for another. Expect *proved, kernel* and
    *proved* with the note.
  - **Real kernel** (`skipIf(findKernel() === undefined)`): the examples' bank proofs are *proved,
    kernel*.
- [ ] **Step 2–4:** fail, implement, `pnpm codegen`, PASS.
- [ ] **Step 5: Commit**

```bash
pnpm codegen && pnpm check && pnpm lint && git commit packages/effectscript/core/src/cli/bend.ts packages/effectscript/core/src/cli/verify.ts packages/effectscript/core/src/cli/main.efx packages/effectscript/core/src/cli/main.ts packages/effectscript/core/test/verify.test.ts .github/workflows/effectscript-proofs.yml -m "feat(effectscript): efx verify --kernel rechecks proofs with Bend's proven kernel (Plan 26 Task 2, ADR-0074)"
```

### Task 3: The law lock

**Files:**
- Create: `packages/effectscript/core/src/cli/lock.ts`.
- Modify: `packages/effectscript/core/src/cli/verify.ts` (step 1).
- Modify: `packages/effectscript/core/src/cli/main.efx` (`--accept-laws`).
- Test: `packages/effectscript/core/test/lock.test.ts`.

**Interfaces:**

```ts
export interface Lock { readonly version: 1; readonly laws: Readonly<Record<string, { readonly sha256: string; readonly text: string }>>; readonly files: Readonly<Record<string, { readonly sha256: string }>> }
export const fingerprintLaws: (file: string, source: string) => Lock   // this file's part of the lock
export const compareLock: (locked: Lock | undefined, current: Lock) => { readonly added: ReadonlyArray<string>; readonly changed: ReadonlyArray<string>; readonly removed: ReadonlyArray<string>; readonly files: ReadonlyArray<string> }
export const readLock: (root: string) => Lock | undefined
export const writeLock: (root: string, lock: Lock) => void
```

**The fingerprints:**

- A law's fingerprint is the sha256 of its tokens, from `parse(source, { tokens: true })`, from the
  `law` keyword (or `export`) to its closing brace, joined by one space. That ignores comments and
  whitespace.
- A `*.laws.efx` file is fingerprinted from all its tokens.

- [ ] **Step 1: Write the failing tests:**
  - an unchanged source → no differences;
  - a whitespace or comment edit → none;
  - reordered laws → none;
  - a changed `requires` → changed;
  - a renamed law → removed + added;
  - a changed predicate in `order.laws.efx` → `files` lists it;
  - `verify` with a mismatch → EFX9410 and exit 1;
  - `--accept-laws` → writes the lock and exits 0;
  - a missing lock → a warning and exit 0.
- [ ] **Step 2–4:** fail, implement, `pnpm codegen`, PASS.
- [ ] **Step 5:** Run `efx verify --accept-laws` in `packages/effectscript/examples` and commit the
  first `laws.lock` along with the code.

```bash
pnpm codegen && pnpm check && pnpm lint && git commit packages/effectscript/core/src/cli/lock.ts packages/effectscript/core/src/cli/verify.ts packages/effectscript/core/src/cli/main.efx packages/effectscript/core/src/cli/main.ts packages/effectscript/core/test/lock.test.ts packages/effectscript/examples/laws.lock -m "feat(effectscript): laws.lock: a law can't change without a person accepting it (Plan 26 Task 3, ADR-0075)"
```

### Task 4: `efx verify --explain <law>`

**Files:**
- Modify: `packages/effectscript/core/src/cli/verify.ts` (the `explain` branch).
- Modify: `packages/effectscript/core/src/cli/main.efx` (`--explain <law>`).
- Test: `packages/effectscript/core/test/verify.test.ts`.

**Interfaces.** `--explain <law>` prints:

1. the law's doc sentence and its source;
2. the model defs it reaches, one per line, as `<def>    <file>:<line>`;
3. the goal.

**How it finds the goal:**

- **No proof file:** it writes `<law>.proof.bend`, then runs Bend on it and prints the
  `- expected : …` goal and the context. The file contains:

  ```python
  import Base
  import ../_efx/prelude.bend as Efx
  import ../_efx/errors.bend as Err
  import ./types.bend as T
  import ./model.bend as M
  import ./claims.bend as C
  import ./<law>.law.bend as Laws

  # PROOF: <law>. Start from the goal Bend prints for ?goal.
  def Laws.<law>(<params>):
    ?goal
  ```

- **Failing proof file:** it prints Bend's error block unchanged.
- **Checking proof file:** it prints "<law> is proved" and writes nothing.
- **Law that isn't provable:** it prints the root cause and writes nothing.

- [ ] **Step 1: Write the failing tests.** The four cases above, with the fake bend printing a fixed
  `?goal` block. With real Bend: the starter file's goal for `withdrawNeverNegative` contains
  `C.withdrawNeverNegative(balance, amount)`.
- [ ] **Step 2–4:** fail, implement, `pnpm codegen`, PASS.
- [ ] **Step 5: Commit**

```bash
pnpm codegen && pnpm check && pnpm lint && git commit packages/effectscript/core/src/cli/verify.ts packages/effectscript/core/src/cli/main.efx packages/effectscript/core/src/cli/main.ts packages/effectscript/core/test/verify.test.ts -m "feat(effectscript): efx verify --explain starts and shows a proof's goal (Plan 26 Task 4)"
```

### Task 5: `--json`, and laws in `efx docs`

**Files:**
- Modify: `packages/effectscript/core/src/cli/verify.ts` (`--json`).
- Modify: `packages/effectscript/core/src/doc/model.ts`. Laws become declarations of kind `"law"`,
  with their doc sentence.
- Modify: the Markdown renderer under `src/doc/`. Add a "Laws" section per module, with a rung badge
  when `--verdict <file>` is given.
- Modify: `packages/effectscript/core/src/cli/main.efx` (`docs --verdict <file>`).
- Modify: `docs/superpowers/specs/2026-10-03-effectscript-docs-design.md`. Its `requires`/`ensures`
  fact rows become laws, linking ADR-0075.
- Test: `packages/effectscript/core/test/verify.test.ts`, plus `docs` tests under
  `test/docs/fixtures/` with a laws fixture and its Markdown snapshot.

**Interfaces:**

```json
{ "version": 1, "efx": "<version>", "bend": "<version or null>",
  "laws": [ { "file": "src/bank.efx", "line": 10, "name": "withdrawNeverNegative", "sentence": "…",
              "rung": "proved, kernel", "notes": ["model agrees on 100 inputs"] } ] }
```

Laws are sorted by file, then line. `efx docs --verdict verdict.json` shows a badge per law: "proved
(kernel)", "proved", "tested" or "fails".

- [ ] **Step 1: Write the failing tests:**
  - the JSON shape and its order;
  - no absolute paths;
  - the docs snapshot with a "Laws" section.
- [ ] **Step 2–4:** fail, implement, `pnpm codegen`, PASS.
- [ ] **Step 5: Commit**

```bash
pnpm codegen && pnpm check && pnpm lint && git commit packages/effectscript/core/src/cli packages/effectscript/core/src/doc packages/effectscript/core/test docs/superpowers/specs/2026-10-03-effectscript-docs-design.md -m "feat(effectscript): efx verify --json, and laws with their rung in efx docs (Plan 26 Task 5)"
```

### Task 6: Prelude: `String` lemmas, and the lemmas Plan 25 deferred

**Files:**
- Modify: `packages/effectscript/core/bend/prelude.bend`, then `pnpm codegen`.
- Test: `packages/effectscript/core/test/bend-prelude.test.ts` (Bend still prints ALL PROOFS CHECK).

**Lemma statements** (prove each; the executing agent uses Bend):

```python
law Word.cmp_refl:
  for n: Nat
  for +w: Word(n)
  {Word.cmp(n, w, w) == EQ{} : Cmp}

law U32.eq_refl:
  for +x: U32
  {U32.is_eq(x, x) == True{} : Bool}

law Char.eq_refl:
  for +c: Char
  {Char.is_eq(c, c) == True{} : Bool}

law String.eq_refl:
  for +s: String
  {String.eq(s, s) == True{} : Bool}
```

Read `String.eq` → `String.order` → `String.cmp` in Base (`bend base String`) before starting.
`String.cmp` is defined through a law and `.rec`/`.fin` helpers. The same five-round rule as
Plan 25 applies: record what doesn't fit, and leave no open law in the prelude.

- [ ] **Step 1:** add the laws; Bend prints `SOME PROOFS FAIL … TODOs`.
- [ ] **Step 2:** prove them until Bend prints ALL PROOFS CHECK.
- [ ] **Step 3:** run `pnpm codegen` and the prelude test. Expected: PASS.
- [ ] **Step 4: Commit**

```bash
pnpm codegen && pnpm check && pnpm lint && git commit packages/effectscript/core/bend/prelude.bend packages/effectscript/core/src/compiler/bend/preludeText.ts -m "feat(effectscript): prelude lemmas for String equality (Plan 26 Task 6)"
```

### Task 7: The skill: writing and repairing proofs

**Files:**
- Create: `packages/effectscript/core/skills/effectscript/references/proofs.md`.
- Modify: `packages/effectscript/core/skills/effectscript/SKILL.md`. Link it from the "Laws and
  proofs" section.
- Test: `packages/effectscript/core/test/skill.test.ts` (links resolve; the reference is listed).

**Contents of `proofs.md`:**

- **Roles:** humans write laws; agents write `*.proof.bend` and `lemmas.bend`; never edit
  generated files, `laws.lock` or `*.laws.efx`; never run `--accept-laws`.
- **The loop:** `efx verify --explain <law>`, then write a step, then `efx verify --law <law>`.
- **Patterns.** Each gets a short real snippet from `packages/effectscript/examples/proofs/`, cited
  by path. Snippets are copied, not invented.
  - induction by matching and recursing (the order example);
  - the convoy pattern for a lifted `if` (`withdraw.if0`);
  - rewriting with `%Equal.sym(…) : <goal with _>`, with the goal copied from `?goal`;
  - refuting `True == False` with `Efx.Bool.true_ne_false`;
  - generalizing before induction (`neverShippedUnpaid`'s lemma);
  - using prelude lemmas (`Int.eq_refl`, `Int.not_gt_sub_ge_zero`).
- **Limits:**
  - keep big constants abstract (the checker counts in unary);
  - there are no tactics;
  - a timeout means the goal is being computed, so step back and generalize.
- **When a law looks false:** stop, report the counterexample (`efx verify` prints it), and never
  weaken the law.

- [ ] **Step 1: Write it, then run** `pnpm codegen && pnpm test --run --project effectscript packages/effectscript/core/test/skill.test.ts`.
  Expected: PASS.
- [ ] **Step 2: Commit**

```bash
pnpm codegen && pnpm lint && git commit packages/effectscript/core/skills -m "docs(effectscript): the skill teaches writing and repairing proofs (Plan 26 Task 7)"
```

### Task 8: Spec and ADR updates

- [ ] **Step 1:** Update the main spec:
  - §7.1: `efx verify`'s `--kernel`, `--explain`, `--json` and `--accept-laws`;
  - §12: EFX9410.

  Check the proofs spec §6 against what was built, and fix it in place where an execution ruling
  changed it, citing the ruling.
- [ ] **Step 2: Commit**

```bash
git commit docs/superpowers/specs -m "docs(effectscript): the proofs spec matches Plan 26 (Plan 26 Task 8)"
```
