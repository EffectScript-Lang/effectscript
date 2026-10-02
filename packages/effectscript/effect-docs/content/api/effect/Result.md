# effect/Result

The examples in the JSDoc of `packages/effect/src/Result.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Result

**Creating and matching a Result**

```efx
import { Result } from "effect"

Result.match(Result.succeed(42), {
  onSuccess: (value) => `Success: ${value}`,
  onFailure: (error) => `Error: ${error}`
}) // => "Success: 42"
```

## Failure

**Accessing the failure value**

```efx
import { Result } from "effect"

const failure = Result.fail("Network error")

if (Result.isFailure(failure)) {
  failure.failure // => "Network error"
}
```

## Success

**Accessing the success value**

```efx
import { Result } from "effect"

const success = Result.succeed(42)

if (Result.isSuccess(success)) {
  success.success // => 42
}
```

## Result

**Extracting inner types**

```efx
import { Result } from "effect"

type R = Result.Result<number, string>

// number
type A = Result.Result.Success<R>

// string
type E = Result.Result.Failure<R>

const success: A = 42
const failure: E = "error"
```

## succeed

**Wrapping a value**

```efx
import { Result } from "effect"

Result.succeed(42) // => Result.succeed(42)
```

## fail

**Creating a failure**

```efx
import { Result } from "effect"

Result.fail("Something went wrong") // => Result.fail("Something went wrong")
```

## void

**Referencing void results**

```efx
import { Result } from "effect"

const result: Result.Result<void> = Result.void // => Result.succeed(undefined)
```

## failVoid

**Failing without a payload**

```efx
import { Result } from "effect"

Result.failVoid // => Result.fail(undefined)
```

## fromNullishOr

**Handling nullable values**

```efx
import { Result } from "effect"

Result.fromNullishOr(1, () => "fallback") // => Result.succeed(1)

Result.fromNullishOr(null, () => "fallback") // => Result.fail("fallback")
```

## fromOption

**Converting an Option to a Result**

```efx
import { Option, Result } from "effect"

Result.fromOption(Option.some(1), () => "missing") // => Result.succeed(1)

Result.fromOption(Option.none(), () => "missing") // => Result.fail("missing")
```

## try

**Catching JSON parse errors**

```efx
import { Result } from "effect"

Result.try(() => JSON.parse('{"name": "Alice"}')) // => Result.succeed({ name: "Alice" })

const err = Result.try({
  try: () => JSON.parse("not json"),
  catch: (e) => `Parse failed: ${e}`
})
Result.isFailure(err) // => true
```

## isResult

**Checking if a value is a Result**

```efx
import { Result } from "effect"

Result.isResult(Result.succeed(1)) // => true

Result.isResult({ value: 1 }) // => false
```

## isFailure

**Narrowing to failure**

```efx
import { Result } from "effect"

const result = Result.fail("oops")

if (Result.isFailure(result)) {
  result.failure // => "oops"
}
```

## isSuccess

**Narrowing to success**

```efx
import { Result } from "effect"

const result = Result.succeed(42)

if (Result.isSuccess(result)) {
  result.success // => 42
}
```

## getSuccess

**Extracting the success as an Option**

```efx
import { Option, Result } from "effect"

Result.getSuccess(Result.succeed("ok")) // => Option.some("ok")

Result.getSuccess(Result.fail("err")) // => Option.none()
```

## getFailure

**Extracting the failure as an Option**

```efx
import { Option, Result } from "effect"

Result.getFailure(Result.succeed("ok")) // => Option.none()

Result.getFailure(Result.fail("err")) // => Option.some("err")
```

## makeEquivalence

**Comparing Results for equality**

```efx
import { Equivalence, Result } from "effect"

const eq = Result.makeEquivalence(
  Equivalence.strictEqual<number>(),
  Equivalence.strictEqual<string>()
)

eq(Result.succeed(1), Result.succeed(1)) // => true

eq(Result.succeed(1), Result.fail("x")) // => false
```

## mapBoth

**Mapping both channels**

```efx
import { pipe } from "effect"

Result.succeed(1)
  |> Result.mapBoth({
    onSuccess: (n) => n + 1,
    onFailure: (e) => `Error: ${e}`
  }) // => Result.succeed(2)
```

## mapError

**Adding context to an error**

```efx
import { pipe } from "effect"

Result.fail("not found")
  |> Result.mapError((e) => `Error: ${e}`) // => Result.fail("Error: not found")
```

## map

**Doubling the success value**

```efx
import { pipe } from "effect"

Result.succeed(3)
  |> Result.map((n) => n * 2) // => Result.succeed(6)
```

## match

**Folding to a string**

```efx
import { pipe, Result } from "effect"

const format = Result.match({
  onSuccess: (n: number) => `Got ${n}`,
  onFailure: (e: string) => `Err: ${e}`
})

format(Result.succeed(42)) // => "Got 42"

format(Result.fail("timeout")) // => "Err: timeout"
```

## liftPredicate

**Validating a number**

```efx
import { pipe } from "effect"

5
  |> Result.liftPredicate(
    (n: number) => n > 0,
    (n) => `${n} is not positive`
  ) // => Result.succeed(5)
```

## filterOrFail

**Filtering a success value**

```efx
import { pipe } from "effect"

Result.succeed(0)
  |> Result.filterOrFail(
    (n) => n > 0,
    (n) => `${n} is not positive`
  ) // => Result.fail("0 is not positive")
```

## merge

**Extracting the inner value**

```efx
import { Result } from "effect"

Result.merge(Result.succeed(42)) // => 42

Result.merge(Result.fail("error")) // => "error"
```

## getOrElse

**Providing a fallback**

```efx
import { Result } from "effect"

Result.getOrElse(Result.succeed(1), () => 0) // => 1

Result.getOrElse(Result.fail("err"), () => 0) // => 0
```

## getOrNull

**Unwrapping to nullable**

```efx
import { Result } from "effect"

Result.getOrNull(Result.succeed(1)) // => 1

Result.getOrNull(Result.fail("err")) // => null
```

## getOrUndefined

**Unwrapping to optional**

```efx
import { Result } from "effect"

Result.getOrUndefined(Result.succeed(1)) // => 1

Result.getOrUndefined(Result.fail("err")) // => undefined
```

## getOrThrowWith

**Throwing a custom error**

```efx
import { Result } from "effect"

Result.getOrThrowWith(Result.succeed(1), () => new Error("fail")) // => 1

const failure = Result.try({
  try: () => Result.getOrThrowWith(
    Result.fail("oops"),
    (error) => new Error(`Unexpected: ${error}`)
  ),
  catch: (error) => (error as Error).message
})
Result.merge(failure) // => "Unexpected: oops"
```

## getOrThrow

**Unwrapping or throwing**

```efx
import { Result } from "effect"

Result.getOrThrow(Result.succeed(1)) // => 1

const failure = Result.try(() => Result.getOrThrow(Result.fail("error")))
Result.merge(failure) // => "error"
```

## orElse

**Recovering from a failure**

```efx
import { pipe } from "effect"

Result.fail("primary failed")
  |> Result.orElse(() => Result.succeed(99)) // => Result.succeed(99)
```

## flatMap

**Validating sequentially**

```efx
import { pipe } from "effect"

Result.succeed(5)
  |> Result.flatMap((n) =>
    n > 0 ? Result.succeed(n * 2) : Result.fail("not positive")
  ) // => Result.succeed(10)
```

## andThen

**Chaining Result values with different argument types**

```efx
import { pipe } from "effect"

// With a function returning a Result
const a = Result.succeed(1)
  |> Result.andThen((n) => Result.succeed(n + 1)) // => Result.succeed(2)

// With a plain mapping function
const b = Result.succeed(1)
  |> Result.andThen((n) => n + 1) // => Result.succeed(2)

// With a constant value
const c = Result.succeed(1) |> Result.andThen("done") // => Result.succeed("done")
```

## all

**Collecting a tuple and a struct**

```efx
import { Result } from "effect"

// Tuple
Result.all([Result.succeed(1), Result.succeed("two")]) // => Result.succeed([1, "two"])

// Struct
Result.all({ x: Result.succeed(1), y: Result.fail("err") }) // => Result.fail("err")
```

## flip

**Swapping channels**

```efx
import { Result } from "effect"

Result.flip(Result.succeed(42)) // => Result.fail(42)

Result.flip(Result.fail("error")) // => Result.succeed("error")
```

## gen

**Composing multiple Results**

```efx
import { Result } from "effect"

Result.gen(function*() {
  const a = yield* Result.succeed(1)
  const b = yield* Result.succeed(2)
  return a + b
}) // => Result.succeed(3)
```

## Do

**Building an object step by step**

```efx
import { pipe } from "effect"

Result.Do
  |> Result.bind("x", () => Result.succeed(2))
  |> Result.bind("y", () => Result.succeed(3))
  |> Result.let("sum", ({ x, y }) => x + y) // => Result.succeed({ x: 2, y: 3, sum: 5 })
```

## bind

**Binding Result values**

```efx
import { pipe } from "effect"

Result.Do
  |> Result.bind("x", () => Result.succeed(2))
  |> Result.bind("y", ({ x }) => Result.succeed(x + 3)) // => Result.succeed({ x: 2, y: 5 })
```

## bindTo

**Wrapping a value into a named field**

```efx
import { pipe } from "effect"

Result.succeed(42)
  |> Result.bindTo("answer") // => Result.succeed({ answer: 42 })
```

## let

**Adding a computed field**

```efx
import { pipe } from "effect"

Result.Do
  |> Result.bind("x", () => Result.succeed(2))
  |> Result.bind("y", () => Result.succeed(3))
  |> Result.let("sum", ({ x, y }) => x + y) // => Result.succeed({ x: 2, y: 3, sum: 5 })
```

## transposeOption

**Transposing an Option of a Result**

```efx
import { Option, Result } from "effect"

Result.transposeOption(Option.some(Result.succeed(42))) // => Result.succeed(Option.some(42))

Result.transposeOption(Option.none<Result.Result<number, string>>()) // => Result.succeed(Option.none())
```

## transposeMapOption

**Mapping and transposing in one step**

```efx
import { Option, Result } from "effect"

const parse = (s: string) =>
  isNaN(Number(s))
    ? Result.fail("not a number" as const)
    : Result.succeed(Number(s))

Result.transposeMapOption(Option.some("42"), parse) // => Result.succeed(Option.some(42))

Result.transposeMapOption(Option.none(), parse) // => Result.succeed(Option.none())
```

## succeedNone

**Succeeding with None**

```efx
import { Option, Result } from "effect"

Result.succeedNone // => Result.succeed(Option.none())
```

## succeedSome

**Wrapping a value in Some inside a Result**

```efx
import { Option, Result } from "effect"

Result.succeedSome(42) // => Result.succeed(Option.some(42))
```

## tap

**Logging a success value**

```efx
import { pipe } from "effect"

const values: Array<number> = []
const result = Result.succeed(42)
  |> Result.tap((n) => values.push(n))

values // => [42]
result // => Result.succeed(42)
```
