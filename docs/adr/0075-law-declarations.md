# ADR-0075: `law` declares a rule the program must keep; it runs as a property test and is what a proof proves

- **Status:** Proposed (the syntax waits for the user's review of the proofs spec)
- **Date:** 2026-10-04
- **Deciders:** agent proposal from the Bend2 spike, on the user's direction (ADR-0074)
- **Related:** ADR-0074; ADR-0076; ADR-0042 (doctests, whose `?doctest` module this mirrors);
  `docs/superpowers/specs/2026-10-04-effectscript-proofs-design.md` §3; Plan 24

## Context

ADR-0074 needs one construct that a person writes once and that serves three purposes:

- it documents a rule;
- it runs as a property test today;
- it is the statement a Bend proof proves later.

`@effect/vitest` already has `it.effect.prop(name, inputs, property)`:

- it generates its inputs from Schemas;
- returning `false` or failing falsifies the property;
- it shrinks a counterexample.

The spec's roadmap put contracts (`requires`/`ensures` on functions) first. But many rules concern
several functions together, for example "transferring to yourself keeps your balance". A contract
on one function can't state those.

Bend's own convention separates laws, which the human writes, from proofs, which the AI writes.
Its demos show the weak point of that wall: a law uses helper predicates (`Sorted`, `count`) that
live in the code, so an agent can change what a law means without touching the law.

## Decision

**Syntax** (statement position, module top level, optionally `export`ed):

```efx
/** Withdrawing never leaves a negative balance. */
law withdrawNeverNegative(balance: Money, amount: Money) {
  const exit = await Effect.exit(withdraw(balance, amount))
  return Exit.isFailure(exit) || exit.value >= 0
}

/** Transferring to yourself keeps your balance. */
law transferToSelfKeepsBalance(balances: HashMap<AccountId, Money>, id: AccountId, amount: Money)
  requires amount >= 0
  with Accounts.model(balances)
{
  const before = await Effect.exit(Accounts.balance(id))
  await Effect.exit(transfer(id, id, amount))
  return Equal.equals(before, await Effect.exit(Accounts.balance(id)))
}
```

**Parameters.**

- Every parameter has a type with a schema (the §4.6 type-to-schema table). Its inputs are
  generated from that schema.
- A missing type, or a type with no schema, is **EFX9401**.

**The body.**

- The body is `effect` code. Every path ends in `return <boolean>`; anything else is **EFX9402**.
- `await e` means "`e` succeeds": if `e` fails, the law fails for that input. To state something
  about failures, use `Effect.exit`.

**`requires <expression>`.**

- It is a precondition over the parameters, with no `await`.
- Generated inputs that don't meet it are discarded (`Arbitrary.filter`), not counted as passes.
- A precondition that discards too many inputs makes the check *exhausted*, and the law fails, as
  in fast-check.
- In the Bend model it becomes a hypothesis of the law.

**`with <expression>`.**

- It is the layer the body runs with, built from the parameters for each run.
- It has the same meaning as `|> provide(L)` on a `test`.

**Lowering.** A law becomes an unexported constant (exported with `export law`), marked pure so
bundlers drop it. A `void` statement keeps `noUnusedLocals` quiet:

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

- `requires p` adds `requires: ({ …params }) => p` to the metadata.
- `with L` adds a pipeable that provides the layer: `(effect, { …params }) => Effect.provide(effect, L)`.

**Running laws.** `laws "<relative path>" [with <layer>]` is a test-file statement, like `doctest`:

```ts
import __laws_bank from "../src/bank.efx?laws"
describe("laws ../src/bank.efx", () => __laws_bank(it))
```

- **The `?laws` virtual module** is the target's source with a default export appended. That
  export registers `it.effect("law <name>", () => assertLaw(<name>))` for each of the module's
  laws, private ones included, since it is a second compile of the same module.
- **`assertLaw`** comes from `effectscript/laws`, a test-time module like `effectscript/doctest`.
  - It builds the inputs with `Arbitrary.all` over `Arbitrary.schema`, filtered by `requires`.
  - It runs `Arbitrary.checkEffect`.
  - It dies with `Arbitrary.formatCheckFailure` on a counterexample or on exhaustion.
- **With and without `with`.** Without `with`, the statement lowers to `describe`; with it, to
  `layer(L)(…)` (`?doctest`'s pattern, ADR-0042).
- **`efx verify`** runs the same check through the same module and keeps the result for its
  verdict (ADR-0074).
- **Why not `it.effect.prop`:** its inputs are independent schemas, which can't express a
  precondition over several parameters.

**The law lock (`laws.lock`).**

- It holds a fingerprint of each law's statement. The fingerprint covers the name, the parameters
  and their types, `requires`, `with` and the body, ignoring comments and whitespace.
- Adding, changing or removing a law fails `efx verify` with **EFX9410** until a person runs
  `efx verify --accept-laws`, which shows what changed.
- **Laws files (`*.laws.efx`)** are fingerprinted whole. They hold laws and the predicates the laws
  use, so the vocabulary a law is written in is locked too.
- The agent skill forbids agents from accepting laws, and a project can put `laws.lock` and
  `*.laws.efx` under CODEOWNERS.

**Keywords and tooling.**

- `law` is contextual: statement position, optionally after `export`, followed on the same line
  by an identifier and `(`.
- `requires` and `with` are keywords only in a law's header. `laws` is contextual like `doctest`.
- The reverse compiler gives a `law` back from the exact lowering above.
- Tree-sitter gets `law_declaration`, `requires_clause`, `with_clause` and `laws_statement`.

**Docs.** A law's doc comment is its sentence ("LAW: …" in Bend's demos). `efx docs` lists a
module's laws as facts, with the rung from the last verdict when one exists.

## Consequences

- Laws work on the first day, with no Bend, as property tests that shrink.
- One statement serves the docs, the tests and the proofs.
- **Production output gains nothing at run time:** a pure, unused constant per law.
- The law lock makes "the human owns the laws" enforceable by the tool, not only by convention.
  That includes the predicates in `*.laws.efx`.
- **Cost if wrong:**
  - A narrow `requires` filter can exhaust generation. The check then fails and says so; schemas
    that generate valid inputs directly fix it.
  - A law next to the code uses predicates that are not locked. The docs say to put important laws
    in `*.laws.efx`.

## Alternatives considered

- **Contracts first (`requires`/`ensures` on functions):** they can't state rules across functions.
  They come later as sugar that generates laws.
- **Laws only in test files:** they would lose their place next to the code and in the docs, and the
  model would have to find them.
- **Write `it.effect.prop` directly:** nothing marks it as a rule to prove, nothing names it for
  the docs, and it has no lock.
- **Separate law files only, as in Bend:** supported (`*.laws.efx`), not required. Laws next to the
  code document it where it's read.
- **CODEOWNERS only, without a lock:** depends on a host's review settings, and the tool can't
  check it.
- **A runtime `Law.make` helper in the module:** it would add a runtime dependency for a test-only
  feature. `Object.assign` on the property function needs nothing; the helpers live in
  `effectscript/laws` and only the `?laws` module and `efx verify` import them.
- **`requires` as an early `return true`:** skipped inputs would count as passes and hide a
  precondition that never holds.
