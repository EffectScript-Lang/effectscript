# ADR-0030: A reverse rewrite applies only where the forward compiler reproduces its input

- **Status:** Accepted, amended by ADR-0089 (a third canonicalization: index imports come back as module files)
- **Date:** 2026-10-03
- **Deciders:** agent ruling for Plan 6
- **Related:** spec §6.4, ADR-0023, review R07

## Context

Spec §6.4 says `toTypeScript(toEffectScript(ts)) = canonicalTS(ts)` for supported shapes, but it
doesn't say how much `canonicalTS` may change. Many reverse rewrites are tempting but would
compile back to different code:

- `stream.pipe(dest)` → `stream |> dest` compiles to `pipe(stream, dest)` when the head isn't
  known to be pipeable. That is `dest(stream)`, a different program.
- `return yield* new E()` → `throw new E()` compiles to `Effect.fail(new E())` unless `E` is an
  EffectScript `error` declaration.
- Removing an `effect` import makes the prelude re-insert it at the top of the file. That can move
  it before a side-effectful import.

"Semantically equivalent" is hard to check. Byte identity is easy to check.

## Decision

A reverse rewrite is applied only where compiling the result reproduces the input TypeScript
byte for byte. `toTypeScript(toEffectScript(ts), sameOptions).code === ts`. When a shape can't meet
that, the node stays TypeScript, and a note explains why.

There are two listed exceptions, called canonicalizations. Each produces a `canonicalized` note:

1. A native `throw e` directly inside an Effect generator becomes `return await die(e)`. That
   compiles to `return yield* Effect.die(e)`. Both are defects, both exit, and both keep
   control-flow narrowing.
2. Prelude names removed from an import that is kept come back at the end of its specifier list
   (`import { Data, Effect }` instead of `import { Effect, Data }`). Specifier order within one
   declaration is not observable.

`ConvertOptions` carries the compile options that change output (`filename`, `packageName`,
`packageRoot`, `runtime`, `prelude`). The reverse direction decides with the same inputs as the
forward one.

The evidence is two tests:

- Every golden fixture's compiled `.ts` round-trips to identical bytes, and its reverse output is
  snapshotted.
- On the `ai-docs/src` corpus, real hand-written Effect code, a file with no `canonicalized` note
  round-trips to identical bytes, and every reverse output compiles without errors.

## Consequences

- Conversion is safe by construction, and the property is cheap to test on any corpus.
- Some valid re-sugarings are skipped, for example `.pipe` on a head the forward compiler can't
  prove pipeable. Coverage grows by widening the forward compiler's knowledge, never by relaxing
  the check.
- The EffectScript side normalizes instead. For example, `Effect.Effect<A>` becomes `Effect<A>`,
  `using` becomes `const`, and `main` moves to the end. §6.4 lists these per shape.

## Alternatives considered

- **Semantic equivalence judged per shape:** it can't be checked mechanically, and the
  `stream.pipe` example shows how easily it goes wrong.
- **Verify by recompiling at conversion time and fall back per statement:** compile output depends
  on file-level context (imports, local error classes, service names), so statement-level
  recompilation is unreliable. The tests enforce the property instead.

## Amendment (2026-10-03, Plan 6 Task 1)

Running the harness on the `ai-docs` corpus showed that byte identity can't hold for hand-written
code. Layout like `Effect.fn("x")(\n  // note\n  function*…` has no EffectScript spelling that
compiles back to the same whitespace. The contract is refined:

- **Compiler output (golden fixtures):** byte identity, unchanged.
- **Any other TypeScript:** the round trip is *token- and comment-equivalent*. The code tokens are
  identical, except that trailing commas may be dropped. Every comment survives, in the same order.
  Only whitespace and the position of comments relative to code may change. A rewrite never drops a
  comment. If a comment sits inside text that a rewrite replaces, it moves to the nearest position
  that EffectScript can hold. For example, comments between `Effect.fn("x")(` and `function*` move
  above the declaration.
- **Import cleanup:** removing prelude imports is verified by recompiling, because its effect is
  file-wide. A removal happens only when the file compiles to the same output with and without it.
  This replaces exception 2 (specifier order), which no longer occurs. The `canonicalized:` notes
  now cover only exception 1.

## Amendment 2 (2026-10-03, Plan 6 final review)

The final review found inputs the tests didn't cover:

- conditional or parenthesized `pipe` heads;
- a brand on a union;
- `Schema.Literal(<identifier>)`;
- arrow pipe steps;
- `yield*` inside pipe heads;
- topic `$` in property keys.

For these, the reverse produced EffectScript that failed to parse or that compiled to different code.
Enforcing ADR-0030 only through tests leaves every unforeseen shape unguarded, so it is now also
checked at conversion time:

- **The guard:** `toEffectScript` recompiles its result with the same options and compares it with
  the input under the token-and-comment equivalence. A whole-file check is cheap (one compile)
  and doesn't have the per-statement context problem rejected above.
- **On failure:** the conversion is redone statement by statement. Top-level statements are added
  one at a time, each kept only if the file still verifies. A statement that fails stays
  TypeScript with a note. If even that doesn't verify, the input is returned unchanged with a
  note.
- **No exceptions:** the native-`throw` → `return await die(e)` canonicalization is withdrawn. A
  native `throw` in a generator is now a §6.3 blocker, so every conversion is verified the same
  way, and the `canonicalized:` note no longer exists.

## Amendment 3 (2026-10-03, Plan 7 final review)

- **Line breaks:** token equivalence now also covers line breaks where JavaScript's automatic
  semicolon insertion depends on them: after `return`, `throw`, `yield`, `break`, `continue` and
  `async`, and before `++`/`--`. Before this, `return (\n x) * 2` → `return \n x * 2` passed the
  check while changing what the `return` returns. The reverse never drops parentheses that
  contain a line break.
- **Fallback cost:** the guard's fallback bisects the top-level statements instead of adding them
  one at a time, and its probes skip the import pass, which runs once at the end. Isolating one
  failing statement among 400 dropped from about 8 s to well under a second.
- **No throws:** `toEffectScript` never throws. A converter error returns the input with a note.
