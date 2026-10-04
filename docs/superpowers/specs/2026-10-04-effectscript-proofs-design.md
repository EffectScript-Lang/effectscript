# EffectScript proofs: laws, a Bend2 model, and proofs written by agents

- **Date:** 2026-10-04
- **Status:** Draft for review. It replaces the "Proofs" item of the main spec's §14.
- **Decisions:** ADR-0074 (Bend2, one source; accepted), ADR-0075 (`law`; proposed), ADR-0076
  (the Bend model; proposed).
- **Plans:** 24 (laws as property tests), 25 (the model and `efx verify`), 26 (trust: differential
  testing, kernel, law lock), 27 (services and workflows).
- **Evidence:** a spike on 2026-10-04 with Bend 2.0.35. Its notes are private (research note "Bend2
  as EffectScript's proof backend"); the encodings below are the ones it validated.

## 0. Story

Effect already makes failures, dependencies and resources visible in types. What it can't say is
what the program must never do:

- money is never created by a transfer;
- an order is never shipped before it is paid;
- a withdrawal never leaves a negative balance.

Today such rules live in prose, in a few example tests, or in an engineer's head. When an agent
writes the code, nobody may read it closely enough to notice when a rule breaks.

EffectScript lets a person write these rules once, as **laws**, next to the code or in a laws file.
From the same `.efx` source:

- **The code runs** as idiomatic Effect TypeScript, as today.
- **Every law runs as a property test**, from the first day.
- **`efx verify` models the code in Bend2**, a language whose type checker checks proofs. An
  agent writes a proof that each law holds for every input, and Bend checks it in a fraction of a
  second.

Nobody writes the program twice. Where a proof exists, the law holds for all inputs, not only the
ones a test tried. The verdict always says what it assumed.

### Success criteria

1. A `law` in any `.efx` module type-checks in the editor, compiles to nothing that runs in
   production, and runs as a property test (with shrinking) through `laws "path"` in a test file.
2. `efx verify` reports each law on the trust ladder (§6.3): *fails*, *tested*, *proved* or
   *proved, kernel*. It names what each verdict assumes.
3. The examples package proves its laws end to end in CI with the pinned Bend: `bank.efx` (Plan 25),
   `order.efx` (Plan 25) and `accounts.efx` (Plan 27).
4. A model that disagrees with the compiled TypeScript fails `efx verify` (Plan 26).
5. A changed or removed law fails `efx verify` until a person accepts it (Plan 26).
6. Without `bend` installed, every command still works, and laws are tested.

## 1. Overview

```
            ┌──────────── TypeScript emitter (exists) ─────────── src/*.ts      (runs)
 .efx ──────┤                                                     laws → pure constants
 (parse)    │                                                     ?laws module → property tests
            └──────────── Bend emitter (new) ──────────────────── proofs/**     (proven)
                                                                  model, claims, laws, prelude

 efx verify:  compile → property tests → model → bend (per law) → [--kernel] → differential → lock
              → verdict
```

**Modes:**

| Mode | What runs | Needs |
| ---- | --------- | ----- |
| `efx build`, editor, Vitest | TypeScript only; laws are property tests through `laws "path"` | nothing new |
| `efx verify` | Property tests; model; proofs checked by bend2; model against code; law lock | `bend` on `PATH` (otherwise tests only) |
| `efx verify --kernel` | Also rechecks each proof with Bend's proven kernel (`--verdict`) | Lean 4.34 toolchain or `$BENDTT` |
| Bend runtime (later) | A pure module runs on Bend's own JavaScript output | a later ADR |

**Who writes what:**

| File | Written by | Committed |
| ---- | ---------- | --------- |
| `*.efx` code and `law` declarations | people and agents | yes |
| `*.laws.efx` (laws and the predicates they use) | people | yes, under CODEOWNERS if wanted |
| `laws.lock` | `efx verify --accept-laws`, run by a person | yes |
| `proofs/**/types.bend`, `model.bend`, `claims.bend`, `*.law.bend`, `proofs/_efx/*` | `efx verify` | yes, checked fresh in CI |
| `proofs/**/*.proof.bend`, `proofs/**/lemmas.bend` | agents (or people) | yes |

## 2. Laws

ADR-0075 decides this section's shape. Here are the full rules.

### 2.1 Syntax

```efx
/** <one sentence: the rule> */
[export] law <name>(<param>: <Type>, …) [requires <expression>] [with <expression>] {
  <effect code>
  return <boolean expression>
}
```

**Example** (`packages/effectscript/examples/src/bank.efx`):

```efx
/** Withdrawing never leaves a negative balance. */
law withdrawNeverNegative(balance: Money, amount: Money) {
  const exit = await Effect.exit(withdraw(balance, amount))
  return Exit.isFailure(exit) || exit.value >= 0
}

/** A withdrawal fails exactly when it asks for more than the balance. */
law withdrawFailsExactlyWhenShort(balance: Money, amount: Money) {
  return Exit.isFailure(await Effect.exit(withdraw(balance, amount))) === amount > balance
}
```

**Rules:**

- **Position.** A law is a module-level declaration (**EFX9403** elsewhere). `export law` exports
  its constant. Its name is a value binding, so it can't clash with another declaration.
- **Parameters** need a type that the §4.6 type-to-schema table maps, because a schema generates
  the inputs (**EFX9401**). Laws without parameters are allowed: they run once.
- **The body** is `effect` code. Every path ends in `return <expression>` whose value is a boolean
  (**EFX9402** when a path doesn't return).
  - `await e` means "`e` succeeds": a failure falsifies the law for that input.
  - Use `Effect.exit` to talk about failures.
  - `throw` inside a law is a failure, so it also falsifies.
- **`requires <expression>`** is a precondition over the parameters, with no `await`. Generated
  inputs that don't meet it are discarded (`Arbitrary.filter`). If it discards so many that
  generation is exhausted, the law fails and says why.
- **`with <expression>`** is the layer the body runs with. The parameters are in scope, so
  `with Accounts.model(balances)` builds the layer from the generated state.
- **The doc comment** is the law's sentence. It appears in `efx docs` and as `# LAW:` in the Bend
  law file.
- **Laws files.** `*.laws.efx` modules may hold laws and the predicates they use. Such files are
  locked whole (§6.4).

### 2.2 Lowering

```ts
/** Withdrawing never leaves a negative balance. */
const withdrawNeverNegative = /*#__PURE__*/ Object.assign(
  Effect.fnUntraced(function*({ balance, amount }: { readonly balance: Money; readonly amount: Money }) {
    const exit = yield* Effect.exit(withdraw(balance, amount))
    return Exit.isFailure(exit) || exit.value >= 0
  }),
  { law: "withdrawNeverNegative", inputs: { balance: Money, amount: Money } }
)
void withdrawNeverNegative
```

- **`requires p`** adds `requires: ({ a, b }) => p` to the metadata, destructuring the parameters it
  reads.
- **`with L`** adds a pipeable: `Effect.fnUntraced(function*({ … }) { … }, (effect, { a, b }) =>
  Effect.provide(effect, L))`, destructuring only the parameters `L` reads (as `workflow` keys do,
  ADR-0072).
- **`export law`** emits `export const` and no `void` line.
- **Reverse compiler:** exactly this shape converts back to `law` (ADR-0030 identity holds).

### 2.3 Running laws in tests

```efx
// test/bank.test.efx
laws "../src/bank.efx"
laws "../src/accounts.efx" with Ledger.layerTest
```

→ the `doctest` pattern (docs spec §2.3):

```ts
import __laws_bank from "../src/bank.efx?laws"
describe("laws ../src/bank.efx", () => __laws_bank(it))
```

- **The `?laws` module** (Vite plugin, and the Node register hooks for `efx verify`) is the
  target's own source with this appended:

  ```ts
  import * as $efxLaws from "effectscript/laws"
  export default ($efxIt) => {
    $efxIt.effect("law withdrawNeverNegative", () => $efxLaws.assertLaw(withdrawNeverNegative))
    …
  }
  ```

  Private laws are covered, because this is a second compile of the same module.
- **`effectscript/laws`** is a test-time export, like `effectscript/doctest`:
  - `arbitrary(law)` is `Arbitrary.all` over `Arbitrary.schema` of each input, filtered by
    `requires`.
  - `check(law, options)` runs `Arbitrary.checkEffect` and answers the `CheckResult`.
  - `assertLaw(law, options)` dies with `Arbitrary.formatCheckFailure` when the check doesn't
    pass.

  `it.effect.prop` isn't used, because its inputs can't carry a precondition over several
  parameters.
- **Diagnostics:**
  - **EFX9404:** the path isn't relative, or doesn't end in `.efx`.
  - **EFX9405** (warning): the target has no laws.
  - **EFX9406:** the target has a `main`.
- **Run count:** under Vitest, inputs per law are `Arbitrary`'s default; `efx verify` uses 100
  unless `--runs` says otherwise. A `laws` statement option is later, not in Plan 24.

### 2.4 Contracts (later)

`requires`/`ensures` on `effect` functions, the old §14 stage 1, become sugar that generates laws.
They are not part of Plans 24–27.

```efx
effect withdraw(balance: Money, amount: Money): Money throws InsufficientFunds
  ensures (result) => result >= 0
```

That would generate `law withdraw$ensures(balance: Money, amount: Money) { … }`.

## 3. What can be proven: the provable subset

A declaration is **modeled** when every part of it is in the subset of §4 and every name it uses is
modeled or mapped by the prelude table (§4.6). Everything else is **opaque**:

- **Callers.** Opacity spreads to callers: a declaration that calls opaque code is opaque.
- **Laws.** A law whose body reaches opaque code is *tested*, never *proved*. Its verdict names
  the first opaque thing it reaches, with its location.
- **No stubs.** Bend can't use an unproven claim in running code, a pure foreign function, or a
  looping stub soundly (the spike), so the emitter never invents one.

**What to write when you want a proof:**

- integer schemas (`Int`, branded `Int`, `bigint`) instead of plain `number`;
- `ReadonlyArray`, `Option` and `HashMap` instead of mutation;
- `Equal.equals` instead of `===` on objects;
- `match` and `if` instead of loops other than `for … of`;
- a `model` for every service a law needs (§4.5).

## 4. The Bend model

ADR-0076 decides the encoding. This section is the reference for the emitter and for agents
reading models.

### 4.1 Types

| `.efx` / TypeScript | Bend model | Notes |
| ------------------- | ---------- | ----- |
| `boolean` | `Bool` | |
| `bigint`; `Int` and schemas built on it (`Int.check(…)` or `Int where …`, `Int & Brand<"X">` or `brand X = Int`) | `Efx.Int` | Unbounded in the model. `Schema.Int` checks safe integers, so decoded values are exact; arithmetic past ±2^53 is a documented gap. Bend's own runtime stops at ±(2^48 − 1). |
| `number` (other) | opaque | Floats aren't modeled (Bend's `F32` is axiomatic). |
| `string` | `String` | `Efx.String.eq`; lemmas in the prelude |
| Literal unions (`"a" \| "b"`) | `type … is Data` with one constructor per literal | |
| `schema X { … }` (class), `schema X = { … }` (struct) | `type X is Data: X{field: T, …}` | Fields in declaration order; generated accessors `X.field(x)` and structural `X.equals(a, b)` |
| `schema S = \| A { … } \| B { … }` | `type S is Data: A{…} B{…}` | `_tag` checks become `match` |
| `error E { … }` | constructor `E{…}` of `Err.Errors` | One program-wide type in `proofs/_efx/errors.bend`; same-named errors in two modules get the module's name as a prefix |
| `brand X = T`, `T & Brand<"X">` | `T` | Brands are erased (ADR-0077) |
| `ReadonlyArray<T>`, `T[]` (not mutated) | `List<&2, T>` | |
| `[A, B]` | `A & B` | |
| `Option<T>` | `Maybe<&2, T>` | |
| `HashMap<string, V>`, `ReadonlyMap<string, V>`, `Record<string, V>` | `Efx.HashMap<V>` | An association list with lemmas; other key types are opaque at first |
| `Effect<A, E, never>` | `Efx.Exit<Err.Errors, A>` | Defects and interruption aren't modeled |
| `Effect<A, E, R>`, every service in `R` with a `model` | `World -> Pair(Exit<Err.Errors, A>, World)`, first-order | §4.5 |
| Function types | Closure conversion (§4.4) | |
| `unknown`, `any`, classes other than schemas, `Date`, `Duration`, streams, fibers, `Ref` (outside models), `Schedule` | opaque | |

### 4.2 Expressions and statements

| `.efx` | Bend model |
| ------ | ---------- |
| Literals: `true`, `42` in an `Int` position, `"s"`, `` `a${n}` `` | `True{}`, `Efx.Int` literal, `"s"`, `"a" ++ Efx.Int.show(n)` |
| `const x = e` | `x = e` (a let); `+x = e` when `x` is used more than once |
| `let x = …; x = …` (no loop) | A new name per assignment (SSA) |
| `a + b`, `-`, `*` on `Int` | `Efx.Int.add/sub/mul(a, b)` |
| `/`, `%` on `Int` | `Efx.Int.div/mod` (truncating, as JS on safe integers) |
| `<`, `<=`, `>`, `>=`, `===`, `!==` on `Int`, `string`, `boolean`, literals | `Efx.Int.is_lt…` / `String.eq` / `Bool.eq` / generated `L.eq` |
| `===` on objects | opaque, with warning **EFX9422**: use `Equal.equals` |
| `Equal.equals(a, b)` on modeled data | the generated `T.equals(a, b)` |
| `!a`, `a && b`, `a \|\| b` | `Bool.not`, `Bool.and`, `Bool.or` (both sides are pure in the subset) |
| `c ? a : b`, `if (c) … else …` | A helper `<decl>.if<n>(c, free variables…)` whose body is `match c` (Bend can't match a computed value) |
| `match (x) { when A({ f }): … }`, guards | `match x: case A{f, …}: …`; a guard is a nested `.if` |
| `x.f` (schema field) | `X.f(x)` |
| `new X({ … })`, `X.make(…)` | `X{…}` (a brand's `make` is the identity) |
| `xs.map(f)`, `filter`, `reduce`, `some`, `every`, `find`, `length`, `Array.*` | Prelude templates (§4.6); `f` is closure-converted |
| `for (const x of xs) { acc = … }` | A structural recursion helper `<decl>.for<n>(xs, acc…)` |
| `while`, `do`, labeled jumps, `break` across loops | opaque |
| Recursion | Kept when it shrinks a pattern piece of one argument; that parameter moves first. Bend checks termination; a failure is mapped back to **EFX9424** and the declaration is opaque. |
| Mutual recursion | opaque (merging into one def is a later option) |
| `console.*`, `Effect.log*`, spans | nothing (observability isn't modeled) |

### 4.3 Effects

| `.efx` | Bend model |
| ------ | ---------- |
| `effect f(…): A throws E` (no `needs` beyond modeled services) | `def f(…) -> Efx.Exit<Err.Errors, A>` |
| `return v` | `Efx.Success{v}` |
| `throw new E({ … })`, `x ?? throw …` | `Efx.Failure{Err.E{…}}` |
| `await g(…)` (g answers `Exit`) | A continuation `f.k<n>(free variables…, x: Exit)` that matches `x`: `Failure` passes through, `Success{v}` continues |
| `await Effect.exit(e)` | The continuation receives the `Exit` as a value |
| `await Effect.succeed(v)` / `Effect.fail(e)` | `Success{v}` / `Failure{e}` |
| `try { … } catch (e: A) { … }` | A `match` on the `try` block's exit, by constructor |
| `catch (e)` (untyped) | opaque in the first version (it also catches defects) |
| `defer`, `using`, `finally` | Ignored when their bodies are observability only; otherwise opaque |
| `await [a, b]` | Left to right when neither touches modeled state; otherwise opaque |
| `\|> retry(…)`, `timeout`, `race`, streams, fibers | opaque |
| `workflow`, `activity` | The body as an effect; an activity runs inline (durability isn't modeled) |

### 4.4 Encoding rules

- **Order.** A def may call only defs above it, so the emitter writes helpers first (`.if`, `.k`,
  `.lam`, `.for`). Types may refer to each other in any order.
- **Copies.** A binding or parameter used more than once on a path gets `+`. Model types are all
  `Data` except functions.
- **Closure conversion.**
  - A lambda becomes `<decl>.lam<n>(+env…, x)`, with its captured variables as leading parameters.
  - Templates take it as `~f: @+e:E -> A -> B` and thread `env`.
  - A closure captured into another closure, or called after being stored, is opaque.
- **Binder order.** A `match` on a pattern variable comes in its scrutinee's binder position (Bend's
  rule); the emitter orders multi-scrutinee matches to follow it.
- **Names.**
  - Source names are kept: `withdraw`, `transfer`, `User.name`.
  - Generated helpers are numbered per declaration in source order: `withdraw.if0`, `transfer.k1`,
    `transfer.k1.go`, `total.lam0`, `sum.for0`.
  - An edit inside one declaration renumbers only that declaration's helpers.
- **Imports.**
  - A module's model imports `../_efx/prelude.bend as Efx`, `../_efx/errors.bend as Err`, and the
    models of the `.efx` modules it imports, by their names.
  - Constructors are qualified (`Efx.Success{…}`).
  - A cycle between modeled modules is **EFX9423**, and those modules are opaque.

### 4.5 Services: models and state

A service is modeled only through an explicit **model**: its reference behavior as pure state.

```efx
export service Accounts {
  effect balance(id: AccountId): Money throws NoSuchAccount
  effect setBalance(id: AccountId, amount: Money): void

  /** Balances by account: how every Accounts layer must behave. */
  model(balances: HashMap<AccountId, Money>) {
    balance(id) {
      const found = HashMap.get(balances, id)
      if (Option.isNone(found)) throw new NoSuchAccount({ id })
      return found.value
    }
    setBalance(id, amount) {
      balances = HashMap.set(balances, id, amount)
    }
  }
}
```

**Rules:**

- **State.** The model's parameters are its state.
- **Methods.**
  - Methods implement the service's `effect` members by name. Their parameter and return types come
    from the member signatures.
  - Methods are pure: no `await` (**EFX9432**).
  - They may reassign state parameters and nothing else (**EFX9431**).
  - They may `throw` the member's declared errors. A failing method leaves the state unchanged.
- **TypeScript (ADR-0077, Plan 27).**
  - `static readonly model = (balances: HashMap<AccountId, Money>) => Layer.effect(Accounts, …)`
    over a `SynchronizedRef` of the state, so tests can run against the model like any layer.
  - Each method runs inside `SynchronizedRef.modifyEffect`, so it is atomic, and the state changes
    only when it succeeds.
  - Services with a model also get `static readonly operations`, their members' parameter schemas,
    for `conforms`.
- **Bend.**
  - `proofs/_efx/world.bend` declares `type World is Data: World{accounts: Accounts.State, …}`, one
    camelCase field per modeled service. A law starts the fields it doesn't provide from
    `<Service>.State.unused`.
  - An effect that needs modeled services becomes `def f(…, w: World) -> Pair(Exit<Err.Errors, A>,
    World)`.
  - Each `await` is a continuation pair: `f.k<n>` destructures the pair, and `f.k<n>.go` matches
    the exit. No closures are involved (closures fail the kernel).
- **In laws.** `law … with Accounts.model(balances)` makes the law's state the generated `World`.
  `with [A.model(x), B.model(y)]` provides two. The verdict adds "assumes Accounts.model".
- **Conformance.** `effectscript/laws` exports `conforms(Service, layer, options?)` for tests. It runs
  random sequences of the service's operations against a layer and against the model, and compares
  the outcomes (Plan 27).
- **Without a model.** An effect that needs a service with no model is opaque. Built-in services
  (`Clock`, `Random`, `FileSystem`, `HttpClient`, `SqlClient`) are opaque; models for test clocks
  and seeded randomness are a later option.

### 4.6 The prelude table (Effect API → prelude)

Maintained in code next to the prelude tables (`compiler/prelude/`), and tested.

| Effect / JS | Prelude |
| ----------- | ------- |
| `Option.some/none/isSome/isNone/getOrElse/map/match` | `Efx.Option.*` over `Maybe` |
| `Array.map/filter/reduce/some/every/findFirst/length/append/reverse/isEmptyReadonlyArray`, and the same methods on arrays | `Efx.List.*_with` templates |
| `HashMap.empty/get/set/has/remove/size/keys` | `Efx.HashMap.*` |
| `Exit.isSuccess/isFailure/match` | `Efx.Exit.*` |
| `Equal.equals` | the generated `T.equals` |
| `String` length, concatenation, `startsWith`, `includes` | Base `String.*` |
| Everything else | opaque |

### 4.7 A worked example

**Source** (`examples/src/bank.efx`):

```efx
export schema Money = Int & Brand<"Money">
export error InsufficientFunds { needed: Money; available: Money }

export effect withdraw(balance: Money, amount: Money): Money throws InsufficientFunds {
  if (amount > balance) throw new InsufficientFunds({ needed: amount, available: balance })
  return Money.make(balance - amount)
}
```

**Model** (`proofs/bank/model.bend`). This is the shape the spike proved and checked with both
checkers:

```python
# Generated by efx <version> from src/bank.efx (sha256:…). Do not edit: run `efx verify`.
# bend 2.0.35
import Base
import ../_efx/prelude.bend as Efx
import ../_efx/errors.bend as Err

# the `if` at bank.efx:29
def withdraw.if0(c: Bool, +balance: Efx.Int, +amount: Efx.Int) -> Efx.Exit<Err.Errors, Efx.Int>:
  match c:
    case True{}:
      Efx.Failure{Err.InsufficientFunds{amount, balance}}
    case False{}:
      Efx.Success{Efx.Int.sub(balance, amount)}

def withdraw(+balance: Efx.Int, +amount: Efx.Int) -> Efx.Exit<Err.Errors, Efx.Int>:
  withdraw.if0(Efx.Int.is_gt(amount, balance), balance, amount)
```

**Law** (`proofs/bank/withdrawNeverNegative.law.bend`, generated). Its runnable part is in
`claims.bend`, because Bend won't run a file that imports an open law:

```python
import Base
import ../_efx/prelude.bend as Efx
import ../_efx/errors.bend as Err
import ./claims.bend as C

# LAW: Withdrawing never leaves a negative balance.   (src/bank.efx:41)
law withdrawNeverNegative:
  for +balance: Efx.Int
  for +amount: Efx.Int
  {C.withdrawNeverNegative(balance, amount) == Efx.Success{True{}} : Efx.Exit<Err.Errors, Bool>}
```

**Proof** (`proofs/bank/withdrawNeverNegative.proof.bend`, written by an agent). It uses the
"convoy" pattern: the verdict of the lifted `if` travels with its equation.

```python
import Base
import ../_efx/prelude.bend as Efx
import ./model.bend as Bank
import ./claims.bend as C
import ./withdrawNeverNegative.law.bend as Laws
import ./lemmas.bend as L

def fin(c: Bool, +balance: Efx.Int, +amount: Efx.Int) -> {Efx.Int.is_gt(amount, balance) == c : Bool} -> {…goal with Bank.withdraw.if0(c, balance, amount)…}:
  match c:
    case True{}:
      e => {==}
    case False{}:
      e => L.int_sub_ge(amount, balance, e)

def Laws.withdrawNeverNegative(balance, amount):
  fin(Efx.Int.is_gt(amount, balance), balance, amount)({==})
```

**A service, first-order** (`transfer`, abbreviated). Each `await` becomes a def that receives the
previous step's exit and state:

```python
def transfer.k1.go(+from: String, +to: String, +amount: Efx.Int, x: Efx.Exit<Err.Errors, Efx.Int>, w: Efx.World) -> Pair(Efx.Exit<Err.Errors, Unit>, Efx.World):
  match x:
    case Efx.Failure{e}:
      (Efx.Failure{e}, w)
    case Efx.Success{a}:
      transfer.k2(from, to, amount, a, Accounts.balance(to, w))

def transfer.k1(+from: String, +to: String, +amount: Efx.Int, r: Pair(Efx.Exit<Err.Errors, Efx.Int>, Efx.World)) -> Pair(Efx.Exit<Err.Errors, Unit>, Efx.World):
  (x, w) = r
  transfer.k1.go(from, to, amount, x, w)
```

## 5. Files and layout

```
<package>/
  laws.lock                                  # §6.4
  proofs/
    _efx/prelude.bend                        # generated, versioned with effectscript
    _efx/errors.bend                         # generated: every `error` of the package
    _efx/world.bend                          # generated when a service has a model
    bank/types.bend                          # generated: the module's schemas, accessors, equals
    bank/model.bend                          # generated from src/bank.efx
    bank/claims.bend                         # generated: the runnable part of each law
    bank/withdrawNeverNegative.law.bend      # generated: one law per file
    bank/withdrawNeverNegative.proof.bend    # written by an agent
    bank/lemmas.bend                         # written by an agent (optional, shared)
```

- **Paths.** `src/billing/ledger.efx` → `proofs/billing/ledger/`, relative to the package root and
  minus a leading `src/`, like service keys (ADR-0014). The root is configurable (`proofs` option).
- **Why `types.bend` is separate.** Types live apart from functions so that
  `_efx/errors.bend` can import every module's types (an error may hold a schema) while every
  `model.bend` imports `errors.bend`, with no cycle.
- **Headers.** Each generated file starts with a header naming:
  - the efx version;
  - the source file and its hash;
  - the pinned Bend version.
- **Freshness.** `efx verify` rewrites generated files; `efx verify --check` (CI) fails with
  **EFX9411** when they are stale.
- **Proof files.**
  - A proof file fills exactly one law, `def Laws.<name>(…)`, so `bend <law>.proof.bend` gives that
    law's verdict alone.
  - `lemmas.bend` holds shared lemmas, as `law` + `def` pairs or typed `def`s, and must leave no law
    open.
  - Agents never edit generated files: the skill says so, and the next `efx verify` rewrites them.
- **Missing proofs.** A law without a proof file is *tested*. `efx verify --explain <law>` writes a
  starter proof file with a `?goal` hole (§7).

## 6. `efx verify`

### 6.1 Usage

```
efx verify [paths…] [--law <name>] [--runs <n>] [--seed <n>] [--kernel] [--check] [--strict]
           [--accept-laws] [--explain <law>] [--json]
```

- **Without paths,** it verifies every `.efx` module of the project (`tsconfig.json`'s files, as
  `efx check` reads them).
- **Steps,** for each module with laws, in parallel where possible:
  1. Compile, collect laws, compare with `laws.lock` (§6.4).
  2. Run each law's property test, with `--runs` (default 100) and `--seed` (printed, so a run can be
     repeated).
  3. Emit or refresh the model (`--check` compares and doesn't write).
  4. Without `bend` (or with the wrong version, **EFX9425**), stop here: every law is at most
     *tested*.
  5. For each law with a proof file, run `bend <law>.proof.bend`. Exit 0 and `ALL PROOFS CHECK`
     means *proved*. Otherwise the first Bend error is kept for the verdict.
  6. With `--kernel`, rerun each proved law with `--verdict`. Success makes it *proved, kernel*;
     a refusal keeps *proved* and records why.
  7. **Differential test (Plan 26).** Build `model.bend -o model.mjs` and run each modeled
     declaration a proved law reaches against the compiled TypeScript, on inputs from the same
     schemas. Converters are generated from the types (`Int` ↔ `number | bigint`, records ↔
     `{$: "file.Name", …}`).
     - A mismatch makes the law *fails (model)*, showing the input and both outputs.
     - Passing adds "model agrees on N inputs".
  8. Print the verdict (§6.3), and write `.efx/verdict.json` with `--json` (for `efx docs` and CI).
- **Exit code:** 0 unless one of these holds:
  - a law fails;
  - the lock doesn't match;
  - generated files are stale under `--check`;
  - a law that had a proof lost it, under `--strict`.

### 6.2 Proof trouble is not a build failure

A proof can break when the shape of the code changes even though the law still holds. The spike's
`>` → `>=` mutation did exactly that.

- **The law degrades instead.** It drops to *tested* with "proof needs repair: <file>:<line>", which
  is a warning.
- **`--strict` makes it an error,** for teams that want every proof kept current.

### 6.3 The verdict

```
efx verify · bend 2.0.35 · seed 1817
src/bank.efx
  proved, kernel  withdrawNeverNegative          model agrees on 1,000 inputs
  proved, kernel  withdrawFailsExactlyWhenShort  model agrees on 1,000 inputs
src/accounts.efx
  proved          transferToSelfKeepsBalance     assumes Accounts.model
  tested          transferConservesMoney         proof needs repair: proofs/accounts/transferConservesMoney.proof.bend:41
  tested          ledgerExportIsSorted           not provable: reaches JSON.stringify (src/accounts.efx:88)
  fails           neverOverdraws                 balance = 0, amount = 1
6 laws: 3 proved (2 kernel), 2 tested, 1 fails
```

| Rung | Meaning |
| ---- | ------- |
| **fails** | A counterexample was found (shrunk), or the model disagrees with the code. |
| **tested** | The property test passes. Either there is no proof, the proof is broken (named), or the law reaches opaque code (named). |
| **proved** | The property test passes, bend2's checker accepts the proof, and (from Plan 26) the model agrees with the code. |
| **proved, kernel** | Also accepted by `--verdict`, Bend's kernel with machine-checked consistency and termination theorems. |

**Notes on any rung:**

- "assumes <Service>.model";
- "model agrees on N inputs";
- "requires discarded N inputs" (the check fails when generation is exhausted).

### 6.4 The law lock

- **What `laws.lock` holds** (JSON, sorted keys):
  - for each law, `"<file>#<name>": "sha256:…"`, a hash of the law's tokens without comments: name,
    parameters, types, `requires`, `with`, body;
  - for each laws file, `"<file>": "sha256:…"`, a hash of the whole file without comments.
- **Mismatch.** Any difference fails with **EFX9410**: a new law, a changed law, a removed law, or a
  changed laws file. The message lists each, with a diff.
- **Accepting.** `efx verify --accept-laws` writes the lock; a person runs it. The skill tells agents
  never to run it. Projects can add `laws.lock` and `*.laws.efx` to CODEOWNERS.
- **Why it matters.** It closes the gap Bend's convention leaves open: there, a law's helper
  predicates live in code anyone can edit. Here, predicates in `*.laws.efx` are locked with the
  laws.

## 7. Agents: writing and repairing proofs

**`efx verify --explain <law>`:**

- prints the law's sentence and statement;
- lists the model defs it reaches, with their source lines;
- prints the current goal:
  - with no proof file, it writes `<law>.proof.bend` with `def Laws.<name>(…): ?goal` and prints
    Bend's goal;
  - with a broken proof, it prints Bend's error: expected and observed terms, the context, the
    location.

**The skill section "Laws and proofs" teaches:**

- the file roles of §5, and what never to edit;
- the loop: explain, write a step, `efx verify --law <name>`;
- the proof patterns from the spike:
  - induction by matching and recursing;
  - the convoy pattern for lifted `if`s and lookups;
  - rewriting with `%Equal.sym(…) : <goal with _>`;
  - refuting `True == False` through a `Bool.disc` motive;
  - generalizing a lemma before induction (the order workflow's `unpaid`);
- prelude lemmas first, then `lemmas.bend`;
- never weaken a law, never run `--accept-laws`, and report a law that seems false with its
  counterexample.

**Bender** (Higher Order Company's paid proving agent) may become an optional prover
(`--prover bender`) once its API is open. Not planned yet.

## 8. The prelude

`proofs/_efx/prelude.bend` ships inside the `effectscript` package, versioned with it, and is
copied into each project. It grows from real laws, and every lemma comes with its proof.

| Part | Contents | Plan |
| ---- | -------- | ---- |
| `Exit` | `Success`/`Failure`, `is_success`, `is_failure`, `map` | 25 |
| `Int` | Sign and magnitude over Base's **native** `Nat` operations (the spike's unary version took minutes at 2^40); `add sub mul div mod neg cmp is_* eq show from_nat`; lemmas: `eq_refl`, `cmp` antisymmetry, `sub_self`, `add_sub_cancel`, `add_comm`, `add_assoc`, `sub_nonneg_iff_le` | 25 |
| `Bool` | `eq`, `implies`, `Bool.disc`, `true_ne_false` | 25 |
| `Option` | over `Maybe`: `getOrElse`, `map`, `isSome/isNone` | 25 |
| `List` | `map_with filter_with foldl_with some_with every_with find_with` (environment-threading templates); lemmas for `length`, `append`, `foldl` | 25 |
| `String` | `eq` (Base's), `Int.show`; lemma `String.eq_refl`, down to `Word.cmp` | 26 |
| `HashMap` | Association list keyed by `String`: `empty get set has remove size keys`; lemmas `get_set_same`, `get_set_other`, `has_set`, `get_remove` | 27 |

## 9. Diagnostics

| Code | Severity | Raised by | Message (short) |
| ---- | -------- | --------- | --------------- |
| EFX9401 | error | compiler | A law parameter has no type, or its type has no schema |
| EFX9402 | error | compiler | A path of a law's body doesn't `return` a value |
| EFX9403 | error | compiler | `law` outside module top level |
| EFX9404 | error | compiler | A `laws` path that isn't relative or doesn't end in `.efx` |
| EFX9405 | warning | `?laws` | A `laws` target with no laws |
| EFX9406 | error | `?laws` | A `laws` target with a `main` |
| EFX9410 | error | `efx verify` | Laws differ from `laws.lock` |
| EFX9411 | error | `efx verify --check` | Generated proof files are stale |
| EFX9421 | warning | `efx verify` | No type for `x`: `f` stays out of the model |
| EFX9422 | warning | `efx verify` | `===` compares references here: use `Equal.equals` |
| EFX9423 | warning | `efx verify` | Modeled modules import each other in a cycle |
| EFX9424 | warning | `efx verify` | `f`'s recursion doesn't shrink an argument (Bend's termination check) |
| EFX9425 | warning | `efx verify` | `bend` missing or not the pinned version: laws are tested only |
| EFX9431 | error | compiler | A model method assigns something other than its state |
| EFX9432 | error | compiler | `await` in a model method |
| EFX9433 | error | compiler | A model method that isn't an `effect` member of its service |
| EFX9434 | error | compiler | A model that doesn't implement every `effect` member |

The model diagnostics (EFX942x) are only shown by `efx verify`: a build or the editor never warns
about code just because it can't be proven. Each plan fixes its codes' exact texts.

## 10. Testing the feature

- **Laws (Plan 24):**
  - fixtures `test/fixtures/law/*.efx` → `.ts` and `.reverse.efx`;
  - runtime tests through `?laws` under Vitest: a passing law, a falsified law with its shrunk
    input, `requires`, `with`;
  - tree-sitter corpus entries; the superset identity test (`law` stays an identifier elsewhere).
- **Model (Plan 25):**
  - golden fixtures `test/fixtures/bend/*.efx` → `*.bend` snapshots, one per row of §4's tables;
  - unit tests for the passes: ordering, `+`, lifting, closure conversion, naming;
  - a CI job installs the pinned Bend (its install script with the sha256 pins, cached) and runs
    `bend --check-only` on every golden model.
- **End to end:**
  - the examples package gets `bank.efx` and `order.efx` (Plan 25) and `accounts.efx` (Plan 27),
    with committed proofs;
  - CI runs `efx verify --check`. `--kernel` runs in a separate, optional job, because it needs Lean.
- **Differential (Plan 26):** a deliberately wrong model in a test fixture must make `efx verify`
  fail.
- **The transfer story (Plan 27):** a fixture with the buggy `transfer` whose law is *tested*: the
  property test passes and the proof can't be written. Next to it, the fixed version whose law is
  *proved*.

## 11. Delivery

| Plan | Phase | Delivers | Needs Bend |
| ---- | ----- | -------- | ---------- |
| 24 | 18 | `law`, `requires`, `with`, `laws "path"` + `?laws`, reverse, tree-sitter, docs, skill | no |
| 25 | 19 | Bend emitter for §4.1–4.4 without services; prelude v1; `efx print --to bend`; `efx verify` (tests, model, proofs, verdict); proofs layout; bank and order examples proven; CI job | yes |
| 26 | 20 | Differential testing; `--kernel`; law lock; `--explain`; `--check`; `--json`; String lemmas; the skill's proof section; laws as facts in `efx docs` | yes |
| 27 | 21 | Service `model`s (TypeScript and Bend); `World` threading; laws `with` models; `HashMap` prelude; `conforms(…)`; workflows; the accounts example and the transfer story | yes |

**Later (roadmap, each with its own ADR):**

- contracts (`requires`/`ensures`) as law sugar;
- running pure modules on Bend's output;
- models for opaque pure functions;
- a `Nat` type;
- caching proof results by definition hash in CI;
- Bender as a prover;
- publishing the prelude on BendHub;
- a second backend, only if Bend stalls.

## 12. Not in scope

- A proof language or tactics in `.efx`. Proofs are Bend.
- Proving anything about floats, concurrency, defects, interruption, time or randomness.
- Any change to runtime behavior: production output is the same with or without laws (unused pure
  constants aside).
- Lean 4.

## 13. Risks

The full list is in the private research note. Here are the ones that shape the plans.

1. **Bend changes fast** (2.0.31 to 2.0.35 in a week).
   - One pinned version per EffectScript release.
   - The emitter's output uses a small, tested core of Bend syntax.
   - Golden models are rechecked by CI against the pin.
2. **Two checkers.** bend2's checker is unproven, and the kernel covers less.
   - The encoding stays inside the kernel's scope (no closures).
   - The kernel rung is reported separately.
3. **Prelude effort.** Lemmas for `Int`, `String` and `HashMap` are real work. They are scheduled
   in Plans 25–27 and grow from real laws.
4. **Proofs break on refactors.**
   - Laws degrade to *tested* instead of failing.
   - Helper names stay stable per declaration.
   - The skill teaches repair.
5. **The gap between model and runtime** (§4.1 numbers, defects, concurrency).
   - Every gap is documented.
   - Differential testing stays inside the safe numeric range.

## 14. Open questions, with the defaults the plans use

| Question | Default |
| -------- | ------- |
| Commit generated models, or ignore them? | Commit them (ADR-0076): proofs are reviewed against the exact model. |
| Where does the proofs folder live? | `<package>/proofs`, configurable. |
| One law per file, or one `LAWS.bend` per module? | One per file: per-law verdicts and parallel checks. |
| Do `requires` laws filter inputs or skip them? | Filter (`Arbitrary.filter`); exhaustion fails the law. |
| Which Bend version? | The newest release when Plan 25 starts, pinned as one constant in the `effectscript` package (with the installer's sha256 values for CI) and checked by `efx doctor` and `efx verify`. |
| Run property tests in `efx verify`, or only through Vitest? | Both: `efx verify` imports `?laws` through the register hooks; Vitest runs them through `laws "path"`. |
| Should `efx build` warn about laws that aren't provable? | No: only `efx verify` reports provability. |
