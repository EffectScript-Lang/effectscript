# ADR-0076: The Bend model: what translates, how it's encoded, and what stays opaque

- **Status:** Proposed (waits for the user's review of the proofs spec)
- **Date:** 2026-10-04
- **Deciders:** agent rulings from the Bend2 spike (2026-10-04), on the user's direction (ADR-0074)
- **Related:** ADR-0074; ADR-0075; ADR-0004 and ADR-0017 (the compiler is syntactic);
  `docs/superpowers/specs/2026-10-04-effectscript-proofs-design.md` §4–§5; Plans 25–27

## Context

Under ADR-0074, `efx verify` emits a Bend2 model of the `.efx` program, and proofs are written
against that model. The spike settled how such a model must look.

**What Bend2 requires of any model:**

- **Annotations.** Everything is annotated; nothing is inferred.
- **Order.** A def may call only defs written above it.
- **Matches.** A `match` takes a parameter or a pattern variable, never a computed value.
- **Recursion.** Recursion must shrink an argument, with the shrinking argument first among those
  that change. Mutual recursion is refused.
- **Copies.** Values are affine: a variable used twice needs `+`, which only `Data` values allow,
  and a closure can be called once.
- **Numbers.** There are only `Nat`, `U32` and `F32`. Base's `Nat` operations are native in
  compiled code; a `Nat` pattern recursion runs one unit at a time.

**What the spike found:**

- **Encoding effects.** Closures make the `--verdict` kernel refuse the proofs. One def per step
  passes both checkers and keeps goals short.
- **No sound stub for opaque code.**
  - An unfilled law can't be called by running code.
  - A foreign def must return `IO`.
  - An `@unsafe` def whose body loops makes the checker hang.
- **Imports and open laws.** A file that imports an open law won't run.

The EffectScript compiler is syntactic by design (ADR-0004, ADR-0017). It has no TypeScript
checker, so the only types it knows are the ones the source writes.

## Decision

**Where.**

- The emitter lives in `packages/effectscript/core/src/compiler/bend/`. It is pure and has no
  `node:*` imports, like the rest of the compiler.
- It reads the parsed `.efx` of the whole project.
- It writes the model with `efx verify` and `efx print --to bend`.

**Types.**

- The emitter uses written types, plus local inference over the provable subset: literals,
  declared returns, schema fields, operators, branches.
- Where it can't find a type, it raises **EFX9421** (a warning, shown only by verify) and leaves
  that declaration out of the model.

**What translates** (the full table is in the spec, §4):

| `.efx` | Bend model |
| ------ | ---------- |
| `schema` (class, struct, ADT), literal unions, brands | `type … is Data`; brands erased |
| `error` | A constructor of one program-wide `Errors` type |
| `boolean`; `bigint` and integer schemas (`Int` and its brands) | `Bool`; the prelude's unbounded `Int` |
| `string`, template literals | `String`, `++`, `Int.show` |
| `ReadonlyArray<T>`, `Option<T>`, `HashMap<string, V>` | `List`, `Maybe`, the prelude's `HashMap` (an association list with lemmas) |
| Pure functions, structural recursion | `def`s; the shrinking parameter moved first |
| `if`, ternaries, `&&`/`\|\|`, `match` | `match`; a computed condition becomes a helper `<decl>.if<n>` |
| `effect … throws E` | A def answering `Exit<Errors, A>` |
| `await` | One continuation def per step: `<decl>.k<n>`, with `.go` when it must match |
| `try`/`catch` by tag | A `match` on the exit |
| Lambdas | Closure conversion: a top-level `<decl>.lam<n>` over its environment, and prelude templates that thread the environment (`List.map_with`) |
| A service with a `model` | First-order state threading: an effect that needs it takes the program's `World` state and answers its exit beside the next `World` |
| Logging, spans | Nothing: observability isn't modeled |

**What stays opaque, and what that means.**

Each of these makes a declaration opaque:

- `number` arithmetic that isn't integer;
- `===` between objects (**EFX9422**: use `Equal.equals`);
- mutation of arrays;
- loops other than `for … of` over an array;
- mutual recursion;
- streams, fibers, queues and schedules;
- `retry`;
- concurrent `await [...]` over effects that touch state;
- services without a `model`;
- `Clock` and `Random`;
- imports from `.ts` or packages that the prelude table doesn't map.

**Opacity spreads to callers.** A law that reaches opaque code is tested, never proven, and its
verdict names the first opaque thing it reaches. There are no stubs and no postulates.

**Models: the explicit trust boundary.**

- A `service` may declare `model(state…) { methods }`: pure methods over state. If a method throws,
  the state is left unchanged.
- It compiles to a `Ref`-backed layer, `Service.model(initialState)`, for tests, and to state
  threading in Bend.
- A proof that goes through a model says so ("assumes `Accounts.model`").
- Conformance tests check other layers against the model.

**Encoding rules.**

- **Order.** Defs are ordered so helpers come first.
- **Copies.** A binding used more than once gets `+`.
- **Names.** Generated names are numbered per declaration (`withdraw.if0`, `transfer.k3`), so an
  edit in one declaration renames nothing elsewhere.
- **Data.** Field access goes through generated accessors (`User.name(u)`), and structural equality
  through generated `T.equals`.
- **Failures.** Defects and interruption are not modeled.

**Files.** Under `proofs/`, all committed:

- the prelude, `proofs/_efx/prelude.bend`;
- the program-wide error type, `proofs/_efx/errors.bend`;
- per module, generated: `types.bend` (schemas, kept apart so `errors.bend` can import them
  without a cycle), `model.bend`, `claims.bend` (the runnable parts of its laws), and one
  `<law>.law.bend` per law;
- per module, written: `<law>.proof.bend` per law and an optional `lemmas.bend`.

Each generated file starts with a header naming the efx version, the pinned Bend version and a hash
of its source. `efx verify --check` fails when a generated file is stale. One law per file gives
one verdict per law, and checks can run in parallel.

## Consequences

- Anything outside the subset still compiles and runs; it just isn't proven. Writing code that can
  be proven means using integer schemas instead of `number`, `Equal.equals` instead of `===` on
  objects, and services with models.
- Proofs read like the code: `transfer.k1` is the step after the first `await` of `transfer`.
- **Prelude work is a plan of its own:** `Int` on native `Nat`, `HashMap` and `String`, each with
  the lemmas proofs need. It grows from real laws.
- **Committed generated files.** They cost repository churn, and in return a proof is reviewable
  against the exact model it proves.
- **Cost if wrong:** the encoding is internal to the emitter. Changing it regenerates every model
  and breaks proofs, which is acceptable before 1.0 and would need a migration note after.

## Alternatives considered

- **`do` blocks over a state monad:** they read more naturally, but `--verdict` refuses them (closures),
  and their goals are long.
- **A TypeScript checker as the type source:** that breaks ADR-0004 and ADR-0017, and it is slow.
  It may come later as an annotation suggester (`efx verify --suggest-types`).
- **Stubs for opaque functions:** none is both sound and usable in Bend (see Context).
- **Bend's `Map` for `HashMap`:** a crit-bit tree with no lemmas; proofs would have to reason about
  its internals.
- **Generated files ignored by git:** a proof would silently change meaning when the generator
  changes, and a reviewer couldn't see what was proven.
- **One `PROOF.bend` per module:** Bend stops at the first error, so a single broken proof would
  hide the state of every other law in the module.
