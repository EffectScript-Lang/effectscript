# ADR-0003: Compile in place to idiomatic Effect TypeScript

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** agent design, approved by the user with the spec; refined by the plan review
- **Related:** spec §2, §5; `docs/reviews/2026-10-02-effectscript-plan-review.md` (D15)

## Context

Output must read like the Effect code an expert writes by hand, for review, debugging, AI
training, and a credible way out. Editors also need exact positions, mapping every token back to
`.efx`.

## Decision

- The compiler edits the original source text in place with `magic-string`: keyword overwrites,
  insertions at node boundaries, and node moves. Untouched text passes through byte for byte.
- Output is idiomatic Effect v4 (`Effect.fn`, `Effect.gen`, `Schema.Class`, `Context.Service`, …),
  with no EffectScript runtime library and no opaque helper calls.
- **Refinement (from the plan review, D15):** "no helper runtime" doesn't forbid generated local
  code. When correctness needs it, the compiler may emit readable local temporaries, arrow
  functions, or IIFEs. Correct evaluation order beats a clever text edit.
- Source maps (v3) and Volar `CodeMapping`s come from the same edit history.

## Consequences

- Fast compiler, exact mappings, and output that diffs cleanly against the source.
- Transforms must follow magic-string's edit-ordering rules: never overwrite a range that contains
  other edit points; openers `appendRight` and closers `prependLeft` before walking, `appendLeft`
  after.
- Some lowerings are harder than they would be with an AST printer.

## Alternatives considered

- **Generate a new AST and print it:** loses formatting and comments, and the mappings become
  approximate.
- **Ship a small runtime library:** shorter output, but it isn't idiomatic Effect, hides
  semantics, and ties users to EffectScript.
