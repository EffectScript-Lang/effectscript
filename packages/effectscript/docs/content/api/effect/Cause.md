# effect/Cause

The examples in the JSDoc of `packages/effect/src/Cause.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Cause

**Creating and inspecting a cause**

```efx
import { Cause } from "effect"

Cause.fail("Something went wrong") // => Cause.fail("Something went wrong")
```

## isCause

**Checking the runtime type**

```efx
import { Cause } from "effect"

Cause.isCause(Cause.fail("error")) // => true
Cause.isCause("not a cause") // => false
```

## isReason

**Checking the runtime type**

```efx
import { Cause } from "effect"

const reason = Cause.fail("error").reasons[0]
Cause.isReason(reason) // => true
Cause.isReason("not a reason") // => false
```

## Reason

**Narrowing a reason**

```efx
import { Cause } from "effect"

const reason = Cause.fail("error").reasons[0]
if (Cause.isFailReason(reason)) {
  reason.error // => "error"
}
```

## isFailReason

**Filtering fail reasons**

```efx
import { Cause } from "effect"

const cause = Cause.fail("error")
const fails = cause.reasons.filter(Cause.isFailReason)
fails[0].error // => "error"
```

## isDieReason

**Filtering die reasons**

```efx
import { Cause } from "effect"

const cause = Cause.die("defect")
const dies = cause.reasons.filter(Cause.isDieReason)
dies[0].defect // => "defect"
```

## isInterruptReason

**Filtering interrupt reasons**

```efx
import { Cause } from "effect"

const cause = Cause.interrupt(123)
const interrupts = cause.reasons.filter(Cause.isInterruptReason)
interrupts[0].fiberId // => 123
```

## Cause.Error

**Extracting the error type**

```efx
import type { Cause } from "effect"

// string
type E = Cause.Cause.Error<Cause.Cause<string>>
```

## Reason.Error

**Extracting the error type**

```efx
import type { Cause } from "effect"

// string
type E = Cause.Reason.Error<Cause.Reason<string>>
```

## Die

**Accessing the defect**

```efx
import { Cause } from "effect"

const cause = Cause.die("Unexpected")
const reason = cause.reasons[0]
if (Cause.isDieReason(reason)) {
  reason.defect // => "Unexpected"
}
```

## Fail

**Accessing the error**

```efx
import { Cause } from "effect"

const cause = Cause.fail("Something went wrong")
const reason = cause.reasons[0]
if (Cause.isFailReason(reason)) {
  reason.error // => "Something went wrong"
}
```

## Interrupt

**Accessing the fiber ID**

```efx
import { Cause } from "effect"

const cause = Cause.interrupt(123)
const reason = cause.reasons[0]
if (Cause.isInterruptReason(reason)) {
  reason.fiberId // => 123
}
```

## fromReasons

**Building a cause from reasons**

```efx
import { Cause } from "effect"

const reasons = [
  Cause.makeFailReason("err1"),
  Cause.makeFailReason("err2")
]
Cause.fromReasons(reasons) // => Cause.combine(Cause.fail("err1"), Cause.fail("err2"))
```

## empty

**Combining with the empty cause**

```efx
import { Cause } from "effect"

Cause.combine(Cause.empty, Cause.fail("boom")) // => Cause.fail("boom")
```

## fail

**Creating a fail cause**

```efx
import { Cause } from "effect"

Cause.fail("Something went wrong") // => Cause.fromReasons([Cause.makeFailReason("Something went wrong")])
```

## die

**Creating a die cause**

```efx
import { Cause } from "effect"

Cause.die("Unexpected") // => Cause.fromReasons([Cause.makeDieReason("Unexpected")])
```

## interrupt

**Creating an interrupt cause**

```efx
import { Cause } from "effect"

Cause.interrupt(123) // => Cause.fromReasons([Cause.makeInterruptReason(123)])
```

## makeFailReason

**Creating a Fail reason**

```efx
import { Cause } from "effect"

Cause.makeFailReason("error") // => Cause.fail("error").reasons[0]
```

## makeDieReason

**Creating a Die reason**

```efx
import { Cause } from "effect"

Cause.makeDieReason("bug") // => Cause.die("bug").reasons[0]
```

## makeInterruptReason

**Creating an Interrupt reason**

```efx
import { Cause } from "effect"

Cause.makeInterruptReason(42) // => Cause.interrupt(42).reasons[0]
```

## hasInterruptsOnly

**Checking interrupt-only causes**

```efx
import { Cause } from "effect"

Cause.hasInterruptsOnly(Cause.interrupt(123)) // => true
Cause.hasInterruptsOnly(Cause.fail("error")) // => false
Cause.hasInterruptsOnly(Cause.empty) // => false
```

## map

**Mapping errors to uppercase**

```efx
import { Cause } from "effect"

const cause = Cause.fail("error")
const mapped = Cause.map(cause, (e) => e.toUpperCase())
const reason = mapped.reasons[0]
if (Cause.isFailReason(reason)) {
  reason.error // => "ERROR"
}
```

## combine

**Combining two causes**

```efx
import { Cause } from "effect"

const combined = Cause.combine(Cause.fail("error1"), Cause.fail("error2"))
combined // => Cause.fromReasons([Cause.makeFailReason("error1"), Cause.makeFailReason("error2")])
```

## squash

**Squashing a cause**

```efx
import { Cause } from "effect"

Cause.squash(Cause.fail("error")) // => "error"
Cause.squash(Cause.die("defect")) // => "defect"
```

## hasFails

**Checking for typed errors**

```efx
import { Cause } from "effect"

Cause.hasFails(Cause.fail("error")) // => true
Cause.hasFails(Cause.die("defect")) // => false
```

## findFail

**Extracting the first Fail reason**

```efx
import { Cause, Result } from "effect"

Cause.findFail(Cause.fail("error")) // => Result.succeed(Cause.makeFailReason("error"))
```

## findError

**Extracting the first error value**

```efx
import { Cause, Result } from "effect"

Cause.findError(Cause.fail("error")) // => Result.succeed("error")
```

## findErrorOption

**Extracting an error as Option**

```efx
import { Cause, Option } from "effect"

Cause.findErrorOption(Cause.fail("error")) // => Option.some("error")
Cause.findErrorOption(Cause.die("defect")) // => Option.none()
```

## hasDies

**Checking for defects**

```efx
import { Cause } from "effect"

Cause.hasDies(Cause.die("defect")) // => true
Cause.hasDies(Cause.fail("error")) // => false
```

## findDie

**Extracting the first Die reason**

```efx
import { Cause, Result } from "effect"

Cause.findDie(Cause.die("defect")) // => Result.succeed(Cause.makeDieReason("defect"))
```

## findDefect

**Extracting the first defect**

```efx
import { Cause, Result } from "effect"

Cause.findDefect(Cause.die("defect")) // => Result.succeed("defect")
```

## hasInterrupts

**Checking for interruptions**

```efx
import { Cause } from "effect"

Cause.hasInterrupts(Cause.interrupt(123)) // => true
Cause.hasInterrupts(Cause.fail("error")) // => false
```

## findInterrupt

**Extracting the first interrupt**

```efx
import { Cause, Result } from "effect"

Cause.findInterrupt(Cause.interrupt(42)) // => Result.succeed(Cause.makeInterruptReason(42))
```

## interruptors

**Collecting interruptors**

```efx
import { Cause } from "effect"

const cause = Cause.combine(
  Cause.interrupt(1),
  Cause.interrupt(2)
)

Cause.interruptors(cause) // => new Set([1, 2])
```

## filterInterruptors

**Extracting interruptors with Result**

```efx
import { Cause, Result } from "effect"

Cause.filterInterruptors(Cause.interrupt(1)) // => Result.succeed(new Set([1]))
```

## prettyErrors

**Converting a cause to errors**

```efx
import { Cause } from "effect"

Cause.prettyErrors(Cause.fail(new Error("boom")))[0].message // => "boom"
```

## pretty

**Rendering a cause**

```efx
import { Cause } from "effect"

Cause.pretty(Cause.fail("something went wrong")).includes("something went wrong") // => true
```

## YieldableError

**Yielding an error in Effect.gen**

```efx
import { Cause, Effect, Exit } from "effect"

const error = new Cause.NoSuchElementError("not found")

const program = effect {
  return await error // fails the effect with NoSuchElementError
}

await runPromiseExit(program) // => Exit.fail(error)
```

## isNoSuchElementError

**Checking the runtime type**

```efx
import { Cause } from "effect"

Cause.isNoSuchElementError(new Cause.NoSuchElementError()) // => true
Cause.isNoSuchElementError("nope") // => false
```

## NoSuchElementError

**Creating a NoSuchElementError**

```efx
import { Cause } from "effect"

new Cause.NoSuchElementError("Element not found").message // => "Element not found"
```

## isDone

**Checking the runtime type**

```efx
import { Cause } from "effect"

Cause.isDone(Cause.Done()) // => true
Cause.isDone("not done") // => false
```

## Done

**Signaling queue completion**

```efx

const program = effect {
  const queue = await Queue.bounded<number, Cause.Done>(10)
  await Queue.offer(queue, 1)
  await Queue.end(queue)

  await Queue.take(queue)
  const result = await flip(Queue.take(queue))
  return Cause.isDone(result)
}

await runPromise(program) // => true
```

## done

**Failing with Done**

```efx
import { Cause, Effect, Exit } from "effect"

const program = Cause.done("finished")

await runPromiseExit(program) // => Exit.fail(Cause.Done("finished"))
```

## isTimeoutError

**Checking the runtime type**

```efx
import { Cause } from "effect"

Cause.isTimeoutError(new Cause.TimeoutError()) // => true
Cause.isTimeoutError("nope") // => false
```

## TimeoutError

**Creating a TimeoutError**

```efx
import { Cause } from "effect"

new Cause.TimeoutError("Operation timed out").message // => "Operation timed out"
```

## isIllegalArgumentError

**Checking the runtime type**

```efx
import { Cause } from "effect"

Cause.isIllegalArgumentError(new Cause.IllegalArgumentError()) // => true
Cause.isIllegalArgumentError("nope") // => false
```

## IllegalArgumentError

**Creating an IllegalArgumentError**

```efx
import { Cause } from "effect"

new Cause.IllegalArgumentError("Invalid argument").message // => "Invalid argument"
```

## isExceededCapacityError

**Checking the runtime type**

```efx
import { Cause } from "effect"

Cause.isExceededCapacityError(new Cause.ExceededCapacityError()) // => true
Cause.isExceededCapacityError("nope") // => false
```

## ExceededCapacityError

**Creating an ExceededCapacityError**

```efx
import { Cause } from "effect"

new Cause.ExceededCapacityError("Queue full").message // => "Queue full"
```

## isAsyncFiberError

**Checking the runtime type**

```efx

const fiber = runFork(Effect.void)

const error = new Cause.AsyncFiberError(fiber)
Cause.isAsyncFiberError(error) // => true
Cause.isAsyncFiberError("nope") // => false
```

## AsyncFiberError

**Accessing the fiber**

```efx

const fiber = runFork(Effect.void)

const value = new Cause.AsyncFiberError(fiber)
const isSameFiber = value.fiber === fiber
isSameFiber // => true
```

**Creating an AsyncFiberError**

```efx

const fiber = runFork(Effect.void)

new Cause.AsyncFiberError(fiber).message // => "An asynchronous Effect was executed with Effect.runSync"
```

## isUnknownError

**Checking the runtime type**

```efx
import { Cause } from "effect"

Cause.isUnknownError(new Cause.UnknownError("x")) // => true
Cause.isUnknownError("nope") // => false
```

## UnknownError

**Creating an UnknownError**

```efx
import { Cause } from "effect"

new Cause.UnknownError({ raw: true }, "Unexpected value").message // => "Unexpected value"
```

## annotate

**Annotating a cause**

```efx
import { Cause, Context } from "effect"

class RequestId extends Context.Service<RequestId, string>()("RequestId") {}

const annotated = Cause.annotate(Cause.fail("error"), Context.make(RequestId, "req-1"))
Context.getOrUndefined(Cause.annotations(annotated), RequestId) // => "req-1"
```

## reasonAnnotations

**Reading reason annotations**

```efx
import { Cause, Context } from "effect"

class RequestId extends Context.Service<RequestId, string>()("RequestId") {}

const reason = Cause.makeFailReason("error")
const annotated = reason.annotate(Context.make(RequestId, "req-1"))

Context.getOrUndefined(Cause.reasonAnnotations(annotated), RequestId) // => "req-1"
```

## annotations

**Reading merged annotations**

```efx
import { Cause, Context } from "effect"

class RequestId extends Context.Service<RequestId, string>()("RequestId") {}

const cause = Cause.annotate(
  Cause.fail("error"),
  Context.make(RequestId, "req-1")
)

Context.getOrUndefined(Cause.annotations(cause), RequestId) // => "req-1"
```
