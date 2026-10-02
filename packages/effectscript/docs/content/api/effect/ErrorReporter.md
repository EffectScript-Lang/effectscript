# effect/ErrorReporter

The examples in the JSDoc of `packages/effect/src/ErrorReporter.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## make

**Forwarding errors to a callback**

```efx

const reports: Array<{ message: string; severity: string; attributes: object }> = []
const reporter = ErrorReporter.make(({ error, severity, attributes }) => {
  reports.push({ message: error.message, severity, attributes })
})

const program = fail(new Error("boom")).pipe(
  withErrorReporting,
  provide(ErrorReporter.layer([reporter])),
  exit
)

await runPromise(program)
reports // => [{ message: "boom", severity: "Info", attributes: {} }]
```

## layer

**Providing error reporters**

```efx

const reports: Array<string> = []
const firstReporter = ErrorReporter.make(({ error, severity }) => {
  reports.push(`[${severity}] ${error.message}`)
})
const secondReporter = ErrorReporter.make(({ error, severity }) => {
  reports.push(`${severity}: ${error.message}`)
})

// Replace all existing reporters
const ReporterLayer = ErrorReporter.layer([
  firstReporter,
  secondReporter
])

// Add to existing reporters instead of replacing
const ReporterMerged = ErrorReporter.layer(
  [secondReporter],
  { mergeWithExisting: true }
)

const program = fail("boom").pipe(
  withErrorReporting,
  provide(ReporterLayer),
  exit
)

await runPromise(program)
reports // => ["[Info] boom", "Info: boom"]
```

## report

**Reporting a cause manually**

```efx

const messages: Array<string> = []
const program = effect {
  const cause = Cause.fail("something went wrong")
  await ErrorReporter.report(cause)
  return "fallback value"
}

const reporter = ErrorReporter.make(({ error }) => messages.push(error.message))
const output = await runPromise(
  provide(program, ErrorReporter.layer([reporter]))
)
messages // => ["something went wrong"]
output // => "fallback value"
```

## ignore

**Marking errors as ignored**

```efx
import { Data, ErrorReporter } from "effect"

class NotFoundError extends Data.TaggedError("NotFoundError")<{}> {
  readonly [ErrorReporter.ignore] = true
}

ErrorReporter.isIgnored(new NotFoundError()) // => true
```

## severity

**Setting error severity annotations**

```efx
import { Data, ErrorReporter } from "effect"

class DeprecationWarning extends Data.TaggedError("DeprecationWarning")<{}> {
  readonly [ErrorReporter.severity] = "Warn" as const
}

ErrorReporter.getSeverity(new DeprecationWarning()) // => "Warn"
```

## attributes

**Setting error attributes**

```efx
import { Data, ErrorReporter } from "effect"

class PaymentError extends Data.TaggedError("PaymentError")<{
  readonly orderId: string
}> {
  readonly [ErrorReporter.attributes] = {
    orderId: this.orderId
  }
}

ErrorReporter.getAttributes(new PaymentError({ orderId: "order-123" })) // => { orderId: "order-123" }
```
