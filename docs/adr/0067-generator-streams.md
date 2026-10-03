# ADR-0067: `effect*` declares a generator stream on `Stream.callback`

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** agent ruling for Plan 22 (phase 16), from the spec §14 roadmap
- **Related:** spec §4.3; ADR-0011 (resource lifetimes)

## Context

EffectScript consumed streams (`for await (const x of s)`) but couldn't produce one the way an
`async function*` produces an async iterable. Building a `Stream` by hand means choosing among
`Stream.unfold`, `Stream.paginate`, `Stream.callback` and others, and threading state through
them. An imperative generator body, with `yield` for each element and `await` for effects, is what
people already write in JavaScript.

Probing Effect v4:

- `Stream.callback` forks its producer, and a failure of the producer doesn't reach the stream:
  the stream waits forever.
- `Queue.into(queue)` completes the queue with the producer's exit, so the stream ends when the
  producer returns and fails (or dies) when it does.
- With `{ bufferSize: 1 }` the producer stays at most a couple of elements ahead (the queue hands
  out arrays), and an infinite producer under `Stream.take(3)` is interrupted.
- `Stream.callback` infers its element type only from context, because the type appears only on
  the queue parameter.

## Decision

- **Syntax:** `effect* name(…): A throws E needs R { … }`, also exported or `export default`. The
  return type names the element type and is required (EFX2006).
- **Output:** `const name = (…): Stream.Stream<A, E, R> => Stream.callback((queue) =>
  Effect.gen(function*() { … }).pipe(Queue.into(queue)), { bufferSize: 1 })`, with each `yield x` of
  the body as `yield* Queue.offer(queue, x)`.
- **A buffer of one:** the producer runs close to the consumer's pace, like a generator, rather
  than filling memory ahead of it.
- `yield*` inside is refused (EFX2007); `for await (const x of s) yield x` forwards another stream.
  Pipes after the declaration are refused (EFX2008).
- `yield` in nested functions and in plain `function*` generators is untouched.
- `effect * name(…)` is a declaration only when `:` or `{` follows the parameters, so a
  multiplication stays valid TypeScript.
- The reverse compiler gives `effect*` back from the exact output shape, when every use of the
  queue is an offer at the generator's own level.

## Consequences

- A stream is written like an async generator, with typed failures and resources (`defer`,
  `using`), and consumed with `for await` or any `Stream` combinator.
- The stream provides the scope its body runs in, so `defer` runs when the stream ends, fails or
  is interrupted.
- A buffer of one costs throughput for very fast producers; a stream that needs more uses
  `Stream` combinators directly.
- **Cost if wrong:** if Effect adds a generator constructor for streams, the output could move to it
  with a superseding ADR; the source wouldn't change.

## Alternatives considered

- **`Stream.callback` without `Queue.into`:** a failing body would hang the stream.
- **The default unbounded buffer:** an infinite generator would fill memory as fast as it can
  produce.
- **Inferring the element type:** `Stream.callback` can't; elements would be `unknown`.
- **`effect* () => { … }` arrows and `effect*` methods:** possible later; declarations cover the
  common case and keep this change small.

## Amendment 1 (Plan 22 final review)

- `effect * name(…)` is a stream when `:` follows the parameters, or `{` on the same line; a `{`
  on the next line starts a block after a multiplication, as in TypeScript.
