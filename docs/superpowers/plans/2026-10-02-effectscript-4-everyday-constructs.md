# EffectScript Plan 4: Everyday Constructs, Ambient Capture and Strict Mode

> **For agentic workers:** execute task by task with TDD (failing test → watch it fail → implement →
> watch it pass → commit). Decisions live in `docs/adr/`; a ruling that changes one gets a new ADR.

**Goal:**
- Add the library constructs used in everyday backend code: `config`, top-level `layer`, and
  `test`/`describe` (§4.14).
- Add ambient capture of `console`/`Date`/`Math`/`process.env` inside `effect` code (§4.15,
  ADR-0027).
- Add the syntactic strict-mode rules (§4.17, ADR-0028), on one options contract (ADR-0017).

`api`/`group`/`impl`, `command` and `atom` follow in Plan 5, together with the OTLP observability
layer for `main` (§4.16).

**Architecture:** New parser productions in `parser/plugin.ts`:
- `config` reuses the class-like parser;
- `LayerDeclaration`;
- `DescribeStatement` and `TestStatement`.

Each gets a transform module (`transform/config.ts`, `layer.ts`, `test.ts`, `ambient.ts`), all
using `ref()` hygiene (ADR-0009). Strict rules live in `transform/strict.ts`. They run as handlers
that only report diagnostics and never edit.

**Spec:** §4.14 (`config`, top-level `layer`, `test`/`describe`), §4.15, §4.17, §7.6 (header).
**Decisions:** ADR-0009, 0017, 0027, 0028.

## Global Constraints

- All of Plan 2's constraints apply: browser-safe compiler, magic-string ordering, goldens
  type-check with `strict` + `exactOptionalPropertyTypes`, and a green superset test.
- Every new construct gets a golden fixture, which type-checks via `test/typecheck.test.ts`, plus
  behavior evidence: runtime tests, or for `test`/`describe`, a compiled fixture executed by
  vitest.
- Verify `pnpm check` and `pnpm lint` by exit code, never by grepping their output.
- Commit after each task with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  trailer.

## Review Focus

1. **Ambient capture of shadowed names:** a parameter named `console`, `Date`, `Math` or
   `process` must not be captured.
2. **`process.env.X` in assignment or `delete` position:** must stay untouched.
3. **`test` bodies with `using`/`defer`:** `it.effect` already provides `Scope`, so no
   `Effect.scoped` may be added.
4. **`layer` declarations whose initializer is `a & b & c |> provide(x)`:** the merge must wrap
   only the `&` chain.
5. **Strict warnings on plain TypeScript:** they must never change output (superset test).

---

### Task 1: Options contract and the `@effect` header (ADR-0017, §7.6)

**Files:** `src/compiler/options.ts` and `src/compiler/compile.ts`. Test: `test/options.test.ts`.
Update `test/superset.test.ts` per ADR-0028 (assert no *errors* and identical output).

- Add options, each documented as browser-safe or project-only:
  - `ambient?: boolean` (default true);
  - `strict?: boolean` (default false);
  - `effectVersion?: string` (the installed `effect` major.minor; project-only, supplied by
    integrations).
- Directives: `// @efx no-ambient` and `// @efx strict`.
- A header `// @effect 4.0` that disagrees with `effectVersion` (by major.minor) produces warning
  **EFX1003**.
- Tests:
  - The `no-ambient`/`strict` directives set the resolved options.
  - EFX1003 fires for `// @effect 3.19` with `effectVersion: "4.0.2"`, and not for `// @effect 4.0`.
  - With `strict: true`, a warning is reported with severity `error`.

### Task 2: Ambient capture (§4.15, ADR-0027)

**Files:** `src/compiler/transform/ambient.ts`, registered before `awaitHandlers`. Test:
`test/ambient.test.ts` (runtime) and the golden `test/fixtures/ambient/capture.efx`.

Inside `effect` code only, and only for *free* `console`, `Date`, `Math` and `process` (checked
with `isValueFree` + `isTypeFree` at the site):

| Source | Output |
| --- | --- |
| `console.log(…)` / `.info` / `.warn` / `.error` / `.debug` | `yield* Effect.log` / `logInfo` / `logWarning` / `logError` / `logDebug(…)` |
| `Date.now()` | `(yield* Clock.currentTimeMillis)` |
| `Math.random()` | `(yield* Random.next)` |
| `process.env.NAME` / `process.env["NAME"]` (read) | `(yield* Config.String("NAME").pipe(Config.withDefault(undefined)))` |

Parenthesize per `needsParens`, and drop the parentheses at statement level.

- Runtime tests:
  - Logs go through a test `Logger` (`Logger.replace`/`Logger.layer` per the v4 API).
  - `Date.now()` follows `TestClock`.
  - `Math.random()` is deterministic under `Random.withSeed`.
  - `process.env.X` reads from `ConfigProvider.fromUnknown({ X: "1" })` and is `undefined` when
    absent.
  - `process.env.X ?? fallback()` calls `fallback` only when X is absent (call count).
  - Shadowed `console` stays a plain call.
  - `// @efx no-ambient` disables capture.

### Task 3: `config` (§4.14)

**Files:** parser (add `config` to the class-like keywords); `src/compiler/transform/config.ts`.
Test: golden `test/fixtures/config/app.efx` + runtime test.

- **Output:** `const Name = Config.all({ field: …, … })`, keeping `export`.
- **Keys:** SCREAMING_SNAKE_CASE (`databaseUrl` → `DATABASE_URL`).
- **Field types:**
  - `string`, `number`, `boolean` → `Config.String`, `Config.Number`, `Config.Boolean`;
  - `Int`, `Finite`, `Port`, `LogLevel`, `Redacted`, `Duration`, `URL`, `Date` and
    `NonEmptyString` → `Config.<Name>(KEY)`;
  - a literal union → `Config.Literals([…], KEY)` (v4 argument order: literals first);
  - a single literal → `Config.Literal(lit, KEY)`;
  - any other identifier (a schema value) → `Config.schema(Name, KEY)`;
  - anything else → error **EFX3010**, with a hint to use `= Config.…`.
- **Modifiers:** `= d` → `.pipe(Config.withDefault(d))`, and `?` → `Config.option(…)`.
- **Runtime test:** values come from `ConfigProvider.fromUnknown`, and defaults and option
  behave as above.

### Task 4: Top-level `layer` (§4.14)

**Files:** parser (`LayerDeclaration`: `layer Name = <expression>`, in statement position, with
`export` allowed); `src/compiler/transform/layer.ts`. Test: golden
`test/fixtures/layer/app.efx` + runtime test.

- `const Name = <init>`.
- The `&` chain at the head of the initializer (looking through a `|>` pipeline) becomes
  `Layer.mergeAll(a, b, …)`.
- The initializer is walked in the `Layer` namespace, so `provide` is `Layer.provide`.
- An `effect { … }` head becomes `Layer.effectDiscard(Effect.gen(…))`, never scoped (the layer
  owns the scope).
- **Runtime test:** a merged layer provides two services. An `effectDiscard` layer's finalizer runs
  when the layer's scope closes.

### Task 5: `test` / `describe` (§4.14)

**Files:** parser (`DescribeStatement`: `describe "name" [with <expr>] { … }`; `TestStatement`:
`test[.live|.skip|.only] "name" { … } [|> pipes]`); `src/compiler/transform/test.ts`; prelude
(free `assert`/`expect`/`vi` in a file with tests → `@effect/vitest`). Test: golden
`test/fixtures/test/users.efx` (compiled to `users.ts`) + `test/vitest-construct.test.ts`, which
imports the golden so vitest runs the compiled tests.

- `describe "n" { … }` → `describe("n", () => { … })`.
- `describe "n" with L { … }` → `layer(L)("n", (it) => { … })`.
- `test "n" { … } |> p` → `it.effect("n", () => Effect.gen(function*() { … }).pipe(p))`.
- `.live` → `it.live`, `.skip` → `it.effect.skip`, `.only` → `it.effect.only`.
- Bodies are `effect` blocks that are never scoped (`it.effect` provides `Scope`).
- `describe`, `it` and `layer` come from `@effect/vitest` through `ref()`.

### Task 6: Strict errors (§4.17, ADR-0028)

**Files:** `src/compiler/transform/strict.ts`. Test: `test/strict.test.ts`. Rules:
- **EFX8001:** floating effect (heuristic, per ADR-0028).
- **EFX8002:** `yield`/`yield*` inside `effect` code.
- **EFX8003:** `Effect.runPromise`/`runSync`/`runFork`/`runCallback` inside `effect` code.
- **EFX8004:** `throw` of a string, number or template literal.
- **EFX8005:** `catch (e: any)`.
- **EFX8111:** `await` on a visible Promise.

Each rule gets one positive and one negative case. The negative cases include `Effect.isEffect(x)`
as a statement and `await log("x")`.

### Task 7: Strict warnings and promotion (§4.17)

**Files:** `src/compiler/transform/strict.ts`. Test: `test/strict.test.ts`. Rules:
- **EFX8101:** `Effect.gen` or `Effect.fn` written directly.
- **EFX8102:** `async` functions/arrows, `new Promise` or `.then` inside `effect` code.
- **EFX8103:** `throw new Error(…)` inside `effect` code.
- **EFX8104:** explicit `any`.
- **EFX8105:** `setTimeout`/`setInterval` inside `effect` code.
- **EFX8106:** `fetch` inside `effect` code.
- **EFX8107:** `Promise.all`/`race`/`allSettled` inside `effect` code.
- **EFX8108:** `JSON.parse` inside `effect` code.
- **EFX8109:** `new Date()` inside `effect` code.
- **EFX8110:** `T | null` / `T | undefined` in `service` member signatures.

`strict` promotes all of them to errors. The superset test stays green (no errors).

### Task 8: Docs

Update:
- spec §4.14: `Config.Literals` argument order, the ambient table per ADR-0027, and the
  `test`/`layer` details;
- the core README;
- COMPATIBILITY.md, with rows for `config`, `layer`, `test`/`describe` (executed by vitest), ambient
  capture and strict mode.

---

## Final review

Run a whole-branch review from the Plan 4 base on the most capable model. Fix Critical/Important
findings with a failing test first. Record deferred minors here.
