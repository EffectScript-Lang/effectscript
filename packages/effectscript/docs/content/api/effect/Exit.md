# effect/Exit

The examples in the JSDoc of `packages/effect/src/Exit.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Exit

**Pattern matching on an Exit**

```efx
import { Exit } from "effect"

const success: Exit.Exit<number> = Exit.succeed(42)
const failure: Exit.Exit<number, string> = Exit.fail("error")

Exit.match(success, {
  onSuccess: (value) => `Got value: ${value}`,
  onFailure: (cause) => `Got error: ${cause}`
}) // => "Got value: 42"
```

## Success

**Accessing the success value**

```efx
import { Exit } from "effect"

const success = Exit.succeed(42)

if (Exit.isSuccess(success)) {
  success.value // => 42
}
```

## Failure

**Accessing the failure cause**

```efx
import { Cause, Exit } from "effect"

const failure = Exit.fail("something went wrong")

if (Exit.isFailure(failure)) {
  failure.cause // => Cause.fail("something went wrong")
}
```

## isExit

**Checking if a value is an Exit**

```efx
import { Exit } from "effect"

Exit.isExit(Exit.succeed(42)) // => true
Exit.isExit(Exit.fail("err")) // => true
Exit.isExit("not an exit") // => false
```

## succeed

**Creating a successful Exit**

```efx
import { Exit } from "effect"

Exit.succeed(42) // => Exit.succeed(42)
```

## failCause

**Creating a failed Exit from a Cause**

```efx
import { Cause, Exit } from "effect"

Exit.failCause(Cause.fail("Something went wrong")) // => Exit.fail("Something went wrong")
```

## fail

**Creating a failed Exit**

```efx
import { Exit } from "effect"

Exit.fail("Something went wrong") // => Exit.fail("Something went wrong")
```

## die

**Creating a defect Exit**

```efx
import { Exit } from "effect"

Exit.die("Unexpected error") // => Exit.die("Unexpected error")
```

## interrupt

**Creating an interruption Exit**

```efx
import { Exit } from "effect"

Exit.interrupt(123) // => Exit.interrupt(123)
```

## Module

**Referencing the void Exit**

```efx
import { Exit } from "effect"

Exit.void // => Exit.succeed(undefined)
```

## isSuccess

**Narrowing to success**

```efx
import { Exit } from "effect"

const exit = Exit.succeed(42)

if (Exit.isSuccess(exit)) {
  exit.value // => 42
}
```

## isFailure

**Narrowing to failure**

```efx
import { Cause, Exit } from "effect"

const exit = Exit.fail("error")

if (Exit.isFailure(exit)) {
  exit.cause // => Cause.fail("error")
}
```

## hasFails

**Checking for typed errors**

```efx
import { Exit } from "effect"

Exit.hasFails(Exit.fail("err")) // => true
Exit.hasFails(Exit.die("bug")) // => false
Exit.hasFails(Exit.succeed(42)) // => false
```

## hasDies

**Checking for defects**

```efx
import { Exit } from "effect"

Exit.hasDies(Exit.die("bug")) // => true
Exit.hasDies(Exit.fail("err")) // => false
Exit.hasDies(Exit.succeed(42)) // => false
```

## hasInterrupts

**Checking for interruptions**

```efx
import { Exit } from "effect"

Exit.hasInterrupts(Exit.interrupt(1)) // => true
Exit.hasInterrupts(Exit.fail("err")) // => false
Exit.hasInterrupts(Exit.succeed(42)) // => false
```

## filterSuccess

**Filtering for success**

```efx
import { Exit, Result } from "effect"

Exit.filterSuccess(Exit.succeed(42)) // => Result.succeed(Exit.succeed(42))
```

## filterValue

**Filtering for the value**

```efx
import { Exit, Result } from "effect"

Exit.filterValue(Exit.succeed(42)) // => Result.succeed(42)
```

## filterFailure

**Filtering for failure**

```efx
import { Exit, Result } from "effect"

Exit.filterFailure(Exit.fail("err")) // => Result.succeed(Exit.fail("err"))
```

## filterCause

**Filtering for the cause**

```efx
import { Cause, Exit, Result } from "effect"

Exit.filterCause(Exit.fail("err")) // => Result.succeed(Cause.fail("err"))
```

## findError

**Finding the first typed error**

```efx
import { Exit, Result } from "effect"

Exit.findError(Exit.fail("not found")) // => Result.succeed("not found")
Exit.findError(Exit.die("bug")) // => Result.fail(Exit.die("bug"))
```

## findDefect

**Finding the first defect**

```efx
import { Exit, Result } from "effect"

Exit.findDefect(Exit.die("boom")) // => Result.succeed("boom")
Exit.findDefect(Exit.fail("err")) // => Result.fail(Exit.fail("err"))
```

## match

**Matching on an Exit**

```efx
import { Exit } from "effect"

Exit.match(Exit.succeed(42), {
  onSuccess: (value) => `Got: ${value}`,
  onFailure: () => "Failed"
}) // => "Got: 42"
```

## map

**Mapping over a success**

```efx
import { Exit } from "effect"

Exit.map(Exit.succeed(21), (x) => x * 2) // => Exit.succeed(42)
```

## mapError

**Mapping over an error**

```efx
import { Exit } from "effect"

Exit.mapError(Exit.fail("bad input"), (error) => error.toUpperCase()) // => Exit.fail("BAD INPUT")
```

## mapBoth

**Mapping both channels**

```efx
import { Exit } from "effect"

Exit.mapBoth(Exit.succeed(42), {
  onSuccess: (x) => String(x),
  onFailure: (error: string) => error.toUpperCase()
}) // => Exit.succeed("42")
```

## asVoid

**Discarding the success value**

```efx
import { Exit } from "effect"

Exit.asVoid(Exit.succeed(42)) // => Exit.succeed(undefined)
```

## asVoidAll

**Combining exits**

```efx
import { Exit } from "effect"

Exit.asVoidAll([Exit.succeed(1), Exit.succeed(2), Exit.succeed(3)]) // => Exit.succeed(undefined)
Exit.asVoidAll([Exit.succeed(1), Exit.fail("err"), Exit.succeed(3)]) // => Exit.fail("err")
```

## getSuccess

**Getting the success value**

```efx
import { Exit, Option } from "effect"

Exit.getSuccess(Exit.succeed(42)) // => Option.some(42)
Exit.getSuccess(Exit.fail("err")) // => Option.none()
```

## getCause

**Getting the failure cause**

```efx
import { Cause, Exit, Option } from "effect"

Exit.getCause(Exit.fail("err")) // => Option.some(Cause.fail("err"))
Exit.getCause(Exit.succeed(42)) // => Option.none()
```

## findErrorOption

**Getting the first error**

```efx
import { Exit, Option } from "effect"

Exit.findErrorOption(Exit.fail("err")) // => Option.some("err")
Exit.findErrorOption(Exit.die("bug")) // => Option.none()
Exit.findErrorOption(Exit.succeed(42)) // => Option.none()
```
