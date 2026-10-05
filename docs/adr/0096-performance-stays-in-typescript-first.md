# ADR-0096: Make the compiler faster in TypeScript before porting it

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** the user (a Zig compiler beside the TypeScript one is acceptable if both pass the
  tests); agent ruling to measure and parallelize first
- **Related:** ADR-0004 (acorn, no fork, no wasm), ADR-0030 (round trips), ADR-0089, ADR-0094

## Context

Once ADR-0089 made the reverse compiler recognize `import * as Effect from "effect/Effect"`, far
more real code converted, and converting the real-projects corpus went from minutes to over an
hour. Measured on alchemy:

- the reverse compiler averages about 106 ms per file, up from about 5 ms, because most files now
  convert instead of returning early;
- a converted file is compiled forward about five times to verify the round trip (ADR-0030), and
  the largest file (104 KB) takes about 3–5 s;
- shortcuts in the import verification (trying every import group at once first) didn't reduce the
  number of compiles (5.4 → 6.0 per file), so they were reverted;
- the forward compiler itself is fast: tens of milliseconds on the largest file, so editors and
  builds aren't affected.

The user offered a native compiler (Zig) next to the TypeScript one.

## Decision

- **Not now.** The time goes to verification by design, and a second implementation means a second
  TypeScript-superset parser and compiler kept identical to the first, against ADR-0004.
- **First, the cheap levers:**
  - the corpus converts each project's files over worker threads (`convertRepoParallel`, one
    worker per core less two), with identical results;
  - verifying only the statements a conversion touches, instead of recompiling the whole file
    per check, is the next step if `efx convert` on large files is too slow.
- **A native port stays open.** It becomes worth it when the forward compiler is the bottleneck
  (editor latency, build times on large projects). Then the TypeScript compiler is the reference,
  and the golden fixtures and corpus reports are the conformance suite both must pass.

## Consequences

- One implementation to maintain. The fixtures and the corpus keep measuring what matters.
- `efx convert` on very large files stays slow (seconds) until verification is incremental.

## Alternatives considered

- **A Zig (or Rust) compiler beside the TypeScript one:** the user accepted it. It's deferred: the
  bottleneck isn't compile speed, and two compilers double every language change.
- **Drop verification:** the round trip is what makes conversion safe (ADR-0030).
