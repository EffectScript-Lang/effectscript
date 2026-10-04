# EffectScript Plan 27: Service models, effects with state, and workflows (phase 21)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans. Steps use `- [ ]`. Execute task by task with TDD. Decisions are
> recorded in `docs/adr/`. Commit with explicit, gated paths:
> `pnpm check && pnpm lint && git commit <paths>`. Plans 24–26 must be done first. Bend at the
> pinned version is needed.

**Goal:** laws can talk about effectful code that uses services:

- a `service` declares a `model`, its reference behavior as pure state;
- that model runs as a layer in tests;
- it is modeled in Bend by threading one `World` state through named steps;
- a law runs `with Service.model(…)`;
- `conforms(…)` checks any other layer against the model.

The accounts example proves "transferring to yourself keeps your balance". It also shows that the
naive `transfer`, which creates money, cannot be proven.

**Architecture:**

- **Parser and lowering:** a `model(state…) { methods }` member of `service`. It lowers to
  `static readonly model = (state…) => Layer.effect(Self, …)` over a `SynchronizedRef`, so every
  method is atomic and transactional. Its decision gets an ADR (Task 1).
- **In Bend:**
  - each modeled service gets `<Service>.State` in its module's `types.bend`;
  - `proofs/_efx/world.bend` holds `World`, with one field per modeled service, plus accessors;
  - a model method becomes `def <Service>.<method>(args…, w: World) -> Pair(Exit<Errors, A>, World)`.
- **Effects with state:** an effect that needs modeled services gets the continuation pairs of spec
  §4.5 (`.k<n>` destructures, `.k<n>.go` matches). This encoding, with `String` ids and the new
  `HashMap`, was checked on Bend 2.0.35 by both checkers.

**Tech stack:** `SynchronizedRef.modifyEffect`, `Layer.effect`, `effect/Arbitrary`, Bend.

**Spec:** `docs/superpowers/specs/2026-10-04-effectscript-proofs-design.md` §4.5, §4.6, §8;
ADR-0076.

## Global Constraints

- **A model method is transactional.** It runs inside `SynchronizedRef.modifyEffect`, so it is atomic
  and a failure leaves the state as it was. The Bend model answers the original `World` on failure.
- **Model methods are pure.** No `await`, and assignments only to the model's parameters
  (EFX9431, EFX9432).
- **Exact texts:**
  - **EFX9431:** "A model method can assign only its state: `<name>` isn't one of the model's
    parameters"
  - **EFX9432:** "A model method can't `await`: a model is pure state"
  - **EFX9433:** "`<name>` isn't an `effect` member of `<Service>`"
  - **EFX9434:** "The model doesn't implement `<member>`"
- **Metadata.** Only services that have a model get `static readonly operations`, the members'
  parameter schemas, used by `conforms`. Services without a model compile exactly as before.
- **`World`:**
  - Fields are the services' names in camelCase.
  - A law that provides only some models starts every other field from that state's generated
    `<Service>.State.unused`: empty maps and lists, `0`, `""`, `false`, `None`. TypeScript's
    requirement checking already guarantees the law never reads them.
- Nothing is published.

## Review Focus

1. **A failing model method changes nothing:**
   - in TypeScript: the `Ref` is unchanged, and a later read sees the old state;
   - in Bend: the def answers the original `w`.

   *(Tasks 1, 3)*
2. **Concurrency.** Two concurrent calls to a model method serialize (`SynchronizedRef`); no update
   is lost. *(Task 1)*
3. **A service member the model doesn't implement**, or a method the service doesn't have: EFX9434
   and EFX9433 at the right lines. A plain service member named `model` (a method signature, not a
   block) keeps its meaning. *(Task 1)*
4. **A law with two models** (`with [A.model(x), B.model(y)]`) starts `World` with both. A law with
   one starts the other field from `unused`. *(Task 4)*
5. **`conforms` on a layer that disagrees only after several operations** reports the shortest
   sequence that shows it (shrunk), with each step's two outcomes. *(Task 5)*

---

### Task 1: The `model` member (ADR-0077)

**Files:**
- Modify: `packages/effectscript/core/src/compiler/parser/plugin.ts`. In the service body, `model(`
  … `)` followed by `{` on the same line is a `ServiceModel` node:
  `{ keyword, params, methods: Array<{ key: Identifier, params, body }> }`.
- Modify: `packages/effectscript/core/src/compiler/analyze/scope.ts`. The model's parameters are in
  scope in every method, as mutable locals.
- Modify: `packages/effectscript/core/src/compiler/transform/service.ts`. Lower the member, and emit
  `operations`.
- Modify: `packages/effectscript/core/src/compiler/reverse/` (the exact shape back to `model`).
- Modify: `packages/effectscript/tree-sitter/grammar.js` (`model_member`, `model_method`), add the
  keyword, the queries and a corpus entry.
- Create: `docs/adr/0077-service-models.md`. Add its row to `docs/adr/README.md`.
- Create: `packages/effectscript/core/test/fixtures/service/model.efx` with `.ts` and
  `.reverse.efx` snapshots.
- Test: `packages/effectscript/core/test/service-model.test.ts`.

**Interfaces.** Source (also the fixture):

```efx
export schema AccountId = string & Brand<"AccountId">
export schema Money = Int & Brand<"Money">
export error NoSuchAccount { id: AccountId }

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

Expected output inside the service class (the rest is today's service output):

```ts
  /** Balances by account: how every Accounts layer must behave. */
  static readonly model = (balances: HashMap.HashMap<AccountId, Money>) => Layer.effect(Accounts, Effect.gen(function*() {
    const state = yield* SynchronizedRef.make({ balances })
    return Accounts.of({
      balance: (id) => SynchronizedRef.modifyEffect(state, Effect.fnUntraced(function*({ balances }) {
        const found = HashMap.get(balances, id)
        if (Option.isNone(found)) return yield* new NoSuchAccount({ id })
        return [found.value, { balances }] as const
      })).pipe(Effect.withSpan("Accounts.model.balance")),
      setBalance: (id, amount) => SynchronizedRef.modifyEffect(state, Effect.fnUntraced(function*({ balances }) {
        balances = HashMap.set(balances, id, amount)
        return [undefined, { balances }] as const
      })).pipe(Effect.withSpan("Accounts.model.setBalance"))
    })
  }))
  static readonly operations = { balance: { id: AccountId }, setBalance: { id: AccountId, amount: Money } }
```

**Lowering rules:**

- Each `return e` becomes `return [e, { <state> }] as const`.
- The end of a body that can complete adds `return [undefined, { <state> }] as const`.
- `throw` keeps its meaning inside `effect` code.
- The local name `state` is hygienic (ADR-0009).

**ADR-0077 records:**

- the syntax;
- transactional, atomic semantics;
- `operations` metadata only on modeled services;
- the alternatives:
  - a separate `model` declaration outside the service: loses the members' types;
  - a `Ref` without `SynchronizedRef`: races between concurrent calls;
  - state as a class with methods: not modelable as pure state.

- [ ] **Step 1: Write the failing tests:**
  - **Runtime** (`runCompiled`):
    - `setBalance` then `balance` gives the amount;
    - `balance` of a missing id fails `NoSuchAccount`;
    - a failing method leaves the state as it was;
    - 100 concurrent `setBalance` calls for 100 ids leave 100 entries.
  - **Diagnostics:** EFX9431 (assigning a non-state local), EFX9432 (`await` in a method), EFX9433,
    EFX9434.
  - **Names:** a service with a plain `model(x: number): Effect<void>` member signature compiles as
    before.
  - **Snapshots:** the fixture's `.ts` and `.reverse.efx`; tree-sitter's corpus entry.
- [ ] **Step 2: Run them and see them fail:**
  `pnpm test --run --project effectscript packages/effectscript/core/test/service-model.test.ts`
- [ ] **Step 3: Implement** the parser, scope, lowering, reverse and tree-sitter changes, and write
  ADR-0077.
- [ ] **Step 4: Run them and see them pass,** including
  `pnpm test --run --project tree-sitter-effectscript` and the golden tests with `-u` and review.
- [ ] **Step 5: Commit** in two commits, code then ADR index:

```bash
pnpm check && pnpm lint && git commit packages/effectscript/core/src/compiler packages/effectscript/core/test/service-model.test.ts packages/effectscript/core/test/fixtures/service packages/effectscript/tree-sitter docs/adr/0077-service-models.md -m "feat(effectscript): a service's model is its reference behavior, as a transactional layer (Plan 27 Task 1, ADR-0077)"
git commit docs/adr/README.md -m "docs(adr): index ADR-0077"
```

### Task 2: `HashMap` in the prelude

**Files:**
- Modify: `packages/effectscript/core/bend/prelude.bend`, then `pnpm codegen`.
- Modify: `packages/effectscript/core/src/compiler/bend/types.ts` (`HashMap<string, V>`,
  `ReadonlyMap<string, V>`, `Record<string, V>` → `Efx.HashMap(V)`) and `mapping.ts`
  (`HashMap.empty/get/set/has` → the prelude).
- Test: `packages/effectscript/core/test/bend-prelude.test.ts`, `bend-golden.test.ts` (a `hashmap.efx`
  fixture).

**Interfaces.** These definitions were checked on 2.0.35 by both checkers. On a sample, `get` after
two `set`s answers the second value, a missing key answers `None`, and `has` sees a key:

```python
# HashMap
# -------
# A string-keyed map, as an association list: the model favours proofs over
# speed (ADR-0076). `set` replaces a key's entry in place, or appends one.

type HashMap.Entry<-V: Data> is Data:
  HashMap.Entry{key: String, value: V}

def HashMap(-V: Data) -> Data:
  List<&2, HashMap.Entry<V>>

def HashMap.empty(-V: Data) -> HashMap(V):
  Nil{}

def HashMap.get.pick(-V: Data, c: Bool, v: V, r: Maybe<&2, V>) -> Maybe<&2, V>:
  match c:
    case True{}:
      Some{v}
    case False{}:
      r

def HashMap.get(-V: Data, m: HashMap(V), +key: String) -> Maybe<&2, V>:
  match m:
    case Nil{}:
      None{}
    case HashMap.Entry{k, v} <> rest:
      HashMap.get.pick(V, String.eq(k, key), v, HashMap.get(V, rest, key))

def HashMap.set.pick(-V: Data, c: Bool, k: String, old: V, v: V, rest: HashMap(V), r: HashMap(V)) -> HashMap(V):
  match c:
    case True{}:
      HashMap.Entry{k, v} <> rest
    case False{}:
      HashMap.Entry{k, old} <> r

def HashMap.set(-V: Data, m: HashMap(V), +key: String, +v: V) -> HashMap(V):
  match m:
    case Nil{}:
      [HashMap.Entry{key, v}]
    case HashMap.Entry{+k, old} <> +rest:
      HashMap.set.pick(V, String.eq(k, key), k, old, v, rest, HashMap.set(V, rest, key, v))

def HashMap.has(-V: Data, m: HashMap(V), +key: String) -> Bool:
  match m:
    case Nil{}:
      False{}
    case HashMap.Entry{k, v} <> rest:
      Bool.or(String.eq(k, key), HashMap.has(V, rest, key))
```

**Lemmas** (prove each; they rest on Plan 26's `String.eq_refl`):

```python
law HashMap.get_set_same:
  for -V: Data
  for m: HashMap(V)
  for +key: String
  for +v: V
  {HashMap.get(V, HashMap.set(V, m, key, v), key) == Some{v} : Maybe<&2, V>}

law HashMap.get_set_other:
  for -V: Data
  for +m: HashMap(V)
  for +key: String
  for +other: String
  for +v: V
  for e: {String.eq(key, other) == False{} : Bool}
  {HashMap.get(V, HashMap.set(V, m, key, v), other) == HashMap.get(V, m, other) : Maybe<&2, V>}

law HashMap.has_set:
  for -V: Data
  for m: HashMap(V)
  for +key: String
  for +v: V
  {HashMap.has(V, HashMap.set(V, m, key, v), key) == True{} : Bool}
```

`get_set_other` also needs `String.eq` to be symmetric. Add `String.eq_sym` to the prelude if the
proof calls for it. The five-round rule applies: record and defer what doesn't fit, and leave no
open law.

- [ ] **Steps:**
  1. Add the definitions and the open laws. Bend reports the TODOs.
  2. Prove them until Bend prints ALL PROOFS CHECK.
  3. Add the `hashmap.efx` golden fixture: `HashMap.set`/`get` in a pure function.
  4. Run `pnpm codegen` and the tests. Expected: PASS.
  5. Commit:

```bash
pnpm codegen && pnpm check && pnpm lint && git commit packages/effectscript/core/bend/prelude.bend packages/effectscript/core/src/compiler/bend packages/effectscript/core/test/fixtures/bend packages/effectscript/core/test/bend-prelude.test.ts -m "feat(effectscript): HashMap in the Bend prelude, with get-after-set lemmas (Plan 27 Task 2, ADR-0076)"
```

### Task 3: `World`, and model methods in Bend

**Files:**
- Modify: `packages/effectscript/core/src/compiler/bend/env.ts`, `types.ts` (`<Service>.State`, its
  accessors and `unused`), `effects.ts` (model methods), `index.ts` (`_efx/world.bend`).
- Create: `packages/effectscript/core/test/fixtures/bend/accounts.efx` (Task 1's service plus
  `withdraw` and `transfer`), with snapshots.
- Test: `bend-golden.test.ts`.

**Interfaces.** Expected `_efx/world.bend` and the state type (checked on 2.0.35):

```python
# proofs/_efx/world.bend
import Base
import ./prelude.bend as Efx
import ../accounts/types.bend as AccountsT

# every modeled service's state
type World is Data:
  World{accounts: AccountsT.Accounts.State}

def World.accounts(w: World) -> AccountsT.Accounts.State:
  match w:
    case World{accounts}:
      accounts

def World.with_accounts(w: World, s: AccountsT.Accounts.State) -> World:
  match w:
    case World{accounts}:
      World{s}
```

```python
# in proofs/accounts/types.bend
# the state of `model(balances: HashMap<AccountId, Money>)`
type Accounts.State is Data:
  Accounts.State{balances: Efx.HashMap(Efx.Int)}

def Accounts.State.balances(s: Accounts.State) -> Efx.HashMap(Efx.Int):
  match s:
    case Accounts.State{balances}:
      balances
```

Model methods (checked on 2.0.35, kernel included):

```python
# Accounts.model: balance(id)
def Accounts.balance.fin(id: String, r: Maybe<&2, Efx.Int>, w: W.World) -> Pair(Efx.Exit<Err.Errors, Efx.Int>, W.World):
  match r:
    case None{}:
      (Efx.Failure{Err.NoSuchAccount{id}}, w)
    case Some{v}:
      (Efx.Success{v}, w)

def Accounts.balance(+id: String, +w: W.World) -> Pair(Efx.Exit<Err.Errors, Efx.Int>, W.World):
  Accounts.balance.fin(id, Efx.HashMap.get(Efx.Int, T.Accounts.State.balances(W.World.accounts(w)), id), w)

# Accounts.model: setBalance(id, amount)
def Accounts.setBalance(+id: String, +amount: Efx.Int, +w: W.World) -> Pair(Efx.Exit<Err.Errors, Unit>, W.World):
  (Efx.Success{Unit{}}, W.World.with_accounts(w, T.Accounts.State{Efx.HashMap.set(Efx.Int, T.Accounts.State.balances(W.World.accounts(w)), id, amount)}))
```

**Lowering rules:**

- `if (Option.isNone(x)) throw …; … x.value …` lowers to a match on `x`: the `.fin` helper above.
  That is the `Option` counterpart of Plan 25's exit narrowing.
- A method that assigns nothing answers `w` unchanged.
- One that assigns answers `W.World.with_<service>(w, <State>{…})` on success, and `w` on failure.

- [ ] **Steps:** write the fixture and its expected files; fail; implement; `-u` and review; run with
  Bend `--check-only`; PASS. Then commit:

```bash
pnpm check && pnpm lint && git commit packages/effectscript/core/src/compiler/bend packages/effectscript/core/test/fixtures/bend -m "feat(effectscript): World and service models in the Bend model (Plan 27 Task 3, ADR-0076)"
```

### Task 4: Effects with state, and laws `with` models

**Files:**
- Modify: `packages/effectscript/core/src/compiler/bend/effects.ts`, `laws.ts`.
- Test: `bend-golden.test.ts` (`accounts.efx`'s `transfer` and laws), `bend-lower.test.ts`.

**Interfaces.**

**`transfer`.** An effect whose `needs` are all modeled services takes `w: W.World` last and answers
a pair. Each `await` of a stateful call is `<decl>.k<n>(…, r: Pair(…))` (destructure) plus
`<decl>.k<n>.go(…, x, w)` (match). An `await` of a stateless `Exit` call passes `w` along beside it.

Expected `transfer` (the fixed one; checked on 2.0.35, kernel included):

```python
# after `await Accounts.setBalance(from, left)`
def transfer.k4.go(to: String, amount: Efx.Int, b: Efx.Int, x: Efx.Exit<Err.Errors, Unit>, w: W.World) -> Pair(Efx.Exit<Err.Errors, Unit>, W.World):
  match x:
    case Efx.Failure{e}:
      (Efx.Failure{e}, w)
    case Efx.Success{u}:
      Accounts.setBalance(to, Efx.Int.add(b, amount), w)

def transfer.k4(to: String, amount: Efx.Int, b: Efx.Int, r: Pair(Efx.Exit<Err.Errors, Unit>, W.World)) -> Pair(Efx.Exit<Err.Errors, Unit>, W.World):
  (x, w) = r
  transfer.k4.go(to, amount, b, x, w)

# after `await withdraw(fromBalance, amount)`
def transfer.k3(from: String, to: String, amount: Efx.Int, b: Efx.Int, x: Efx.Exit<Err.Errors, Efx.Int>, w: W.World) -> Pair(Efx.Exit<Err.Errors, Unit>, W.World):
  match x:
    case Efx.Failure{e}:
      (Efx.Failure{e}, w)
    case Efx.Success{left}:
      transfer.k4(to, amount, b, Accounts.setBalance(from, left, w))

# after `await Accounts.balance(to)`
def transfer.k2.go(from: String, to: String, +amount: Efx.Int, a: Efx.Int, x: Efx.Exit<Err.Errors, Efx.Int>, w: W.World) -> Pair(Efx.Exit<Err.Errors, Unit>, W.World):
  match x:
    case Efx.Failure{e}:
      (Efx.Failure{e}, w)
    case Efx.Success{b}:
      transfer.k3(from, to, amount, b, withdraw(a, amount), w)

def transfer.k2(from: String, to: String, amount: Efx.Int, a: Efx.Int, r: Pair(Efx.Exit<Err.Errors, Efx.Int>, W.World)) -> Pair(Efx.Exit<Err.Errors, Unit>, W.World):
  (x, w) = r
  transfer.k2.go(from, to, amount, a, x, w)

# after `await Accounts.balance(from)`
def transfer.k1.go(from: String, +to: String, amount: Efx.Int, x: Efx.Exit<Err.Errors, Efx.Int>, w: W.World) -> Pair(Efx.Exit<Err.Errors, Unit>, W.World):
  match x:
    case Efx.Failure{e}:
      (Efx.Failure{e}, w)
    case Efx.Success{a}:
      transfer.k2(from, to, amount, a, Accounts.balance(to, w))

def transfer.k1(+from: String, to: String, amount: Efx.Int, r: Pair(Efx.Exit<Err.Errors, Efx.Int>, W.World)) -> Pair(Efx.Exit<Err.Errors, Unit>, W.World):
  (x, w) = r
  transfer.k1.go(from, to, amount, x, w)

# the `if (from === to) return` at accounts.efx:20
def transfer.if0(c: Bool, +from: String, to: String, amount: Efx.Int, w: W.World) -> Pair(Efx.Exit<Err.Errors, Unit>, W.World):
  match c:
    case True{}:
      (Efx.Success{Unit{}}, w)
    case False{}:
      transfer.k1(from, to, amount, Accounts.balance(from, w))

def transfer(+from: String, +to: String, amount: Efx.Int, w: W.World) -> Pair(Efx.Exit<Err.Errors, Unit>, W.World):
  transfer.if0(String.eq(from, to), from, to, amount, w)
```

**Laws.** A law `with A.model(x)` (or `with [A.model(x), B.model(y)]`) has a claim that answers
`Pair.fst(<law body>(params…, {W.World{…} : W.World}))`. The `World` is built from the `with`
expressions, with `unused` for the rest. A `with` that isn't a list of `<Service>.model(…)` calls
keeps the law out of the model: "a law's `with` must be models to be proven".

- [ ] **Steps:** write the golden files; fail; implement; `-u`, review, run with Bend; PASS. Then
  commit:

```bash
pnpm check && pnpm lint && git commit packages/effectscript/core/src/compiler/bend packages/effectscript/core/test -m "feat(effectscript): effects that need modeled services, and laws with models, in the Bend model (Plan 27 Task 4, ADR-0076)"
```

### Task 5: `conforms`: other layers against the model

**Files:**
- Modify: `packages/effectscript/core/src/laws.ts`.
- Test: `packages/effectscript/core/test/laws-runtime.test.ts`.

**Interfaces:**

```ts
export const conforms: <S, Args extends ReadonlyArray<unknown>>(
  service: { readonly model: (...args: Args) => Layer.Layer<S>; readonly operations: Readonly<Record<string, Readonly<Record<string, Schema.Top>>>> } & Context.Service<S, any>,
  layer: Layer.Layer<S, unknown>,
  options: { readonly initial: Args; readonly runs?: number; readonly length?: number }
) => Effect.Effect<void>
```

**What `conforms` does:**

- Generates `runs` sequences (default 100) of up to `length` operations (default 10).
- Builds every argument from `operations`' schemas.
- Runs each sequence on a fresh `service.model(...initial)` and on a fresh `layer`.
- Compares each step's exit, with `Equal.equals` on successes and on failures' errors.
- Dies with the shrunk sequence and both outcomes of the first differing step.

- [ ] **Step 1: Write the failing tests**, with Task 1's `Accounts`:
  - a second in-memory layer written with a plain `Map` conforms;
  - a layer whose `setBalance` ignores an amount of 0 doesn't conform, and the message shows a short
    sequence ending in `setBalance(…, 0)` then `balance(…)`.
- [ ] **Step 2–4:** fail, implement, PASS.
- [ ] **Step 5: Commit**

```bash
pnpm check && pnpm lint && git commit packages/effectscript/core/src/laws.ts packages/effectscript/core/test/laws-runtime.test.ts -m "feat(effectscript): conforms checks a layer against its service's model (Plan 27 Task 5, ADR-0077)"
```

### Task 6: Workflows in the model

**Files:**
- Modify: `packages/effectscript/core/src/compiler/bend/effects.ts`.
- Create: `packages/effectscript/core/test/fixtures/bend/workflow.efx`, with snapshots.
- Test: `bend-golden.test.ts`.

**Interfaces:**

- A `workflow Name(fields): A throws E key K { … }` is modeled as an effect named `Name` over its
  fields. `key` isn't modeled.
- `await activity a(): B { … }` runs its body inline: the activity's result is the body's.
  Durability isn't modeled, and the verdict of a law that reaches a workflow notes it: "activities
  modeled as single runs".

- [ ] **Steps:** fixture (Plan 23's `welcome.efx` without the string formatting the model can't
  read), expected files, fail, implement, PASS. Then commit:

```bash
pnpm check && pnpm lint && git commit packages/effectscript/core/src/compiler/bend packages/effectscript/core/test/fixtures/bend -m "feat(effectscript): workflows and activities in the Bend model (Plan 27 Task 6, ADR-0076)"
```

### Task 7: The accounts example and the transfer story

**Files:**
- Create: `packages/effectscript/examples/src/accounts.efx` (Task 1's service, `withdraw` from
  `bank.efx`, the fixed `transfer`) and `accounts.laws.efx`.
- Create: `packages/effectscript/examples/proofs/accounts/*.proof.bend`, written by the executing
  agent.
- Create: `packages/effectscript/core/test/fixtures/verify/transfer-story/`: the naive `transfer`,
  with the same law and a proof file carried over from the fixed version.
- Test: `packages/effectscript/core/test/verify.test.ts`, `packages/effectscript/examples/test/laws.test.efx`.

**Interfaces.** `accounts.laws.efx`:

```efx
import { Accounts, type AccountId, type Money, transfer } from "./accounts.efx"

/** Transferring to yourself keeps your balance. */
law transferToSelfKeepsBalance(balances: HashMap<AccountId, Money>, id: AccountId, amount: Money)
  with Accounts.model(balances)
{
  const before = await Effect.exit(Accounts.balance(id))
  await Effect.exit(transfer(id, id, amount))
  return Equal.equals(before, await Effect.exit(Accounts.balance(id)))
}

/** A transfer between two accounts moves exactly the amount. */
law transferMovesTheAmount(balances: HashMap<AccountId, Money>, from: AccountId, to: AccountId, amount: Money)
  requires from !== to && amount >= 0
  with Accounts.model(balances)
{
  const before = [await Effect.exit(Accounts.balance(from)), await Effect.exit(Accounts.balance(to))] as const
  const result = await Effect.exit(transfer(from, to, amount))
  if (Exit.isFailure(result)) return true
  const fromAfter = await Accounts.balance(from)
  const toAfter = await Accounts.balance(to)
  return Exit.isSuccess(before[0]) && Exit.isSuccess(before[1]) &&
    fromAfter === before[0].value - amount && toAfter === before[1].value + amount
}
```

**The story the test pins** (no claim about what random tests find):

- **With the naive `transfer`:** the carried-over proof of `transferToSelfKeepsBalance` fails
  (Bend: Failed at the self-check step).
- **Counterexample:** evaluating the claim on `{ "ada": 100 }`, `"ada"`, `30` gives `false`. The
  test runs it through the model's `.mjs`.
- **With the fixed `transfer`:** the law is *proved*, *proved, kernel* when available.

- [ ] **Step 1: Write the example, run `efx verify`, and prove both laws.**
  - Follow the spike's proof (convoy on the lookup, a rewrite of `String.eq(id, id)` by
    `Efx.String.eq_refl`, and `Int.eq_refl`) and the `HashMap` lemmas.
  - For `transferMovesTheAmount`: `HashMap.get_set_same`, `get_set_other`, and `Int` arithmetic.
  - The ten-round rule applies. A law left *tested* is recorded with why.
- [ ] **Step 2: Write the story fixture and its test.** Expected: the naive version's proof fails,
  and its claim evaluates to `false` on the counterexample.
- [ ] **Step 3: Run** `efx verify --check --strict --kernel` in the examples. Expected: exit 0.
- [ ] **Step 4: Commit**

```bash
pnpm check && pnpm lint && git commit packages/effectscript/examples/src/accounts.efx packages/effectscript/examples/src/accounts.laws.efx packages/effectscript/examples/proofs packages/effectscript/examples/laws.lock packages/effectscript/examples/test/laws.test.efx packages/effectscript/core/test/fixtures/verify/transfer-story packages/effectscript/core/test/verify.test.ts -m "feat(effectscript): the accounts example: a transfer proven not to create money (Plan 27 Task 7, ADR-0074)"
```

### Task 8: Documentation and the skill

**Files:**
- Modify: `docs/superpowers/specs/2026-10-02-effectscript-design.md`:
  - §4.8 gets the `model` member (ADR-0077);
  - §4.19 gets `model` ("in a `service` body, followed by `(` … `)` and `{` on the same line");
  - §12 gets EFX9431–EFX9434.
- Modify: `docs/superpowers/specs/2026-10-04-effectscript-proofs-design.md`. Check §4.5 against
  what was built.
- Modify: `packages/effectscript/core/skills/effectscript/references/proofs.md`. Add a "Laws about
  services" section with the accounts proofs as examples.
- Modify: `packages/effectscript/core/skills/effectscript/references/patterns.md`. Add a type-checked
  "a service with a model" pattern.

- [ ] **Step 1: Write them, then run**
  `pnpm codegen && pnpm test --run --project effectscript packages/effectscript/core/test/skill.test.ts && pnpm lint`.
  Expected: PASS.
- [ ] **Step 2: Commit**

```bash
git commit docs/superpowers/specs packages/effectscript/core/skills -m "docs(effectscript): service models in the spec and the skill (Plan 27 Task 8)"
```
