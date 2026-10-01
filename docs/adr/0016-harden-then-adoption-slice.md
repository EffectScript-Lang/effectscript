# ADR-0016: Harden semantics, then prove an adoption slice

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** the user (option "Harden + adoption slice")
- **Related:** review "Suggested delivery sequence", R08; spec §13

## Context

Plan 1 delivered the core language with golden, type-check and runtime tests. The original next
step was more constructs (library keywords, ambient capture, observability, strict mode). The
review showed semantic bugs in the existing constructs. It also argued that the riskiest product
claims are unproven: using `.efx` in a real TypeScript project, with editors, type checking,
packaging and a way back out.

## Decision

The delivery order becomes:

1. **Plan 2: semantic hardening.** ADRs 0009–0014 and 0017, the double-visit bug (D02),
   lexical-lookahead robustness (D06), role-aware editor mappings (D10), and behavior tests that
   observe order, cleanup and failure kinds rather than only generated text (R14).
2. **Plan 3: adoption slice.** A committed fixture project in which:
   - one `.efx` module (an effect, a schema, a typed failure) is consumed by a plain `.ts` file;
   - `efx build` uses graph-aware import rewriting (R10);
   - `efx check` runs real type checking through Volar on the TypeScript 6 JS API, with an
     intentional error mapped to the `.efx` range (R09);
   - the result runs on Node;
   - VS Code gives completion, rename, definition and hover, including on incomplete code;
   - the supported subset converts back to TypeScript;
   - a packed-package consumer needs no plugin.
3. Then the original construct work (§4.14–4.17), the full reverse compiler, distribution, the
   skill and the site, each with evidence attached to its claims (R15).

## Consequences

- Visible features arrive later. The constructs that ship rest on tested semantics, and an
  end-to-end path is proven early.
- The editor slice starts before every construct exists, so parser recovery must be addressed in
  Plan 3, not left to the roadmap.

## Alternatives considered

- **Hardening only, then features:** tooling risk stays unretired for longer.
- **The original order, folding fixes in:** builds more surface on known-broken semantics.
