# ADR-0074: Proofs go through Bend2, from one `.efx` source; Lean 4 is dropped

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** the user (Bend2 instead of Lean 4, one source, several output modes), from a spike
  run by an agent
- **Related:** spec §14 (Proofs), which this replaces; `docs/superpowers/specs/2026-10-04-effectscript-proofs-design.md`;
  ADR-0075 (`law`); ADR-0076 (the Bend model); Plans 24–27; private research note "Bend2 as
  EffectScript's proof backend" (2026-10-04)

## Context

The spec's roadmap (§14) planned proofs in three stages: contracts, then export of pure functions
"to Lean 4 theorem statements and Bend2 specs", then CI. Nothing was built.

The user wants proofs for the parts of an application that must not break. Most projects that prove
things today write the program twice: once to run, and once in the prover's language. The user
does not want that. They also find Lean 4 too slow to check.

[Bend2](https://github.com/bendlang/bend) (Apache-2.0, release 2.0.35) is a pure, affine,
dependently typed language:

- **Laws and proofs.** A `law` states a claim, and a `def` with the same name proves it, with no
  tactics.
- **Fast checking.** It checks a file in under a second.
- **A proven recheck.** `--verdict` rechecks with a small kernel whose consistency and termination
  theorems are proven in Lean.
- **Runnable output.** It compiles to JavaScript.
- **An agent workflow.** Its stated workflow is the one we want: a human writes the laws and an
  agent writes the proofs.

A spike (2026-10-04) modeled three `.efx` programs in Bend2 the way a compiler would emit them:

- a function that `throws`;
- a service with state;
- a workflow state machine.

**Results:**

- **Six laws proven,** one of them a small check of closure conversion. All six pass the kernel.
  An earlier, closure-based encoding of one of them passed only the everyday checker.
- **Wrong code fails the proof.** A proof attempt found a real bug that random tests would rarely
  hit: transferring money to yourself creates money.
- **The model matches the code.** The model and EffectScript's compiled TypeScript agreed on
  20,006 random inputs.

## Decision

1. **One source.**
   - Laws and code are written once, in `.efx`.
   - The compiler emits TypeScript, which runs, and a Bend2 model of the same code, which is proven.
   - Nobody writes the program a second time.
2. **Bend2 is the proof backend.** Lean 4 is not pursued. The laws live in `.efx`, so another
   backend remains possible later if Bend2 stalls.
3. **Proofs are Bend `def`s,** written by agents (or people) against the generated model.
   EffectScript adds no proof language and no tactics.
4. **Modes:**
   - **`efx build` and tests:** TypeScript only. Laws run as property tests.
   - **`efx verify`:**
     - emits the model;
     - checks the proofs;
     - tests the model against the compiled code (differential testing);
     - prints a verdict per law.
   - **Later, opt-in:** a pure module may run on Bend's own output.
5. **A trust ladder, named in every verdict:**

   | Rung | Meaning |
   | ---- | ------- |
   | **fails** | A counterexample was found. |
   | **tested** | Property tests pass, and there is no valid proof. |
   | **proved** | bend2's checker accepts the proof. |
   | **proved, kernel** | `--verdict` accepts the proof too. |

   - A verdict states what it assumes, such as a service's model.
   - It also states how many inputs the model and the code agreed on.
   - A stale proof drops a law to *tested* with a warning; it doesn't break the build.
6. **Bend is an external tool, never a runtime dependency.**
   - Each EffectScript release pins one Bend version.
   - Without `bend` on the machine, `efx verify` still runs every law as a property test.
   - Production output contains nothing from the proof machinery.

## Consequences

- Laws are useful from the first plan, as property tests, before any Bend exists (Plan 24).
- **What must be built:**
  - a second emitter (Bend), held to the same golden-fixture discipline as the TypeScript one;
  - a Bend prelude for Effect's types: `Exit`, `Int`, `Option`, arrays, `HashMap`, with lemmas;
  - an `efx verify` command.
- **Proofs follow the shape of the code.** A refactor that keeps every law true can still break a
  proof. Repair is agent work, and the ladder keeps it from blocking anyone.
- **Toolchain risk.** Bend2 is young and releases often, and its everyday checker is unproven (the
  kernel is). The version pin and the separate kernel rung contain this risk.
- **Cost if wrong:** the property-test rung, the laws themselves and the model generator stay useful.
  Only the proofs are Bend-specific.

## Alternatives considered

- **Lean 4 export:** slow to check, the user's main objection. Its compiled code can't run as our
  JavaScript, so we'd keep a model gap anyway. We lose Lean's tactics and its libraries, which is the
  real cost of this choice.
- **Write the core in Bend and import it into `.efx`:** one implementation, but in a second
  language with Python syntax, unsigned numbers and no inference. The user wants one language.
- **A proof language inside `.efx`:** a large language to design and keep sound. Bend already is
  one, with a proven kernel.
- **Dafny, F\* or Liquid Haskell:** not evaluated in depth. SMT-backed checking is strong but can
  time out unpredictably. Each would bring a heavier toolchain. And none is designed around the
  human-laws, agent-proofs split.
