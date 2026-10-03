# effect/testing/TestConsole

The examples in the JSDoc of `packages/effect/src/testing/TestConsole.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## TestConsole

**Capturing console output in tests**

```efx
const program = effect {
  await Console.log("Hello, World!")
  await Console.error("An error occurred")

  const logs = await TestConsole.logLines
  const errors = await TestConsole.errorLines

  logs // => ["Hello, World!"]
  errors // => ["An error occurred"]
} |> provide(TestConsole.layer)

await runPromise(program)
```

## TestConsole.Method

**Typing captured console methods**

```efx
import type { TestConsole } from "effect/testing"

const method: TestConsole.TestConsole.Method = "log"
```

## TestConsole.Entry

**Typing captured console entries**

```efx
import type { TestConsole } from "effect/testing"

const entry: TestConsole.TestConsole.Entry = {
  method: "error",
  parameters: ["not found"]
}

entry // => { method: "error", parameters: ["not found"] }
```

## make

**Creating a test console**

```efx
const program = effect {
  await Console.log("Debug message")
  await Console.error("Error occurred")

  const logs = await TestConsole.logLines
  const errors = await TestConsole.errorLines

  logs // => ["Debug message"]
  errors // => ["Error occurred"]
} |> provide(TestConsole.layer)

await runPromise(program)
```

## testConsoleWith

**Accessing the test console service**

```efx
const program = TestConsole.testConsoleWith((testConsole) =>
  effect {
    testConsole.log("Test message")
    testConsole.error("Test error")

    const logs = await testConsole.logLines
    const errors = await testConsole.errorLines

    logs // => ["Test message"]
    errors // => ["Test error"]
  }
).pipe(provide(TestConsole.layer))

await runPromise(program)
```

## layer

**Providing a test console layer**

```efx
const program = effect {
  await Console.log("This will be captured")
  await Console.error("This error will be captured")

  const logs = await TestConsole.logLines
  const errors = await TestConsole.errorLines

  logs // => ["This will be captured"]
  errors // => ["This error will be captured"]
} |> provide(TestConsole.layer)

await runPromise(program)
```

## logLines

**Reading captured log lines**

```efx
const program = effect {
  await Console.log("First message")
  await Console.log("Second message", { key: "value" })
  await Console.log("Third message", 42, true)

  const logs = await TestConsole.logLines

  logs // => ["First message", "Second message", { key: "value" }, "Third message", 42, true]
} |> provide(TestConsole.layer)

await runPromise(program)
```

## errorLines

**Reading captured error lines**

```efx
const program = effect {
  await Console.error("Error message")
  await Console.error("Another error", new Error("Something went wrong"))

  const errors = await TestConsole.errorLines

  const messages = [errors[0], errors[1], errors[2] instanceof Error ? errors[2].message : undefined]
  messages // => ["Error message", "Another error", "Something went wrong"]
} |> provide(TestConsole.layer)

await runPromise(program)
```
