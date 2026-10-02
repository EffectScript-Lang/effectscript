# EffectScript Plan 6: Reverse Compiler, Language Core

> **For agentic workers:** execute task by task with TDD. Decisions are recorded in `docs/adr/`.
> Gate every commit: `pnpm check && pnpm lint && git commit …`.

**Goal:** `toEffectScript` re-sugars every language-core shape in spec §6.2 (§4.1–4.13). It leaves
the §6.3 blockers as TypeScript with notes, and proves the §6.4 contract with an identity
harness.

**Architecture:** Same pipeline as ADR-0023:

1. Parse the TypeScript.
2. Analyze scopes.
3. Recognize Effect APIs by import origin.
4. Rewrite in place with magic-string.

Every rewrite obeys ADR-0030: the forward compiler, run with the same options, must reproduce the
input byte for byte. Only the two listed canonicalizations may differ. The test harness enforces
this on all golden fixtures and on the `ai-docs/src` corpus. `reverse/index.ts` is split by shape
family (`body.ts`, `effects.ts`, `imports.ts`, `classes.ts`, `service.ts`, `match.ts`, `main.ts`,
`pipes.ts`, `try.ts`), and each module mirrors its forward transform.

**Spec:** `docs/superpowers/specs/2026-10-02-effectscript-design.md` §6 (tables in §6.2, blockers in
§6.3, contract in §6.4).

**Decisions:** ADR-0009 (binding origin), ADR-0010 (`try` shape), ADR-0011, ADR-0012, ADR-0023,
ADR-0030 (identity rule), ADR-0031 (this plan's scope).

## Global Constraints

- The compiler stays browser-safe: no Node APIs in `src/compiler/**`.
- An API is recognized only through its import from `effect` (or the runtime module for `main`),
  never by spelling.
- `ConvertOptions` = `{ filename?, packageName?, packageRoot?, runtime?, prelude? }`, with the
  same defaults as `CompileOptions`. Tests compile and convert with the same options.
- Nothing is lost silently. A near miss leaves the node as TypeScript and pushes a `ConvertNote`
  with a reason. A canonicalization pushes a note that starts with `canonicalized:`.

## Review Focus

1. Lookalikes are never re-sugared: a user object named `Effect`, an inner-scope `Effect`, and a
   `Match` from another package all stay as written. *(Task 1 corpus + Task 2 tests)*
2. `.pipe` on a non-Effect value stays a method call. For example, Node's `readable.pipe(writable)`
   must never become `|>`. *(Task 4 test)*
3. Blocked generators stay TypeScript, but the generators nested inside them still convert:
   native `try` around `yield*`, plain `yield`, `arguments`, mismatched span names, span options,
   `this` in `fnUntraced`, and labels that cross a boundary. *(Task 2 tests)*
4. Comments survive inside re-sugared shapes: catch clauses, schema fields, match arms and
   service members. *(tests in Tasks 6–9)*
5. Hand-written formatting is still handled: multi-line `Effect.fn(\n"x"\n)`, trailing commas in
   pipes, and comments between arguments. These either convert or stay TypeScript with a note,
   and never produce efx that fails to compile. *(Task 1 corpus)*

---

### Task 1: Identity harness, options and module split

- **Split** `reverse/index.ts`:
  - `reverse/context.ts`: `ReverseCtx` plus `note(ctx, node, message)`.
  - `reverse/imports.ts`: import cleanup.
  - `reverse/body.ts`: generator bodies.
  - `reverse/effects.ts`: `Effect.fn`/`gen` forms.
  - `reverse/classes.ts`: schema/error classes.
- **Options:** add `ConvertOptions` (Global Constraints), exported from `effectscript/compiler`.
- **Fix the `throw` rule:** `return yield* new E(…)` → `throw new E(…)` only when `E` is a class
  this conversion turns into an `error` declaration. That is the forward rule (`localErrors`).
  Otherwise it becomes `return await new E(…)`.
- **Harness, `test/reverse-golden.test.ts`:** for every golden fixture, with the fixture's compile
  options:
  - `toTypeScript(toEffectScript(ts).code).code === ts`;
  - the reverse output matches the file snapshot `<name>.reverse.efx`. `listFixtures` must skip
    `*.reverse.efx`.
- **Corpus, `test/reverse-corpus.test.ts`:** for each `ai-docs/src/**/*.ts`:
  - conversion doesn't throw;
  - the output compiles with no `error` diagnostics;
  - without a `canonicalized:` note, it round-trips to identical bytes.
- **Tests:** the existing `reverse.test.ts` still passes, plus a Data.TaggedError case that
  becomes `return await new E()`.

### Task 2: Effect forms and blockers

- **Forms:**
  - `Effect.gen(function*() {…})` → `effect {…}`;
  - `Effect.gen({ self: this }, function*() {…})` → `effect {…}` (only when the body uses
    `this`, as in the forward rule);
  - `Effect.fnUntraced(function*(…) {…})` → `effect (…) => {…}`;
  - a body that is a single same-line `{ return e }` → `effect (…) => e`;
  - `Effect.fn.Return` on arrows → `throws`/`needs`;
  - object property `k: Effect.fn("k")(function*…)` → `effect k(…) {…}`, and with
    `Effect.fnUntraced` and a computed key → `effect [k](…) {…}`;
  - `const f = Effect.fn("f")(…)` + `export default f` → `export default effect f(…)`.
- **Bodies:**
  - `yield* Effect.all([..] | {..}, { concurrency: "unbounded" })` → `await [..]` / `await {..}`;
  - drop the parentheses around `yield*` only where the forward `needsParens` restores them;
  - `(yield* Effect.fail(e))` / `(yield* new E())` in expression position → `throw e` (the throw
    expression);
  - `(yield* Effect.gen(function*() { …; return e }))` → `do { …; e }` when the forward `do`
    lowering produces exactly that shape;
  - a native `throw e` at generator level → `return await die(e)`, with a `canonicalized:` note
    (ADR-0030).
- **Blockers (§6.3):** each leaves the generator as TypeScript and adds a note naming the blocker:
  - a native `try` containing `yield*`;
  - a plain `yield`;
  - `arguments`;
  - a span name that doesn't match the binding (or `Svc.x` inside a service);
  - span options (a second argument to `Effect.fn`);
  - `this` in an `fnUntraced` body;
  - a label crossing the generator boundary.

  Generators nested inside a blocked one still convert.
- **Tests:** one round trip per form, one test per blocker with its note, the nested-inside-blocked
  case, and the golden harness for the `effect/*` and `proposals/*` fixtures.

### Task 3: Types, builtins, service tags and prelude imports

- **Types:**
  - `X.X<…>` → `X<…>` for the bare-type set (§4.5) when `X` is the prelude's (imported from its
    prelude module, or about to be removed by the import cleanup);
  - `Effect.fn.Return<A[, E[, R]]>` everywhere it appears.
- **Builtins:** `Effect.x` → `x` in every Effect-namespace position (top level, effect bodies),
  under the forward `resolveValue` conditions:
  - `x` is in `effectExports`;
  - it is not in `excludedNames`;
  - it is not a prelude module or function name;
  - it is free in both namespaces at the use site.

  Positions in other namespaces (layer pipes, schema `=` fields) are left to their own tasks.
- **Service tags:** `yield* M.M` → `await M` for the `serviceTags` set.
- **Imports:**
  - An `effect` (or prelude-module) import specifier that is unaliased, a value import and a
    prelude name is removed when every reference to it is re-resolvable by the prelude.
  - A whole declaration is removed only when nothing but other removed prelude imports precedes it
    (no comment, no other import). Otherwise its specifiers stay.
  - Removing specifiers from a kept declaration produces the `canonicalized:` specifier-order note
    only when the forward compiler would re-append them in a different order.
- **Tests:** `prelude/builtins` golden identity; a shadowed `succeed` stays qualified; an import
  after `import "./polyfill"` is kept.

### Task 4: Pipelines

- `x.pipe(a, b)` → `x |> a |> b`, only when the forward `knownPipeable(x)` holds on the result, or
  `x` is a re-sugared effect form.
- `pipe(x, a, b)`, with `pipe` from `effect`, → `x |> a |> b`, only when the forward compiler
  would *not* treat `x` as pipeable.
- `($) => e` steps whose parameter is the forward topic name and occurs in `e` → `e` with `%`.
- Pipes on `Effect.fn` declarations keep the ADR-0023 rule.
- **Tests:** `pipeline/pipes` golden identity; `readable.pipe(writable)` stays; a user function
  named `pipe` stays.

### Task 5: Resources

- `yield* Effect.addFinalizer(() => e)` → `defer e`.
- `yield* Effect.addFinalizer(() => Effect.sync(() => {…}))` → `defer {…}`.
- Either conversion happens only when the enclosing form carries the scope the forward compiler
  would add:
  - the `Effect.scoped` first pipe of `Effect.fn`/`fnUntraced`;
  - the `Effect.scoped(Effect.gen(…))` wrapper;
  - a layer constructor (Task 8).

  When it converts, the scope is removed. Otherwise the finalizer stays `await addFinalizer(…)`
  and the scope stays an explicit `|> scoped`.
- `using` isn't recoverable: listed in §6.4 as `const`.
- **Tests:** `resources/defer` golden identity; an `addFinalizer` without a scope stays.

### Task 6: `try` / `catch` / `finally` (ADR-0010 shape)

The input shape is
`[return ]yield* Effect.gen(function*() B).pipe([catchDefect(UnknownError)], catch… , [ensuring(Effect.gen(F))])`.
It becomes `try B catch … finally F`:

- `catchTag("T", h)` / `catchTag([..], h)` → `catch (e: T)` / `catch (e: A | B)`;
- `catchTags({ A: h, B: h }[, orElse])` → one clause per key, plus an untyped last clause from
  `orElse`;
- the nested `(error) => catchTag(fail(error), …)` chains → successive clauses;
- `catch(h)` → an untyped clause.

Clause types come from local classes whose tag matches (the reverse of `localTags`), or else the tag
name. The `catchDefect` prelude is present exactly when the forward rule requires it. The leading
`return` matches the forward "every path returns" rule. Clause parameter names and comments are
kept.

**Tests:** `try/catch` golden identity, a grouped and a chained union, `finally` only, a comment
inside a clause, and a shape with a foreign pipe step that stays TypeScript.

### Task 7: Schema forms

- A run of `Schema.TaggedClass` classes plus `const U = Schema.Union([...])` +
  `type U = typeof U.Type` → `schema U = | A {…} | B {…}`.
- A single `Schema.TaggedClass` → `schema X { _tag: "T"; … }`.
- `const X = <schema>` + `type X = typeof X.Type` → `schema X = <type>`.
- `Schema.TaggedError` whose tag differs from its name → `error X { _tag: "T"; … }`.
- Class members (getters, methods) are kept.
- Unmapped fields become `= expr` fields, with `Schema.x` unqualified to `x` under the forward
  Schema-namespace rule.
- **Tests:** `schema/basic`, `schema/comments` and `error/errors` golden identity.

### Task 8: `service`

- `class S extends Context.Service<S, {…}>()("key") { … }` → `service S [as "key"] { … }`:
  - `as` is omitted when the key equals the forward-derived key for `filename`/`packageName`;
  - interface members return `Effect.Effect<…>` → `effect m(…): A throws E`;
  - `static readonly layer = Layer.effect(S, Effect.gen(…return S.of({…})))[.pipe(…)]` →
    `layer = effect {… return {…}} |> …`, with the layer constructor allowing `defer` (Task 5);
  - `layerX = Layer.succeed(S, S.of({…}))` → `layer x = {…}`;
  - the generated accessor statics are dropped only when they exactly equal the forward output;
  - members `k: Effect.fn("S.k")(…)` → `effect k(…) {…}`.
- **Tests:** `service/basic` golden identity, a custom key keeps `as`, and a hand-written extra
  static keeps the class as TypeScript with a note.

### Task 9: `match`

- `Match.valueTags(x, { T: (b) => e, … })` → `match (x) { when T(b): e … }`.
- `Match.value(x).pipe(Match.when(lit, () => e) | Match.tag("T", (b) => e), …, Match.orElse(() => e) | Match.exhaustive)`
  → `when`/`default` arms.
- The generator form `(yield* Match…({ T: (b) => Effect.gen(function*() { return e }) }))` →
  arms with `await`.
- The inline vs multi-line layout follows the forward `sameLine` rule.
- **Tests:** `match/match` golden identity, and a `Match.when` with a predicate function stays
  TypeScript.

### Task 10: `main`

- The last statement `<Runtime>.runMain(Effect.gen(function*() B).pipe(…, Effect.provide(<Runtime>Services.layer)))`
  → `main B |> …`. It applies only when:
  - `<Runtime>` is imported from `options.runtime`'s module;
  - the trailing services provide matches.

  The `Effect.scoped` and telemetry pipes follow the forward rules.
- The runtime import is removed by Task 3's rule.
- **Tests:** `main/main` golden identity; with another runtime option, it stays TypeScript with a
  note.

### Task 11: Docs

- §6.2: mark the rows done.
- §6.4: list per shape the EffectScript-side normalizations: `Effect.Effect` → `Effect`, `using` →
  `const`, `main` moved last, dropped redundant parentheses, unqualified builtins, removed prelude
  imports.
- COMPATIBILITY: reverse-compiler row.
- Plan ledger: rulings and deferred minors.
