# EffectScript Plan 7: Reverse Compiler, Library Constructs and Ambient Forms

> **For agentic workers:** execute task by task with TDD. Decisions are recorded in `docs/adr/`.
> Gate every commit: `pnpm check && pnpm lint && git commit …`.

**Goal:** `toEffectScript` re-sugars the remaining spec §6.2 rows: ambient capture (§4.15),
`config`, top-level `layer`, `atom`, `test`/`describe`, `group`/`api`/`impl` and `command` (§4.14).
After this plan, every construct the forward compiler emits converts back.

**Architecture:** The Plan 6 pipeline is unchanged.

- Each construct gets a `reverse/<construct>.ts` module that inverts `transform/<construct>.ts`
  exactly. It is reached from the walker (`effects.ts` `makeVisit`/`visitProgram`).
- Constructs whose forward pass resolves names in their own namespace (`Layer`, `Atom`, the
  `effect/cli` modules) use `within(ctx, namespace, …)`. The reverse namespace type grows to
  match.
- The ADR-0030 conversion-time guard stays the safety net. Each task's tests also assert that
  nothing falls back to the guard's statement-level conversion, so every shape is matched
  precisely.

**Spec:** `docs/superpowers/specs/2026-10-02-effectscript-design.md`: §6.2 (the rows from
`describe`/`test` onward), §4.14, §4.15.

**Decisions:** ADR-0030 (identity rule, conversion-time guard), ADR-0031, ADR-0027 (`process.env`
keeps `string | undefined`), ADR-0029 (OTLP).

## Global Constraints

- The compiler stays browser-safe.
- APIs are recognized by import origin: `effect`, `effect/reactivity`, `effect/http-api`,
  `effect/cli`, `@effect/vitest`.
- Every golden fixture round-trips byte for byte. The `ai-docs` corpus stays token- and
  comment-equivalent.
- A construct's reverse never relies on the guard's fallback. Tests assert there is no
  "doesn't compile back" note.

## Review Focus

1. Ambient forms appear only where the forward compiler captures them: at generator level,
   `console`/`Date`/`Math`/`process` free, ambient option on. `Effect.log` outside effect code
   stays. *(Task 1)*
2. A `config` field whose env name isn't the forward screaming-snake name of its key stays
   TypeScript (`Config.String("PORT_NUMBER")` for `port`). *(Task 2)*
3. `test` bodies use `it.effect`'s scope. `defer`/`using` in a test body re-sugar with no
   `Effect.scoped`, and a body with an explicit `Effect.scoped` stays as written. *(Task 5)*
4. `@effect/vitest` imports go only when the prelude restores them (`assert`, `expect`, `vi` in test
   files; `describe`/`it`/`layer` through the test constructs). A user `it` binding is never
   captured. *(Task 5)*
5. HttpApi endpoints whose options don't follow the forward order (`params`, `query`, `payload`,
   `headers`, `success`, `error`) stay TypeScript, and so does a `command` flag chain with an
   unknown step. *(Tasks 6, 8)*

---

### Task 1: Ambient forms (§4.15)

At generator level, with `options.ambient` on and the global free:

| TypeScript                                                | EffectScript                 |
| --------------------------------------------------------- | ---------------------------- |
| `yield* Effect.log/logInfo/logWarning/logError/logDebug(…)` | `console.log/info/warn/error/debug(…)` |
| `yield* Clock.currentTimeMillis`                          | `Date.now()`                 |
| `yield* Random.next`                                      | `Math.random()`              |
| `yield* Config.String("X").pipe(Config.withDefault(undefined))` | `process.env.X`; `process.env["x-y"]` when `X` isn't an identifier |

Parentheses the forward compiler restores are dropped. Ambient uses inside a parameter default
stay as written.

**Tests:**
- `ambient/capture` golden identity;
- `Effect.log` in a plain function stays;
- a local `console` binding keeps `Effect.log`;
- `ambient: false` keeps everything.

### Task 2: `config`

- `const X = Config.all({ k: <field>, … })` → `config X { k: T … }`.
- **Fields:**
  - `Config.String/Number/Boolean("K")` → `string`/`number`/`boolean`.
  - `Config.<Named>("K")` → the name.
  - `Config.Literal(v, "K")` / `Config.Literals([…], "K")` → a literal / literal union.
  - `Config.schema(S, "K")` → `S`.
  - A `.pipe(Config.withDefault(e))` suffix → `= e`.
  - `Config.option(…)` → `k?:`.
- `"K"` must equal the forward `screamingSnake(k)`. Any other shape stays TypeScript.
- **Tests:**
  - `config/app` golden identity;
  - a mismatched env name;
  - a computed key;
  - a field with two pipe steps.

### Task 3: Top-level `layer`

- `const X = Layer.mergeAll(a, b)[.pipe(…)]` → `layer X = a & b [|> …]`. Pipes resolve in the
  `Layer` namespace.
- `const X = Layer.effectDiscard(Effect.gen(…))` → `layer X = effect { … }`. `defer` is allowed,
  with no scope wrapper.
- Operands are kept verbatim, comments included. An operand that needs parentheses (`a ? b : c`)
  stays TypeScript.
- **Tests:** `layer/app` golden identity, and a single-argument `mergeAll` stays.

### Task 4: `atom`

- `const x = Atom.make(e)[.pipe(Atom.…)]` → `atom x = e [|> …]`.
- `Atom.make(Effect.gen(…))` → `atom x = effect { … }`.
- Pipes resolve in the `Atom` namespace (`keepAlive`).
- Requires `Atom` imported from `effect/reactivity`.
- **Tests:** `atom/counter` golden identity, and an `Atom.make` with two arguments stays.

### Task 5: `test` / `describe`

- **Forms:**
  - `describe("n", () => { … })` → `describe "n" { … }`.
  - `layer(L)("n", (it) => { … })` → `describe "n" with L { … }`, and nested ones via `it.layer(…)`.
  - `it.effect/live/effect.skip/effect.only("n", () => Effect.gen(function*() B)[.pipe(…)])` →
    `test[.live|.skip|.only] "n" B [|> …]`.
- **Test bodies:** a body is a layer-constructor frame. `defer` is allowed without
  `Effect.scoped`, and `using` comes back as `const`.
- **Imports:** `it`/`describe`/`layer` must come from `@effect/vitest`, or be the parameter of an
  enclosing `layer(…)` callback named `it` (the forward `unused("it")`). `assert`/`expect`/`vi`
  imports join the prelude groups (test files only).
- **Tests:** `test/users` golden identity, a user `it` shadowing stays, and `it.effect` with a
  non-generator body stays.

### Task 6: `group` and `api`

- `class G extends HttpApiGroup.make("g").add(HttpApiEndpoint.<m>("n", "/p", { … }), …)[.middleware(M)] {}`
  → `group G ["g"] { <m> n "/p" [(sections)] [: S] [throws E1 | E2] }`.
  - The `"g"` is omitted when it equals the forward default identifier.
  - `delete` → `del`.
  - The section and success schemas go through the §4.6 reverse table.
- `class A extends HttpApi.make("a").add(G1, …) {}` → `api A ["a"] { G1, … }`.
- **Tests:** `http/api` golden identity, an endpoint with options out of order stays, and a
  section field with no type form stays.

### Task 7: `impl`

- `HttpApiBuilder.group(Api, "g", Effect.fn("Api.g")(function*(handlers) { …; return handlers.handleAll({ … }) }))[.pipe(…)]`
  → `impl Api.g { …; return { … } } [|> …]`.
- Members `Effect.fn("Api.g.m")(…)` → `effect m(…)`.
- Pipes resolve in the `Layer` namespace.
- **Tests:** `http/api` golden identity (the `impl` part), and a handler span name that doesn't
  match stays.

### Task 8: `command`

- `Command.make("name", { k: Flag/Argument chain, … }, Effect.fn("name")(function*({ … }) {…}))[.pipe(Command.withDescription("…"))]`
  → `command name(…) {…}` with JSDoc descriptions.
- **Fields:**
  - `Argument.String("k")` → positional.
  - `Flag.<T>("kebab")` → `--k`.
  - `withSchema(S)` → `: S`.
  - `Flag.Literals("k", […])` → a literal union.
  - `withDefault(v)` → `= v`.
  - `optional` → `?`.
  - `withAlias("a")` → `@alias a`.
  - `withDescription("d")` → `/** d */`.
- The chain order must equal the forward order, and the kebab name must equal `kebab(k)`.
  Anything else stays TypeScript.
- **Tests:** `cli/create` golden identity, a flag whose kebab name differs stays, and an unknown
  chain step stays.

### Task 9: Docs

- §6.2: mark all rows done.
- §6.4: list the new normalizations (`process.env["X"]` → `.X`, `Effect.log` → `console.log`).
- COMPATIBILITY: update the reverse-compiler row.
- This plan's execution record.
