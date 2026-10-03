# effect/Runtime

The examples in the JSDoc of `packages/effect/src/Runtime.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Teardown

**Customizing teardown behavior**

```efx
// Custom teardown that maps completion status to an exit code
const customTeardown: Runtime.Teardown = (exit, onExit) => {
  onExit(Exit.isSuccess(exit) ? 0 : 1)
}

const completed = new Promise<readonly [Exit<unknown, unknown>, number]>((resolve) => {
// Use with makeRunMain
  const runMain = Runtime.makeRunMain(({ fiber, teardown }) => {
    fiber.addObserver((exit) => {
      teardown(exit, (code) => resolve([exit, code]))
    })
  })

  const program = succeed("Hello, World!")
  runMain(program, { teardown: customTeardown })
})

await completed // => [Exit.succeed("Hello, World!"), 0]
```

## defaultTeardown

**Referencing default teardown**

```efx
import { Exit, Runtime } from "effect"

const exitCodes: Array<number> = []
const collectExitCode = (exit: Exit.Exit<any, any>) =>
  Runtime.defaultTeardown(exit, (code) => exitCodes.push(code))

collectExitCode(Exit.succeed(42))
collectExitCode(Exit.fail("error"))
collectExitCode(Exit.interrupt(123))

exitCodes // => [0, 1, 130]
```

## makeRunMain

**Creating platform runners**

```efx
const events: Array<string> = []
const completed = new Promise<readonly [Exit<unknown, unknown>, number]>((resolve) => {
// Create a simple runner for a hypothetical platform
  const runMain = Runtime.makeRunMain(({ fiber, teardown }) => {
    // Handle fiber completion
    fiber.addObserver((exit) => {
      teardown(exit, (code) => resolve([exit, code]))
    })
  })

  // Use the runner
  const program = sync(() => {
    events.push("Starting program", "Program completed")
    return "success"
  })

  runMain(program, {
    teardown: (exit, onExit) => {
      events.push("Custom teardown logic")
      Runtime.defaultTeardown(exit, onExit)
    }
  })
})

const result = await completed
result // => [Exit.succeed("success"), 0]
events // => ["Starting program", "Program completed", "Custom teardown logic"]
```

## errorExitCode

**Setting a process exit code**

```efx
import { Data, Runtime } from "effect"

class MyError extends Data.TaggedError("MyError") {
  readonly [Runtime.errorExitCode] = 42
}

Runtime.getErrorExitCode(new MyError()) // => 42
```

## errorReported

**Suppressing error reporting**

```efx
import { Data, Runtime } from "effect"

class MyError extends Data.TaggedError("MyError") {
  readonly [Runtime.errorReported] = false
}

Runtime.getErrorReported(new MyError()) // => false
```
