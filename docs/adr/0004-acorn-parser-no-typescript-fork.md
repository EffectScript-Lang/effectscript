# ADR-0004: Parse with acorn plugins; no TypeScript fork, no wasm

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** agent design (spike), approved with the spec
- **Related:** spec §3.3, §9.5; Plan 1 Task 1

## Context

The compiler must run in Node, Bun, editors, and the browser playground, and must parse all of
TypeScript plus the EffectScript syntax. Forking TypeScript or Bun is costly to maintain. A
Rust/oxc parser would need wasm in the browser.

## Decision

Use `acorn` with `@sveltejs/acorn-typescript`, plus our own `efxPlugin`: a subclass that overrides
tokenizer and parser methods. `|>` is a binary-operator token type. The compiler depends on
`acorn`, `@sveltejs/acorn-typescript` and `magic-string` only, and uses no Node APIs.

## Consequences

- The same pure-JS compiler runs everywhere, including the playground, with no wasm.
- Gaps in acorn-typescript are fixed with targeted overrides, each pinned by the superset test.
- Speed at very large scale is a roadmap item (an oxc/Rust port).

## Alternatives considered

- **Fork TypeScript's parser:** huge maintenance surface, and it follows TS releases.
- **Babel:** heavier, with weaker TS-specific coverage for our purposes.
- **oxc via wasm:** fast, but wasm in every host and plugin-unfriendly for custom syntax.
