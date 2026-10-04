> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

# Fiber Keep-Alive: Automatic Process Lifetime Management

In v3, the core `effect` runtime did **not** keep the Node.js process alive while
fibers were suspended on certain asynchronous operations. If a fiber was waiting on
something like `Deferred.await` and there was no other work scheduled on the
event loop, the process would exit immediately — the fiber's suspension did not
register as pending work from Node.js's perspective.

The only way to prevent this was to use `runMain` from `@effect/platform-node`
(or `@effect/platform-bun`), which installed a long-lived `setInterval` timer
to hold the process open until the root fiber completed.

In v4, **the keep-alive mechanism is built into the core runtime**.

## The Problem in v3

Consider the following program:

```efx
const program = effect {
  const deferred = await Deferred.make<string>()

  await Deferred.await(deferred)
}

runPromise(program)
```

In v3, when the main fiber reached `yield* Deferred.await(deferred)`, it suspended
while waiting for the worker fiber to complete the deferred. However, from the
JavaScript runtime's perspective, the event loop had no more work to do. Thus,
the process would exit.

The workaround was to use `runMain` from the platform package, which installs
a timer that holds the process open until the root fiber completes:

```efx
import { NodeRuntime } from "@effect/platform-node"

NodeRuntime.runMain(program)
```

## What Changed in v4

In v4, the Effect fiber runtime automatically manages a reference-counted
keep-alive timer.

This means the following program works in v4 **without** `runMain`:

```efx
import { Fiber } from "effect"

const program = effect {
  const deferred = await Deferred.make<string>()

  // The process stays alive while waiting — no runMain needed
  await Deferred.await(deferred)
}

runPromise(program)
```

## `runMain` Is Still Recommended

Even though the core runtime now handles keep-alive, `runMain` from the platform
packages is still the recommended way to run Effect programs. It provides:

- **Signal handling** — listens for `SIGINT` / `SIGTERM` and interrupts the
  root fiber gracefully.
- **Exit code management** — calls `process.exit(code)` when the program fails
  or receives a signal.
- **Error reporting** — reports unhandled errors to the console.
