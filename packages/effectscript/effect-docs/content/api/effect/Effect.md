# effect/Effect

The examples in the JSDoc of `packages/effect/src/Effect.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## isEffect

**Checking whether a value is an Effect**

```efx
isEffect(succeed(1)) // => true
isEffect("hello") // => false
```

## all

**Collecting tuple results in order**

```efx
const tupleOfEffects = [
  succeed(42),
  succeed("Hello")
] as const

//      ┌─── Effect<[number, string], never, never>
//      ▼
const resultsAsTuple = all(tupleOfEffects)

await runPromise(resultsAsTuple) // => [42, "Hello"]
```

**Collecting iterable results in order**

```efx
const iterableOfEffects: Iterable<Effect<number>> = [1, 2, 3].map(
  succeed
)

//      ┌─── Effect<number[], never, never>
//      ▼
const resultsAsArray = all(iterableOfEffects)

await runPromise(resultsAsArray) // => [1, 2, 3]
```

**Collecting struct results by key**

```efx
const structOfEffects = {
  a: succeed(42),
  b: succeed("Hello")
}

//      ┌─── Effect<{ a: number; b: string; }, never, never>
//      ▼
const resultsAsStruct = all(structOfEffects)

await runPromise(resultsAsStruct) // => { a: 42, b: "Hello" }
```

**Collecting record results by key**

```efx
const recordOfEffects: Record<string, Effect<number>> = {
  key1: succeed(1),
  key2: succeed(2)
}

//      ┌─── Effect<{ [x: string]: number; }, never, never>
//      ▼
const resultsAsRecord = all(recordOfEffects)

await runPromise(resultsAsRecord) // => { key1: 1, key2: 2 }
```

**Stopping on the first failure**

```efx
import { Exit } from "effect"
const output: Array<unknown> = []
const record = (value: unknown) => sync(() => { output.push(value) })

const program = all([
  succeed("Task1").pipe(tap(record)),
  fail("Task2: Oh no!").pipe(tap(record)),
  // Won't execute due to earlier failure
  succeed("Task3").pipe(tap(record))
])

const outcome = await runPromiseExit(program)
const observation = [output, outcome] // => [["Task1"], Exit.fail("Task2: Oh no!")]
```

## partition

**Separating successes and failures**

```efx
const program = partition([0, 1, 2, 3], (n) =>
  n % 2 === 0 ? fail(`${n} is even`) : succeed(n)
)

await runPromise(program) // => [[1, 3], ['0 is even', '2 is even']]
```

## reduce

**Summing values sequentially**

```efx
const output: Array<unknown> = []

const program = reduce(
  [1, 2, 3],
  () => 0,
  (total, value, index) =>
    sync(() => { output.push(`Adding ${value} at index ${index}`) }).pipe(
      as(total + value)
    )
)

void output.push(await runPromise(program))
output // => ["Adding 1 at index 0", "Adding 2 at index 1", "Adding 3 at index 2", 6]
```

## validate

**Validating every element**

```efx
import { Exit } from "effect"

const program = validate([0, 1, 2, 3], (n) =>
  n % 2 === 0 ? fail(`${n} is even`) : succeed(n)
)

await runPromiseExit(program) // => Exit.fail(["0 is even", "2 is even"])
```

## findFirst

**Finding the first successful match**

```efx
import { Option } from "effect"

const program = findFirst([1, 2, 3, 4], (n) => succeed(n > 2))

await runPromise(program) // => Option.some(3)
```

## forEach

**Mapping over an iterable with effects**

```efx
const output: Array<unknown> = []

const result = forEach(
  [1, 2, 3, 4, 5],
  (n, index) =>
    sync(() => { output.push(`Currently at index ${index}`) }).pipe(as(n * 2))
)

void output.push(await runPromise(result))
output // => ["Currently at index 0", "Currently at index 1", "Currently at index 2", "Currently at index 3", "Currently at index 4", [2, 4, 6, 8, 10]]
```

**Running effects without collecting results**

```efx
const output: Array<unknown> = []

// Apply effects but discard the results
const result = forEach(
  [1, 2, 3, 4, 5],
  (n, index) =>
    sync(() => { output.push(`Currently at index ${index}`) }).pipe(as(n * 2)),
  { discard: true }
)

void output.push(await runPromise(result))
output // => ["Currently at index 0", "Currently at index 1", "Currently at index 2", "Currently at index 3", "Currently at index 4", undefined]
```

## head

**Getting the first element**

```efx
import { Option } from "effect"

const first = await runPromise(head(succeed([1, 2, 3])))
first // => 1

const empty = head(succeed([] as Array<number>)).pipe(catchNoSuchElement)
await runPromise(empty) // => Option.none()
```

## whileLoop

**Repeating an effectful loop**

```efx
const output: Array<unknown> = []

let counter = 0

const program = whileLoop({
  while: () => counter < 5,
  body: () => sync(() => ++counter),
  step: (n) => void output.push(`Current count: ${n}`)
})

await runPromise(program)
output // => ["Current count: 1", "Current count: 2", "Current count: 3", "Current count: 4", "Current count: 5"]
```

## promise

**Wrapping a non-rejecting Promise**

```efx
const succeedAsync = (message: string) =>
  promise<string>(() => Promise.resolve(message))

//      ┌─── Effect<string, never, never>
//      ▼
const program = succeedAsync("Async operation completed successfully!")
await runPromise(program) // => "Async operation completed successfully!"
```

## tryPromise

**Wrapping a fetch request that may fail**

```efx
const getTodo = (id: number) =>
  tryPromise(() => Promise.resolve({ id, completed: false }))

//      ┌─── Effect<{ id: number; completed: boolean }, UnknownError, never>
//      ▼
const program = getTodo(1)
await runPromise(program) // => { id: 1, completed: false }
```

**Mapping Promise rejections to a tagged error**

```efx
class TodoFetchError extends Data.TaggedError("TodoFetchError")<{ readonly cause: unknown }> {}

const getTodo = (id: number) =>
  tryPromise({
    try: () => Promise.reject(`Todo ${id} is unavailable`),
    // remap the error
    catch: (cause) => new TodoFetchError({ cause })
  })

//      ┌─── Effect<never, TodoFetchError, never>
//      ▼
const program = flip(getTodo(1))
const error = await runPromise(program)
error._tag // => "TodoFetchError"
```

## succeed

**Creating a successful effect**

```efx
// Creating an effect that represents a successful scenario
//
//      ┌─── Effect<number, never, never>
//      ▼
const success = succeed(42)
runSync(success) // => 42
```

## succeedNone

**Succeeding with Option.none**

```efx
import { Option } from "effect"

const program = succeedNone

runSync(program) // => Option.none()
```

## succeedSome

**Succeeding with Option.some**

```efx
import { Option } from "effect"

const program = succeedSome(42)

runSync(program) // => Option.some(42)
```

## suspend

**Lazily evaluating side effects**

```efx
let i = 0

const bad = succeed(i++)

const good = suspend(() => succeed(i++))

runSync(bad) // => 0
runSync(bad) // => 0

runSync(good) // => 1
runSync(good) // => 2
```

**Suspending recursive Fibonacci evaluation**

```efx
const blowsUp = (n: number): Effect<number> =>
  n < 2
    ? succeed(1)
    : zipWith(blowsUp(n - 1), blowsUp(n - 2), (a, b) => a + b)

// console.log(Effect.runSync(blowsUp(32)))
// crash: JavaScript heap out of memory

const allGood = (n: number): Effect<number> =>
  n < 2
    ? succeed(1)
    : zipWith(
        suspend(() => allGood(n - 1)),
        suspend(() => allGood(n - 2)),
        (a, b) => a + b
      )

runSync(allGood(16)) // => 1597
```

**Helping TypeScript infer recursive effect types**

```efx
//   Without suspend, TypeScript may struggle with type inference.
//   Inferred type:
//     (a: number, b: number) =>
//       Effect<never, Error, never> | Effect<number, never, never>
const withoutSuspend = (a: number, b: number) =>
  b === 0
    ? fail(new Error("Cannot divide by zero"))
    : succeed(a / b)

//   Using suspend to unify return types.
//   Inferred type:
//     (a: number, b: number) => Effect<number, Error, never>
const withSuspend = (a: number, b: number) =>
  suspend(() =>
    b === 0
      ? fail(new Error("Cannot divide by zero"))
      : succeed(a / b)
  )

runSync(withSuspend(6, 2)) // => 3
```

## sync

**Capturing synchronous logging in an Effect**

```efx
const output: Array<unknown> = []

const log = (message: string) =>
  sync(() => {
    void output.push(message) // side effect
  })

//      ┌─── Effect<void, never, never>
//      ▼
const program = log("Hello, World!")
runSync(program)
output // => ["Hello, World!"]
```

## callback

**Integrating callback APIs**

```efx
const output: Array<unknown> = []

const fromCallback = (message: string) =>
  callback<void>((resume) => {
    queueMicrotask(() => {
      void output.push(message)
      resume(Effect.void)
    })
  })

await runPromise(fromCallback("callback completed"))
output // => ["callback completed"]
```

## never

**Creating a never-ending effect**

```efx
import { Option } from "effect"

const program = timeoutOption(never, 0)
await runPromise(program) // => Option.none()
```

## Do

**Starting do notation**

```efx
const program = Do
  |> bind("x", () => succeed(2))
  |> bind("y", ({ x }) => succeed(x + 1))
  |> Effect.let("sum", ({ x, y }) => x + y)

runSync(program) // => { x: 2, y: 3, sum: 5 }
```

## gen

**Sequencing effects with generators**

```efx
class DiscountRateError extends Data.TaggedError("DiscountRateError")<{}> {}

const addServiceCharge = (amount: number) => amount + 1

const applyDiscount = (
  total: number,
  discountRate: number
): Effect<number, DiscountRateError> =>
  discountRate === 0
    ? fail(new DiscountRateError())
    : succeed(total - (total * discountRate) / 100)

const fetchTransactionAmount = promise(() => Promise.resolve(100))

const fetchDiscountRate = promise(() => Promise.resolve(5))

export const program = effect {
  const transactionAmount = await fetchTransactionAmount
  const discountRate = await fetchDiscountRate
  const discountedAmount = await applyDiscount(
    transactionAmount,
    discountRate
  )
  const finalAmount = addServiceCharge(discountedAmount)
  return `Final amount to charge: ${finalAmount}`
}

await runPromise(program) // => "Final amount to charge: 96"
```

## fail

**Creating a failed effect**

```efx
class OperationFailedError extends Data.TaggedError("OperationFailedError")<{}> {}

//      ┌─── Effect<never, OperationFailedError, never>
//      ▼
const failure = fail(
  new OperationFailedError()
)
runSync(flip(failure))._tag // => "OperationFailedError"
```

## failSync

**Lazily creating failures**

```efx
class ProgramError extends Data.TaggedError("ProgramError")<{ readonly operation: string }> {}

const program = failSync(() => new ProgramError({ operation: "sync" }))

runSync(flip(program)).operation // => "sync"
```

## failCause

**Failing with a full Cause**

```efx
const program = failCause(
  Cause.fail("Network error")
)

runSync(flip(program)) // => "Network error"
```

## failCauseSync

**Lazily creating a Cause**

```efx
const program = failCauseSync(() =>
  Cause.fail("Error computed at runtime")
)

runSync(flip(program)) // => "Error computed at runtime"
```

## die

**Failing on division by zero**

```efx
import { Exit } from "effect"

const defect = new Error("Cannot divide by zero")
const divide = (a: number, b: number) =>
  b === 0
    ? die(defect)
    : succeed(a / b)

//      ┌─── Effect<number, never, never>
//      ▼
const program = divide(1, 0)

runSyncExit(program) // => Exit.die(defect)
```

## try

**Parsing JSON**

```efx
const parseJSON = (input: string) =>
  Effect.try(() => JSON.parse(input))

// Success case
await runPromise(parseJSON("{\"name\": \"Alice\"}")) // => { name: 'Alice' }

// Failure case maps the thrown value to UnknownError
const exit = await runPromiseExit(parseJSON("invalid json"))
exit._tag // => "Failure"
```

**Mapping exceptions to a tagged error**

```efx
class JsonParsingError extends Data.TaggedError("JsonParsingError")<{ readonly cause: unknown }> {}

const parseJSON = (input: string) =>
  Effect.try({
    try: () => JSON.parse(input),
    catch: (cause) => new JsonParsingError({ cause })
  })

const error = await runPromise(flip(parseJSON("invalid json")))
error._tag // => "JsonParsingError"
```

## yieldNow

**Yielding to other fibers**

```efx
const output: Array<unknown> = []

const program = effect {
  void output.push("Before yield")
  await yieldNow
  void output.push("After yield")
}

await runPromise(program)
output // => ["Before yield", "After yield"]
```

## yieldNowWith

**Yielding with priority**

```efx
const output: Array<unknown> = []

const program = effect {
  void output.push("High priority task")
  await yieldNowWith(10) // Higher priority
  void output.push("Continued after yield")
}

await runPromise(program)
output // => ["High priority task", "Continued after yield"]
```

## withFiber

**Reading the current fiber**

```efx
const program = withFiber((fiber) => succeed(typeof fiber.id))

runSync(program) // => "number"
```

## withFiberSucceed

**Computing a value from the current fiber**

```efx
const program = withFiberSucceed((fiber) => typeof fiber.id)

runSync(program) // => "number"
```

## fromResult

**Converting a Result into an Effect**

```efx
const output: Array<unknown> = []

const success = Result.succeed(42)
const failure = Result.fail("Something went wrong")

const effect1 = fromResult(success)
const effect2 = fromResult(failure)

void output.push(runSync(effect1))
void output.push(runSync(flip(effect2)))
output // => [42, "Something went wrong"]
```

## fromOption

**Converting an Option into an Effect**

```efx
const output: Array<unknown> = []

const some = Option.some(42)
const none = Option.none()

const effect1 = fromOption(some)
const effect2 = fromOption(none)
const effect3 = fromOption(none, () => new Error("missing"))

void output.push(runSync(effect1))
void output.push(runSync(flip(effect2))._tag)
void output.push(runSync(flip(effect3)).message)
output // => [42, "NoSuchElementError", "missing"]
```

## transposeOption

**Transposing an Option of an Effect**

```efx
const some = Option.some(succeed(42))

//      ┌─── Effect<Option<number>, never, never>
//      ▼
const program = transposeOption(some)

runSync(program) // => Option.some(42)
```

## fromNullishOr

**Failing on nullish values**

```efx
const output: Array<unknown> = []

const program = Effect.fn(function*(input: string | null) {
  const value = yield* fromNullishOr(input)
  yield* sync(() => { output.push(value) })
},
  Effect.catch(() => sync(() => { output.push("missing") }))
)

await runPromise(program(null))
await runPromise(program("hello"))
output // => ["missing", "hello"]
```

## flatMap

**Choosing flatMap syntax variants**

```efx
const output: Array<unknown> = []

const myEffect = succeed(1)
const transformation = (n: number) => succeed(n + 1)

const flatMappedWithPipe = myEffect |> flatMap(transformation)
const flatMappedWithDataFirst = flatMap(myEffect, transformation)
const flatMappedWithMethod = myEffect.pipe(flatMap(transformation))

void output.push(runSync(all([
  flatMappedWithPipe,
  flatMappedWithDataFirst,
  flatMappedWithMethod
])))
output // => [[2, 2, 2]]
```

**Sequencing dependent effects**

```efx
class DiscountRateError extends Data.TaggedError("DiscountRateError")<{}> {}

// Function to apply a discount safely to a transaction amount
const applyDiscount = (
  total: number,
  discountRate: number
): Effect<number, DiscountRateError> =>
  discountRate === 0
    ? fail(new DiscountRateError())
    : succeed(total - (total * discountRate) / 100)

// Simulated asynchronous task to fetch a transaction amount from database
const fetchTransactionAmount = promise(() => Promise.resolve(100))

// Chaining the fetch and discount application using `flatMap`
const finalAmount = fetchTransactionAmount
  |> flatMap((amount) => applyDiscount(amount, 5))

await runPromise(finalAmount) // => 95
```

## flatten

**Flattening nested effects**

```efx
const output: Array<unknown> = []

const nested = succeed(succeed("hello"))

const program = effect {
  const value = await flatten(nested)
  await sync(() => { output.push(value) })
}

runSync(program)
output // => ["hello"]
```

## andThen

**Choosing andThen syntax variants**

```efx
const output: Array<unknown> = []

const myEffect = succeed(1)
const anotherEffect = succeed("done")

const transformedWithPipe = myEffect |> andThen(anotherEffect)
const transformedWithDataFirst = andThen(myEffect, anotherEffect)
const transformedWithMethod = myEffect.pipe(andThen(anotherEffect))

void output.push(runSync(all([
  transformedWithPipe,
  transformedWithDataFirst,
  transformedWithMethod
])))
output // => [['done', 'done', 'done']]
```

**Sequencing a discount calculation after fetching a total**

```efx
class DiscountRateError extends Data.TaggedError("DiscountRateError")<{}> {}

// Function to apply a discount safely to a transaction amount
const applyDiscount = (
  total: number,
  discountRate: number
): Effect<number, DiscountRateError> =>
  discountRate === 0
    ? fail(new DiscountRateError())
    : succeed(total - (total * discountRate) / 100)

// Simulated asynchronous task to fetch a transaction amount from database
const fetchTransactionAmount = promise(() => Promise.resolve(100))

// Using Effect.map and Effect.flatMap
const result1 = fetchTransactionAmount
  |> map((amount) => amount * 2)
  |> flatMap((amount) => applyDiscount(amount, 5))

await runPromise(result1) // => 190

// Using Effect.andThen
const result2 = fetchTransactionAmount
  |> andThen((amount) => succeed(amount * 2))
  |> andThen((amount) => applyDiscount(amount, 5))

await runPromise(result2) // => 190
```

## tap

**Logging a step in a pipeline**

```efx
const output: Array<unknown> = []

class DiscountRateError extends Data.TaggedError("DiscountRateError")<{}> {}

// Function to apply a discount safely to a transaction amount
const applyDiscount = (
  total: number,
  discountRate: number
): Effect<number, DiscountRateError> =>
  discountRate === 0
    ? fail(new DiscountRateError())
    : succeed(total - (total * discountRate) / 100)

// Simulated asynchronous task to fetch a transaction amount from database
const fetchTransactionAmount = promise(() => Promise.resolve(100))

const finalAmount = fetchTransactionAmount
  // Log the fetched transaction amount
  |> tap((amount) => sync(() => { output.push(`Apply a discount to: ${amount}`) }))
  // `amount` is still available!
  |> flatMap((amount) => applyDiscount(amount, 5))

void output.push(await runPromise(finalAmount))
output // => ["Apply a discount to: 100", 95]
```

## result

**Capturing success or failure as Result**

```efx
import { Result } from "effect"

const success = succeed(42)
const failure = fail("Something went wrong")

const program1 = result(success)
const program2 = result(failure)

runSync(program1) // => Result.succeed(42)

runSync(program2) // => Result.fail("Something went wrong")
```

## option

**Capturing success or failure as Option**

```efx
import { Option } from "effect"

const program = all([
  option(succeed(1)),
  option(fail("missing"))
])

runSync(program) // => [Option.some(1), Option.none()]
```

## exit

**Capturing completion as Exit**

```efx
import { Exit } from "effect"

const success = succeed(42)
const failure = fail("Something went wrong")

const program1 = exit(success)
const program2 = exit(failure)

runSync(program1) // => Exit.succeed(42)

runSync(program2) // => Exit.fail("Something went wrong")
```

## map

**Choosing map syntax variants**

```efx
const output: Array<unknown> = []

const myEffect = succeed(1)
const transformation = (n: number) => n + 1

const mappedWithPipe = myEffect |> map(transformation)
const mappedWithDataFirst = map(myEffect, transformation)
const mappedWithMethod = myEffect.pipe(map(transformation))

void output.push(runSync(all([
  mappedWithPipe,
  mappedWithDataFirst,
  mappedWithMethod
])))
output // => [[2, 2, 2]]
```

**Adding a service charge**

```efx
const addServiceCharge = (amount: number) => amount + 1

const fetchTransactionAmount = promise(() => Promise.resolve(100))

const finalAmount = fetchTransactionAmount
  |> map(addServiceCharge)

await runPromise(finalAmount) // => 101
```

## as

**Replacing a success value**

```efx
// Replaces the value 5 with the constant "new value"
const program = succeed(5) |> as("new value")

runSync(program) // => "new value"
```

## asSome

**Wrapping success in Option.some**

```efx
import { Option } from "effect"

const program = asSome(succeed(42))

runSync(program) // => Option.some(42)
```

## asVoid

**Discarding success values**

```efx
const program = asVoid(succeed(42))

runSync(program) // => undefined
```

## flip

**Swapping success and failure channels**

```efx
//      ┌─── Effect<number, string, never>
//      ▼
const program = fail("Oh uh!").pipe(as(2))

//      ┌─── Effect<string, number, never>
//      ▼
const flipped = flip(program)
runSync(flipped) // => "Oh uh!"
```

## zip

**Combining two effects sequentially**

```efx
const task1 = succeed(1)
const task2 = succeed("hello")

// Combine the two effects together
//
//      ┌─── Effect<[number, string], never, never>
//      ▼
const program = zip(task1, task2)

runSync(program) // => [1, 'hello']
```

**Combining two effects concurrently**

```efx
const task1 = succeed(1)
const task2 = succeed("hello")

// Run both effects concurrently using the concurrent option
const program = zip(task1, task2, { concurrent: true })

await runPromise(program) // => [1, 'hello']
```

## zipWith

**Combining two success values with a function**

```efx
const task1 = succeed(1)
const task2 = succeed("hello")

const task3 = zipWith(
  task1,
  task2,
  // Combines results into a single value
  (number, string) => number + string.length
)

runSync(task3) // => 6
```

## catchTag

**Handling a tagged error**

```efx
class NetworkError {
  readonly _tag = "NetworkError"
  constructor(readonly message: string) {}
}

class ValidationError {
  readonly _tag = "ValidationError"
  constructor(readonly message: string) {}
}

const task: Effect<string, NetworkError | ValidationError> =
  fail(new NetworkError("offline"))

const program = catchTag(
  task,
  "NetworkError",
  (error) => succeed(`Recovered from network error: ${error.message}`)
)

runSync(program) // => "Recovered from network error: offline"
```

## catchTags

**Handling multiple tagged errors**

```efx
// Define tagged error types
class ValidationError extends Data.TaggedError("ValidationError")<{
  message: string
}> {}

class NetworkError extends Data.TaggedError("NetworkError")<{
  statusCode: number
}> {}

// An effect that might fail with multiple error types
const program: Effect<string, ValidationError | NetworkError> =
  fail(new NetworkError({ statusCode: 503 }))

// Handle multiple error types at once
const handled = catchTags(program, {
  ValidationError: (error) =>
    succeed(`Validation failed: ${error.message}`),
  NetworkError: (error) => succeed(`Network error: ${error.statusCode}`)
})

runSync(handled) // => "Network error: 503"
```

## catchReason

**Handling an error reason**

```efx
class RateLimitError extends Data.TaggedError("RateLimitError")<{
  retryAfter: number
}> {}

class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
  limit: number
}> {}

class AiError extends Data.TaggedError("AiError")<{
  reason: RateLimitError | QuotaExceededError
}> {}

const program: Effect<string, AiError> = fail(
  new AiError({ reason: new RateLimitError({ retryAfter: 30 }) })
)

// Handle rate limits specifically
const handled = program.pipe(
  catchReason("AiError", "RateLimitError", (reason) =>
    succeed(`Retry after ${reason.retryAfter}s`)
  )
)

runSync(handled) // => "Retry after 30s"
```

## catchReasons

**Handling multiple error reasons**

```efx
class RateLimitError extends Data.TaggedError("RateLimitError")<{
  retryAfter: number
}> {}

class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
  limit: number
}> {}

class AiError extends Data.TaggedError("AiError")<{
  reason: RateLimitError | QuotaExceededError
}> {}

const program: Effect<string, AiError> = fail(
  new AiError({ reason: new QuotaExceededError({ limit: 100 }) })
)

const handled = program.pipe(
  catchReasons("AiError", {
    RateLimitError: (reason) =>
      succeed(`Retry after ${reason.retryAfter}s`),
    QuotaExceededError: (reason) =>
      succeed(`Quota exceeded: ${reason.limit}`)
  })
)

runSync(handled) // => "Quota exceeded: 100"
```

## unwrapReason

**Extracting the reason from a tagged error**

```efx
class RateLimitError extends Data.TaggedError("RateLimitError")<{
  retryAfter: number
}> {}

class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
  limit: number
}> {}

class AiError extends Data.TaggedError("AiError")<{
  reason: RateLimitError | QuotaExceededError
}> {}

const program: Effect<string, AiError> = fail(
  new AiError({ reason: new RateLimitError({ retryAfter: 30 }) })
)

// Before: Effect<string, AiError>
// After:  Effect<string, RateLimitError | QuotaExceededError>
const unwrapped = program.pipe(unwrapReason("AiError"))
runSync(flip(unwrapped))._tag // => "RateLimitError"
```

## catchCause

**Recovering from full failure causes**

```efx
const output: Array<unknown> = []

// An effect that might fail in different ways
const program = die("Something went wrong")

// Recover from any cause (including defects)
const recovered = catchCause(program, (cause) => {
  if (Cause.hasDies(cause)) {
    return sync(() => { output.push("Caught defect") }).pipe(
      as("Recovered from defect")
    )
  }
  return succeed("Unknown error")
})

void output.push(runSync(recovered))
output // => ["Caught defect", "Recovered from defect"]
```

## catchDefect

**Recovering from defects**

```efx
const output: Array<unknown> = []

// An effect that might throw an unexpected error (defect)
const program = sync(() => {
  throw new Error("Unexpected error")
})

// Recover from defects only
const recovered = catchDefect(program, (defect) => {
  return sync(() => { output.push(`Caught defect: ${(defect as Error).message}`) }).pipe(
    as("Recovered from defect")
  )
})

void output.push(runSync(recovered))
output // => ["Caught defect: Unexpected error", "Recovered from defect"]
```

## catchIf

**Recovering when a predicate matches**

```efx
class NotFound extends Data.TaggedError("NotFound")<{ id: string }> {}

const program = fail(new NotFound({ id: "user-1" }))

// With a refinement
const recovered = program.pipe(
  catchIf(
    (error): error is NotFound => error._tag === "NotFound",
    (error) => succeed(`missing:${error.id}`)
  )
)

// With a Filter
const recovered2 = program.pipe(
  catchFilter(
    Filter.tagged("NotFound"),
    (error) => succeed(`missing:${error.id}`)
  )
)

runSync(all([recovered, recovered2])) // => ['missing:user-1', 'missing:user-1']
```

## catchNoSuchElement

**Recovering from missing Option values**

```efx
import { Option } from "effect"
const output: Array<unknown> = []

const some = fromNullishOr(1).pipe(catchNoSuchElement)
const none = fromNullishOr(null).pipe(catchNoSuchElement)

void output.push(runSync(some))
void output.push(runSync(none))
output // => [Option.some(1), Option.none()]
```

## catchCauseIf

**Recovering from selected causes**

```efx
const output: Array<unknown> = []

const httpRequest = fail("Network Error")

// Only catch network-related failures
const program = catchCauseIf(
  httpRequest,
  Cause.hasFails,
  (cause) =>
    effect {
      await sync(() => { output.push(`Caught network error: ${Cause.squash(cause)}`) })
      return "Fallback response"
    }
)

void output.push(runSync(program))
output // => ["Caught network error: Network Error", "Fallback response"]
```

## mapError

**Transforming the error channel**

```efx
class TaskError extends Data.TaggedError("TaskError")<{ readonly message: string }> {}

//      ┌─── Effect<number, string, never>
//      ▼
const simulatedTask = fail("Oh no!").pipe(as(1))

//      ┌─── Effect<number, TaskError, never>
//      ▼
const mapped = mapError(
  simulatedTask,
  (message) => new TaskError({ message })
)
runSync(flip(mapped)).message // => "Oh no!"
```

## mapBoth

**Transforming success and failure channels**

```efx
class TaskError extends Data.TaggedError("TaskError")<{ readonly message: string }> {}

//      ┌─── Effect<number, string, never>
//      ▼
const simulatedTask = fail("Oh no!").pipe(as(1))

//      ┌─── Effect<boolean, TaskError, never>
//      ▼
const modified = mapBoth(simulatedTask, {
  onFailure: (message) => new TaskError({ message }),
  onSuccess: (n) => n > 0
})
runSync(flip(modified)).message // => "Oh no!"
```

## orDie

**Converting typed failures into defects**

```efx
import { Exit } from "effect"

class DivideByZeroError extends Data.TaggedError("DivideByZeroError")<{}> {}

const divide = (a: number, b: number) =>
  b === 0
    ? fail(new DivideByZeroError())
    : succeed(a / b)

//      ┌─── Effect<number, never, never>
//      ▼
const program = orDie(divide(1, 0))

runSyncExit(program) // => Exit.die(new DivideByZeroError())
```

## tapError

**Running effects on failure**

```efx
import { Exit } from "effect"
const output: Array<unknown> = []

// Simulate a task that fails with an error
const task: Effect<number, string> = fail("NetworkError")

// Use tapError to log the error message when the task fails
const tapping = tapError(
  task,
  (error) => sync(() => { output.push(`expected error: ${error}`) })
)

void output.push(runSyncExit(tapping))
output // => ["expected error: NetworkError", Exit.fail("NetworkError")]
```

## tapErrorTag

**Running effects for tagged failures**

```efx
import { Exit } from "effect"
const output: Array<unknown> = []

class NetworkError extends Data.TaggedError("NetworkError")<{
  statusCode: number
}> {}

class ValidationError extends Data.TaggedError("ValidationError")<{
  field: string
}> {}

const task: Effect<number, NetworkError | ValidationError> =
  fail(new NetworkError({ statusCode: 504 }))

const program = tapErrorTag(task, "NetworkError", (error) =>
  sync(() => { output.push(`expected error: ${error.statusCode}`) })
)

void output.push(runSyncExit(program))
output // => ["expected error: 504", Exit.fail(new NetworkError({ statusCode: 504 }))]
```

## tapCause

**Observing full failure causes**

```efx
import { Exit } from "effect"
const output: Array<unknown> = []

const task = fail("Something went wrong")

const program = tapCause(
  task,
  (cause) => sync(() => { output.push(`Logging cause: ${Cause.squash(cause)}`) })
)

void output.push(runSyncExit(program))
output // => ["Logging cause: Something went wrong", Exit.fail("Something went wrong")]
```

## tapCauseIf

**Observing selected failure causes**

```efx
import { Exit } from "effect"
const output: Array<unknown> = []

const task = fail("Network timeout")

// Only log causes that contain failures (not interrupts or defects)
const program = tapCauseIf(
  task,
  Cause.hasFails,
  (cause) => sync(() => { output.push(`Logging failure cause: ${Cause.squash(cause)}`) })
)

void output.push(runSyncExit(program))
output // => ["Logging failure cause: Network timeout", Exit.fail("Network timeout")]
```

## tapDefect

**Observing defects**

```efx
import { Exit } from "effect"
const output: Array<unknown> = []

// Simulate a severe failure in the system
const task2: Effect<number> = die(
  "Something went wrong"
)

// Log the defect using tapDefect
const tapping2 = tapDefect(
  task2,
  (defect) => sync(() => { output.push(`defect: ${defect}`) })
)

void output.push(runSyncExit(tapping2))
output // => ["defect: Something went wrong", Exit.die("Something went wrong")]
```

## eventually

**Retrying until success**

```efx
const output: Array<unknown> = []

let attempts = 0

const flaky = effect {
  attempts++
  await sync(() => { output.push(`Attempt ${attempts}`) })
  if (attempts < 3) {
    return await fail("Not ready")
  }
  return "Ready"
}

const program = eventually(flaky)

void output.push(await runPromise(program))
output // => ["Attempt 1", "Attempt 2", "Attempt 3", "Ready"]
```

## retry

**Retrying with a schedule**

```efx
class AttemptError extends Data.TaggedError("AttemptError")<{ readonly attempt: number }> {}

let attempt = 0
const task = callback<string, AttemptError>((resume) => {
  attempt++
  if (attempt <= 2) {
    resume(fail(new AttemptError({ attempt })))
  } else {
    resume(succeed("Success!"))
  }
})

const policy = Schedule.recurs(5)
const program = retry(task, policy)

await runPromise(program) // => "Success!"
```

## retryOrElse

**Falling back after retries are exhausted**

```efx
const output: Array<unknown> = []

class NetworkTimeoutError extends Data.TaggedError("NetworkTimeoutError")<{}> {}

let attempt = 0
const networkRequest = effect {
  attempt++
  await sync(() => { output.push(`Network attempt ${attempt}`) })
  if (attempt < 3) {
    throw new NetworkTimeoutError()
  }
  return "Network data"
}

// Retry up to 2 times, then fall back to cached data
const program = retryOrElse(
  networkRequest,
  Schedule.recurs(2),
  (error, retryCount) =>
    effect {
      await sync(() => { output.push(`All ${retryCount} retries failed, using cache`) })
      return "Cached data"
    }
)

void output.push(await runPromise(program))
output // => ["Network attempt 1", "Network attempt 2", "Network attempt 3", "Network data"]
```

## sandbox

**Exposing failures as causes**

```efx
const task = fail("Something went wrong")

// Sandbox exposes the full cause as the error type
const program = effect {
  const result = await flip(sandbox(task))
  return `Caught cause: ${Cause.squash(result)}`
}

runSync(program) // => "Caught cause: Something went wrong"
```

## ignore

**Discarding success and failure values**

```efx
//      ┌─── Effect<number, string, never>
//      ▼
const task = fail("Uh oh!").pipe(as(5))

//      ┌─── Effect<void, never, never>
//      ▼
const program = task.pipe(ignore)
runSync(program) // => undefined
```

**Logging failures while ignoring results**

```efx
const task = fail("Uh oh!")

const program = task.pipe(ignore)
runSync(program) // => undefined
```

## ignoreCause

**Ignoring failures and logging causes**

```efx
const task = fail("boom")

const program = task.pipe(ignoreCause)
runSync(program) // => undefined
```

## withExecutionPlan

**Retrying with an execution plan**

```efx
const Endpoint = Context.Service<{ url: string }>("Endpoint")

const fetchUrl = effect {
  const endpoint = await service(Endpoint)
  if (endpoint.url === "bad") {
    return await fail("Unavailable")
  }
  return endpoint.url
}

const plan = ExecutionPlan.make(
  { provide: Layer.succeed(Endpoint, { url: "bad" }), attempts: 2 },
  { provide: Layer.succeed(Endpoint, { url: "good" }) }
)

const program = withExecutionPlan(fetchUrl, plan)
runSync(program) // => "good"
```

**Observing execution-plan attempts**

```efx
const Endpoint = Context.Service<{ url: string }>("Endpoint")

const fetchUrl = effect {
  const endpoint = await service(Endpoint)
  if (endpoint.url === "bad") {
    return await fail("Unavailable")
  }
  return endpoint.url
}

const plan = ExecutionPlan.make(
  { provide: Layer.succeed(Endpoint, { url: "bad" }) },
  { provide: Layer.succeed(Endpoint, { url: "good" }) }
)

const events: Array<string> = []
const program = withExecutionPlan(fetchUrl, plan, {
  onEvent: (event) => sync(() => events.push(`${event._tag}:${event.stepIndex}`))
})

await runPromise(program) // => "good"

events // => ["AttemptStart:0", "AttemptFailure:0", "AttemptStart:1", "AttemptSuccess:1"]
```

## orElseSucceed

**Replacing failures with a value**

```efx
import { Exit } from "effect"

const validate = (age: number): Effect<number, string> => {
  if (age < 0) {
    return fail("NegativeAgeError")
  } else if (age < 18) {
    return fail("IllegalAgeError")
  } else {
    return succeed(age)
  }
}

const program = orElseSucceed(validate(-1), (error) => error === "IllegalAgeError" ? 18 : 0)

runSyncExit(program) // => Exit.succeed(0)
```

## firstSuccessOf

**Trying alternatives until one succeeds**

```efx
const primary = fail("primary unavailable")
const secondary = succeed("secondary result")
const tertiary = sync(() => {
  throw new Error("not evaluated")
})

const program = firstSuccessOf([
  primary,
  secondary,
  tertiary
])

runSync(program) // => "secondary result"
```

## timeout

**Failing when work takes too long**

```efx
const timedEffect = never.pipe(timeout(0))
const error = await runPromise(flip(timedEffect))
error._tag // => "TimeoutError"
```

## timeoutOption

**Returning None on timeout**

```efx
import { Option } from "effect"

const timedOutEffect = never.pipe(timeoutOption(0))
await runPromise(timedOutEffect) // => Option.none()
```

## timeoutOrElse

**Falling back on timeout**

```efx
const output: Array<unknown> = []

const program = timeoutOrElse(never, {
  duration: 0,
  orElse: () => sync(() => { output.push("Query timed out, using cached data") }).pipe(
    as("Cached result")
  )
})

void output.push(await runPromise(program))
output // => ["Query timed out, using cached data", "Cached result"]
```

## delay

**Delaying an effect**

```efx
const output: Array<unknown> = []

const program = delay(sync(() => { output.push("Delayed message") }), 0)

await runPromise(program)
output // => ["Delayed message"]
```

## sleep

**Pausing without blocking**

```efx
const output: Array<unknown> = []

const program = effect {
  await sync(() => { output.push("Start") })
  await sleep(0)
  await sync(() => { output.push("End") })
}

await runPromise(program)
output // => ["Start", "End"]
```

## timed

**Measuring execution time**

```efx
const program = effect {
  const [, value] = await timed(succeed("ok"))
  return value
}

runSync(program) // => "ok"
```

## raceAll

**Racing many effects**

```efx
const raced = raceAll([
  succeed("Fast"),
  never
])
await runPromise(raced) // => "Fast"
```

## raceAllFirst

**Taking the first settled result**

```efx
const raced = raceAllFirst([
  fail("First failed"),
  never
])
await runPromise(flip(raced)) // => "First failed"
```

## race

**Racing two effects**

```efx
const output: Array<unknown> = []

const fastFail = fail("fast-fail")
const slowSuccess = succeed("slow-success")

const program = effect {
  const result = await race(fastFail, slowSuccess)
  await sync(() => { output.push(`winner: ${result}`) })
}

await runPromise(program)
output // => ["winner: slow-success"]
```

## raceFirst

**Observing the winning fiber**

```efx
const output: Array<unknown> = []

const fastFail = fail("fast-fail")
const slowSuccess = never

const program = effect {
  const message = await match(raceFirst(fastFail, slowSuccess), {
    onFailure: (error) => `failed: ${error}`,
    onSuccess: (value) => `succeeded: ${value}`
  })
  await sync(() => { output.push(message) })
}

await runPromise(program)
output // => ["failed: fast-fail"]
```

## filter

**Filtering success values**

```efx
const output: Array<unknown> = []

// Sync predicate
const evens = filter([1, 2, 3, 4], (n) => n % 2 === 0)

// Effectful predicate
const checked = filter([1, 2, 3], (n) => succeed(n > 1))

void output.push(runSync(evens))
void output.push(runSync(checked))
output // => [[2, 4], [2, 3]]
```

## filterOrElse

**Filtering with a fallback effect**

```efx
// An effect that produces a number
const program = succeed(5)

// Filter for even numbers, provide alternative for odd numbers
const filtered = filterOrElse(
  program,
  (n) => n % 2 === 0,
  (n) => succeed(`Number ${n} is odd`)
)

runSync(filtered) // => "Number 5 is odd"
```

## filterOrFail

**Filtering with a custom failure**

```efx
// An effect that produces a number
const program = succeed(5)

// Filter for even numbers, fail for odd numbers
const filtered = filterOrFail(
  program,
  (n) => n % 2 === 0,
  (n) => `Expected even number, got ${n}`
)

runSync(flip(filtered)) // => "Expected even number, got 5"
```

## when

**Conditionally running an effect**

```efx
import { Option } from "effect"
const output: Array<unknown> = []

const shouldLog = true

const program = when(
  sync(() => { output.push("Condition is true!") }),
  succeed(shouldLog)
)

void output.push(runSync(program))
output // => ["Condition is true!", Option.some(undefined)]
```

## match

**Matching success and failure values**

```efx
class ExampleError extends Data.TaggedError("ExampleError")<{ readonly message: string }> {}

const success: Effect<number, ExampleError> = succeed(42)

const program1 = match(success, {
  onFailure: (error) => `failure: ${error.message}`,
  onSuccess: (value) => `success: ${value}`
})

// Run and log the result of the successful effect
runSync(program1) // => "success: 42"

const failure: Effect<number, ExampleError> = fail(
  new ExampleError({ message: "Uh oh!" })
)

const program2 = match(failure, {
  onFailure: (error) => `failure: ${error.message}`,
  onSuccess: (value) => `success: ${value}`
})

// Run and log the result of the failed effect
runSync(program2) // => "failure: Uh oh!"
```

## matchEager

**Pattern matching eagerly when possible**

```efx
const output: Array<unknown> = []

const program = effect {
  const result = await matchEager(succeed(42), {
    onFailure: (error) => `Failed: ${error}`,
    onSuccess: (value) => `Success: ${value}`
  })
  void output.push(result)
}

runSync(program)
output // => ["Success: 42"]
```

## matchCause

**Matching on success or failure causes**

```efx
const task = fail("Something went wrong")

const program = matchCause(task, {
  onFailure: (cause) => `Failed: ${Cause.squash(cause)}`,
  onSuccess: (value) => `Success: ${value}`
})

runSync(program) // => "Failed: Something went wrong"
```

## matchCauseEager

**Eagerly matching already completed effects**

```efx
const handleResult = matchCauseEager(succeed(42), {
  onSuccess: (value) => `Success: ${value}`,
  onFailure: (cause) => `Failed: ${cause}`
})
runSync(handleResult) // => "Success: 42"
```

## matchCauseEffect

**Effectfully matching on causes**

```efx
const output: Array<unknown> = []

class TaskError extends Data.TaggedError("TaskError")<{ readonly message: string }> {}

const task = fail(new TaskError({ message: "Task failed" }))

const program = matchCauseEffect(task, {
  onFailure: (cause) =>
    effect {
      if (Cause.hasFails(cause)) {
        const error = Cause.findError(cause)
        if (Result.isSuccess(error)) {
          await sync(() => { output.push(`Handling error: ${error.success.message}`) })
        }
        return "recovered from error"
      } else {
        await sync(() => { output.push("Handling interruption or defect") })
        return "recovered from interruption/defect"
      }
    },
  onSuccess: (value) =>
    effect {
      await sync(() => { output.push(`Success: ${value}`) })
      return `processed ${value}`
    }
})

void output.push(runSync(program))
output // => ["Handling error: Task failed", "recovered from error"]
```

## matchEffect

**Matching success and failure with effectful handlers**

```efx
class ExampleError extends Data.TaggedError("ExampleError")<{ readonly message: string }> {}

const success: Effect<number, ExampleError> = succeed(42)
const failure: Effect<number, ExampleError> = fail(
  new ExampleError({ message: "Uh oh!" })
)

const program1 = matchEffect(success, {
  onFailure: (error) =>
    succeed(`failure: ${error.message}`),
  onSuccess: (value) =>
    succeed(`success: ${value}`)
})

runSync(program1) // => "success: 42"

const program2 = matchEffect(failure, {
  onFailure: (error) =>
    succeed(`failure: ${error.message}`),
  onSuccess: (value) =>
    succeed(`success: ${value}`)
})

runSync(program2) // => "failure: Uh oh!"
```

## isFailure

**Checking whether an effect fails**

```efx
const output: Array<unknown> = []

const program = effect {
  const failed = await isFailure(fail("Uh oh!"))
  await sync(() => { output.push(failed) })
}

runSync(program)
output // => [true]
```

## isSuccess

**Checking whether an effect succeeds**

```efx
const output: Array<unknown> = []

const program = effect {
  const ok = await isSuccess(succeed("done"))
  const failed = await isSuccess(fail("Uh oh"))
  await sync(() => { output.push(`ok: ${ok}`) })
  await sync(() => { output.push(`failed: ${failed}`) })
}

runSync(program)
output // => ["ok: true", "failed: false"]
```

## context

**Reading the full context**

```efx
const output: Array<unknown> = []

const Logger = Context.Service<{
  log: (msg: string) => void
}>("Logger")
const Database = Context.Service<{
  query: (sql: string) => string
}>("Database")

const program = effect {
  const allServices = await Effect.context()

  // Check if specific services are available
  const loggerOption = Context.getOption(allServices, Logger)
  const databaseOption = Context.getOption(allServices, Database)

  await sync(() => { output.push(`Logger available: ${Option.isSome(loggerOption)}`) })
  await sync(() => { output.push(`Database available: ${Option.isSome(databaseOption)}`) })
}

const context = Context.make(Logger, { log: () => {} })
  .pipe(Context.add(Database, { query: () => "result" }))

const provided = provideContext(program, context)
runSync(provided)
output // => ["Logger available: true", "Database available: true"]
```

## contextWith

**Deriving values from the context**

```efx
const output: Array<unknown> = []

const Logger = Context.Service<{
  log: (msg: string) => void
}>("Logger")
const Cache = Context.Service<{
  get: (key: string) => string | null
}>("Cache")

const program = contextWith((services: Context<Context.Service.Identifier<typeof Cache>>) => {
  const cacheOption = Context.getOption(services, Cache)
  const hasCache = Option.isSome(cacheOption)

  if (hasCache) {
    return effect {
      const cache = await service(Cache)
      await sync(() => { output.push("Using cached data") })
      return cache.get("user:123") || "default"
    }
  } else {
    return effect {
      await sync(() => { output.push("No cache available, using fallback") })
      return "fallback data"
    }
  }
})

const withCache = provideService(program, Cache, {
  get: () => "cached_value"
})
void output.push(runSync(withCache))
output // => ["Using cached data", "cached_value"]
```

## provide

**Providing dependencies with a layer**

```efx
interface Database {
  readonly query: (sql: string) => Effect<string>
}

const Database = Context.Service<Database>("Database")

const DatabaseLayer = Layer.succeed(Database)({
  query: Effect.fn("Database.query")((sql: string) => succeed(`Result for: ${sql}`))
})

const program = effect {
  const db = await Database
  return await db.query("SELECT * FROM users")
}

const provided = provide(program, DatabaseLayer)

await runPromise(provided) // => "Result for: SELECT * FROM users"
```

## provideContext

**Providing a complete context**

```efx
const output: Array<unknown> = []

// Define service keys
const Logger = Context.Service<{
  log: (msg: string) => void
}>("Logger")
const Database = Context.Service<{
  query: (sql: string) => string
}>("Database")

// Create a context with multiple services
const context = Context.make(Logger, { log: (message) => { output.push(message) } })
  .pipe(Context.add(Database, { query: () => "result" }))

// An effect that requires both services
const program = effect {
  const logger = await service(Logger)
  const db = await service(Database)
  logger.log("Querying database")
  return db.query("SELECT * FROM users")
}

const provided = provideContext(program, context)
void output.push(runSync(provided))
output // => ["Querying database", "result"]
```

## setContext

**Running with a complete context**

```efx
service Config {
  readonly greeting: string
}

const program = effect {
  const config = await service(Config)
  return `${config.greeting}, World!`
}

const context = Context.make(Config, { greeting: "Hello" })

const runnable = setContext(program, context)

runSync(runnable) // => "Hello, World!"
```

## service

**Accessing a required service**

```efx
interface Database {
  readonly query: (sql: string) => Effect<string>
}

const Database = Context.Service<Database>("Database")

const program = effect {
  const db = await service(Database)
  return await db.query("SELECT * FROM users")
}

const runnable = provideService(program, Database, {
  query: (sql) => succeed(`Result for: ${sql}`)
})
runSync(runnable) // => "Result for: SELECT * FROM users"
```

## serviceOption

**Accessing an optional service**

```efx
const output: Array<unknown> = []

// Define a service key
const Logger = Context.Service<{
  log: (msg: string) => void
}>("Logger")

// Use serviceOption to optionally access the logger
const program = effect {
  const maybeLogger = await serviceOption(Logger)

  if (Option.isSome(maybeLogger)) {
    maybeLogger.value.log("Service is available")
  } else {
    void output.push("Service not available")
  }
}

runSync(program)
output // => ["Service not available"]
```

## updateContext

**Updating the context before running**

```efx
// Define services
const Logger = Context.Service<{
  log: (msg: string) => void
}>("Logger")
const Config = Context.Service<{
  name: string
}>("Config")

const program = service(Config).pipe(
  map((config) => `Hello ${config.name}!`)
)

// Transform services by providing Config while keeping Logger requirement
const configured = program.pipe(
  updateContext((context: Context<Context.Service.Identifier<typeof Logger>>) =>
    Context.add(context, Config, { name: "World" })
  )
)

// The effect now requires only Logger service
const result = provideService(configured, Logger, {
  log: () => {}
})
runSync(result) // => "Hello World!"
```

## updateService

**Replacing a service for one effect**

```efx
const output: Array<unknown> = []

// Define a counter service
const Counter = Context.Service<{ count: number }>("Counter")

const program = effect {
  const updatedCounter = await service(Counter)
  await sync(() => { output.push(`Updated count: ${updatedCounter.count}`) })
  return updatedCounter.count
}
  |> updateService(Counter, (counter) => ({ count: counter.count + 1 }))

// Provide initial service and run
const result = provideService(program, Counter, { count: 0 })
void output.push(runSync(result))
output // => ["Updated count: 1", 1]
```

## updateServiceScoped

**Updating a reference within a scope**

```efx
const output: Array<unknown> = []

const CurrentNumber = Context.Reference<number>("CurrentNumber", {
  defaultValue: () => 1
})

const program = effect {
  const before = await CurrentNumber
  const during = await scoped(
    effect {
      await updateServiceScoped(
        CurrentNumber,
        (value) => value + 1,
        {
          // Optional: when omitted, the original value is restored
          reset: (original, updated, current) =>
            Math.max(original, updated, current) + 1
        }
      )
      return await CurrentNumber
    }
  )
  const after = await CurrentNumber

  void output.push([before, during, after])
}

await runPromise(program)
output // => [[1, 2, 3]]
```

## provideService

**Providing a service value**

```efx
const output: Array<unknown> = []

// Define a service for configuration
const Config = Context.Service<{
  apiUrl: string
  timeout: number
}>("Config")

const fetchData = effect {
  const config = await service(Config)
  await sync(() => { output.push(`Fetching from: ${config.apiUrl}`) })
  await sync(() => { output.push(`Timeout: ${config.timeout}ms`) })
  return "data"
}

// Provide the service implementation
const program = provideService(fetchData, Config, {
  apiUrl: "https://api.example.com",
  timeout: 5000
})

void output.push(runSync(program))
output // => ["Fetching from: https://api.example.com", "Timeout: 5000ms", "data"]
```

## provideServiceEffect

**Providing a service with an effect**

```efx
const output: Array<unknown> = []

// Define a database connection service
interface DatabaseConnection {
  readonly query: (sql: string) => Effect<string>
}
const Database = Context.Service<DatabaseConnection>("Database")

// Effect that creates a database connection
const createConnection = effect {
  await sync(() => { output.push("Establishing database connection...") })
  await sync(() => { output.push("Database connected!") })
  return {
    query: (sql: string) => succeed(`Result for: ${sql}`)
  }
}

const program = effect {
  const db = await service(Database)
  return await db.query("SELECT * FROM users")
}

// Provide the service through an effect
const withDatabase = provideServiceEffect(
  program,
  Database,
  createConnection
)

void output.push(await runPromise(withDatabase))
output // => ["Establishing database connection...", "Database connected!", "Result for: SELECT * FROM users"]
```

## scope

**Accessing the current scope**

```efx
const output: Array<unknown> = []

const program = effect {
  const currentScope = await scope
  await sync(() => { output.push("Got scope for resource management") })

  // Use the scope to manually manage resources if needed
  const resource = await acquireRelease(
    sync(() => { output.push("Acquiring resource") }).pipe(as("resource")),
    () => sync(() => { output.push("Releasing resource") })
  )

  return resource
}

void output.push(runSync(scoped(program)))
output // => ["Got scope for resource management", "Acquiring resource", "Releasing resource", "resource"]
```

## scoped

**Running a scoped acquisition**

```efx
const output: Array<unknown> = []

const resource = acquireRelease(
  sync(() => { output.push("Acquiring resource") }).pipe(as("resource")),
  () => sync(() => { output.push("Releasing resource") })
)

const program = scoped(
  effect {
    const res = await resource
    await sync(() => { output.push(`Using ${res}`) })
    return res
  }
)

runSync(program)
output // => ["Acquiring resource", "Using resource", "Releasing resource"]
```

## scopedWith

**Working with an explicit scope**

```efx
const output: Array<unknown> = []

const program = scopedWith((scope) =>
  effect {
    await sync(() => { output.push("Inside scoped context") })

    // Manually add a finalizer to the scope
    await Scope.addFinalizer(scope, sync(() => { output.push("Manual finalizer") }))

    // Create a scoped resource
    const resource = await scoped(
      acquireRelease(
        sync(() => { output.push("Acquiring resource") }).pipe(as("resource")),
        () => sync(() => { output.push("Releasing resource") })
      )
    )

    return resource
  }
)

void output.push(runSync(program))
output // => ["Inside scoped context", "Acquiring resource", "Releasing resource", "Manual finalizer", "resource"]
```

## acquireRelease

**Acquiring and releasing a resource**

```efx
const output: Array<unknown> = []

// Simulate a resource that needs cleanup
interface FileHandle {
  readonly path: string
  readonly content: string
}

// Acquire a file handle
const acquire = effect {
  await sync(() => { output.push("Opening file") })
  return { path: "/tmp/file.txt", content: "file content" }
}

// Release the file handle
const release = (handle: FileHandle, exit: Exit<unknown, unknown>) =>
  sync(() => { output.push(
    `Closing file ${handle.path} with exit: ${
      Exit.isSuccess(exit) ? "success" : "failure"
    }`
  ) })

// Create a scoped resource
const resource = acquireRelease(acquire, release)

// Use the resource within a scope
const program = scoped(
  effect {
    const handle = await resource
    await sync(() => { output.push(`Using file: ${handle.path}`) })
    return handle.content
  }
)

void output.push(runSync(program))
output // => ["Opening file", "Using file: /tmp/file.txt", "Closing file /tmp/file.txt with exit: success", "file content"]
```

## acquireDisposable

**Acquiring a disposable resource**

```efx
const output: Array<unknown> = []

class Resource implements Disposable {
  [Symbol.dispose]() {
    void output.push("disposed")
  }
}

const program = scoped(
  effect {
    await acquireDisposable(succeed(new Resource()))
    void output.push("acquired")
  }
)

runSync(program)
output // => ["acquired", "disposed"]
```

## acquireUseRelease

**Acquiring resources with cleanup**

```efx
const output: Array<unknown> = []

interface Database {
  readonly connection: string
  readonly query: (sql: string) => Effect<string>
}

const program = acquireUseRelease(
  // Acquire - connect to database
  effect {
    await sync(() => { output.push("Connecting to database...") })
    return {
      connection: "db://localhost:5432",
      query: (sql: string) => succeed(`Result for: ${sql}`)
    }
  },
  // Use - perform database operations
  (db) =>
    effect {
      await sync(() => { output.push(`Connected to ${db.connection}`) })
      const result = await db.query("SELECT * FROM users")
      await sync(() => { output.push(`Query result: ${result}`) })
      return result
    },
  // Release - close database connection
  (db, exit) =>
    effect {
      if (Exit.isSuccess(exit)) {
        await sync(() => { output.push(`Closing connection to ${db.connection} (success)`) })
      } else {
        await sync(() => { output.push(`Closing connection to ${db.connection} (failure)`) })
      }
    }
)

await runPromise(program)
output // => ["Connecting to database...", "Connected to db://localhost:5432", "Query result: Result for: SELECT * FROM users", "Closing connection to db://localhost:5432 (success)"]
```

## addFinalizer

**Registering scope finalizers**

```efx
const output: Array<unknown> = []

const program = scoped(
  effect {
    // Add a finalizer that runs when the scope closes
    await addFinalizer((exit) =>
      sync(() => { output.push(
        Exit.isSuccess(exit)
          ? "Cleanup: Operation completed successfully"
          : "Cleanup: Operation failed, cleaning up resources"
      ) })
    )

    await sync(() => { output.push("Performing main operation...") })

    // This could succeed or fail
    return "operation result"
  }
)

void output.push(runSync(program))
output // => ["Performing main operation...", "Cleanup: Operation completed successfully", "operation result"]
```

## ensuring

**Always running cleanup**

```efx
const output: Array<unknown> = []

const task = effect {
  await sync(() => { output.push("Task started") })
  await sync(() => { output.push("Task completed") })
  return 42
}

// Ensure cleanup always runs, regardless of success or failure
const program = ensuring(
  task,
  sync(() => { output.push("Cleanup: This always runs!") })
)

void output.push(runSync(program))
output // => ["Task started", "Task completed", "Cleanup: This always runs!", 42]
```

## onError

**Running cleanup on failure**

```efx
import { Exit } from "effect"
const output: Array<unknown> = []

class TaskError extends Data.TaggedError("TaskError")<{ readonly message: string }> {}

const error = new TaskError({ message: "Something went wrong" })
const task = fail(error)

const program = onError(
  task,
  (cause) => sync(() => { output.push(`Cleanup on error: ${Cause.squash(cause)}`) })
)

void output.push(runSyncExit(program))
output // => ["Cleanup on error: TaskError: Something went wrong", Exit.fail(error)]
```

## onErrorIf

**Running cleanup for selected failures**

```efx
import { Exit } from "effect"
const output: Array<unknown> = []

const task = fail("boom")

const program = onErrorIf(
  task,
  Cause.hasFails,
  (cause) =>
    effect {
      await sync(() => { output.push(`Cause: ${Cause.squash(cause)}`) })
    }
)

void output.push(runSyncExit(program))
output // => ["Cause: boom", Exit.fail("boom")]
```

## onExit

**Observing every exit**

```efx
const output: Array<unknown> = []

const task = succeed(42)

const program = onExit(task, (exit) =>
  sync(() => { output.push(
    Exit.isSuccess(exit)
      ? `Task succeeded with: ${exit.value}`
      : `Task failed: ${Exit.isFailure(exit) ? exit.cause : "interrupted"}`
  ) }))

void output.push(runSync(program))
output // => ["Task succeeded with: 42", 42]
```

## onExitIf

**Observing selected exits**

```efx
const output: Array<unknown> = []

const program = onExitIf(
  succeed(42),
  Exit.isSuccess,
  (exit) =>
    Exit.isSuccess(exit)
      ? sync(() => { output.push(`Succeeded with: ${exit.value}`) })
      : Effect.void
)

void output.push(runSync(program))
output // => ["Succeeded with: 42", 42]
```

## cached

**Memoizing an effect until invalidated**

```efx
const output: Array<unknown> = []
const record = (value: unknown) => sync(() => { output.push(value) })

let i = 1
const expensiveTask = sync(() => {
  void output.push("expensive task...")
  return `result ${i++}`
})

const program = effect {
  void output.push("non-cached version:")
  await expensiveTask.pipe(andThen(record))
  await expensiveTask.pipe(andThen(record))
  void output.push("cached version:")
  const cached = await Effect.cached(expensiveTask)
  await cached.pipe(andThen(record))
  await cached.pipe(andThen(record))
}

await runPromise(program)
output // => ["non-cached version:", "expensive task...", "result 1", "expensive task...", "result 2", "cached version:", "expensive task...", "result 3", "result 3"]
```

## cachedWithTTL

**Memoizing an effect with TTL**

```efx
const output: Array<unknown> = []
const record = (value: unknown) => sync(() => { output.push(value) })

let i = 1
const expensiveTask = sync(() => {
  void output.push("expensive task...")
  return `result ${i++}`
})

const program = effect {
  const cached = await cachedWithTTL(expensiveTask, "1 hour")
  await cached.pipe(andThen(record))
  await cached.pipe(andThen(record))
  await cached.pipe(andThen(record))
}

runSync(program)
output // => ["expensive task...", "result 1", "result 1", "result 1"]
```

**Caching successes while retrying failures**

```efx
let attempts = 0
const task = suspend(() =>
  ++attempts === 1 ? fail("temporary failure") : succeed(42)
)
const program = effect {
  const cached = await task.pipe(
    cachedWithTTL((exit) => Exit.isSuccess(exit) ? "1 hour" : 0)
  )
  await Effect.exit(cached)
  return await cached
}

runSync(program) // => 42
```

## cachedInvalidateWithTTL

**Memoizing with TTL and invalidation**

```efx
const output: Array<unknown> = []
const record = (value: unknown) => sync(() => { output.push(value) })

let i = 1
const expensiveTask = sync(() => {
  void output.push("expensive task...")
  return `result ${i++}`
})

const program = effect {
  const [cached, invalidate] = await cachedInvalidateWithTTL(
    expensiveTask,
    "1 hour"
  )
  await cached.pipe(andThen(record))
  await cached.pipe(andThen(record))
  await invalidate
  await cached.pipe(andThen(record))
}

runSync(program)
output // => ["expensive task...", "result 1", "result 1", "expensive task...", "result 2"]
```

## interrupt

**Creating an interrupted effect**

```efx
const program = effect {
  return await interrupt
  await succeed("This won't execute and is unreachable")
}

runSyncExit(program)._tag // => "Failure"
```

## interruptible

**Allowing interruption**

```efx
import { Option } from "effect"

const program = interruptible(never).pipe(
  timeoutOption(0)
)
await runPromise(program) // => Option.none()
```

## onInterrupt

**Running cleanup on interruption**

```efx
const output: Array<unknown> = []

const task = forever(succeed("working..."))

const program = onInterrupt(
  task,
  () => sync(() => { output.push("Task was interrupted, cleaning up...") })
)

const fiber = runFork(program)
await runPromise(Fiber.interrupt(fiber))
output // => ["Task was interrupted, cleaning up..."]
```

## uninterruptible

**Preventing interruption**

```efx
const output: Array<unknown> = []

const criticalTask = effect {
  await sync(() => { output.push("Starting critical section...") })
  await sync(() => { output.push("Critical section completed") })
}

const program = uninterruptible(criticalTask)

runSync(program)
output // => ["Starting critical section...", "Critical section completed"]
```

## uninterruptibleMask

**Restoring interruption in protected regions**

```efx
const output: Array<unknown> = []

const program = uninterruptibleMask((restore) =>
  effect {
    await sync(() => { output.push("Uninterruptible phase...") })
    // Restore interruptibility for this part
    await restore(
      effect {
        await sync(() => { output.push("Interruptible phase...") })
      }
    )

    await sync(() => { output.push("Back to uninterruptible") })
  }
)

runSync(program)
output // => ["Uninterruptible phase...", "Interruptible phase...", "Back to uninterruptible"]
```

## interruptibleMask

**Controlling interruptibility locally**

```efx
const output: Array<unknown> = []

const program = interruptibleMask((restore) =>
  effect {
    await sync(() => { output.push("Interruptible phase...") })
    // Make this part uninterruptible
    await restore(
      effect {
        await sync(() => { output.push("Uninterruptible phase...") })
      }
    )

    await sync(() => { output.push("Back to interruptible") })
  }
)

runSync(program)
output // => ["Interruptible phase...", "Uninterruptible phase...", "Back to interruptible"]
```

## forever

**Repeating forever**

```efx
import { Option } from "effect"

const program = forever(never).pipe(timeoutOption(0))
await runPromise(program) // => Option.none()
```

## repeat

**Repeating successful effects with a schedule**

```efx
// Success Example
const output: Array<unknown> = []

const action = sync(() => { output.push("success") })
const policy = Schedule.recurs(2)
const program = repeat(action, policy)

void output.push(runSync(program))
output // => ["success", "success", "success", 2]
```

**Stopping repetition on failure**

```efx
// Failure Example
const output: Array<unknown> = []

let count = 0

// Define a callback effect that simulates an action with possible failures
const action = callback<string, string>((resume) => {
  if (count > 1) {
    void output.push("failure")
    resume(fail("Uh oh!"))
  } else {
    count++
    void output.push("success")
    resume(succeed("yay!"))
  }
})

const policy = Schedule.recurs(2)
const program = repeat(action, policy)

void output.push((await runPromiseExit(program))._tag)
output // => ["success", "success", "failure", "Failure"]
```

## repeatOrElse

**Recovering after repetition stops**

```efx
const output: Array<unknown> = []

let attempt = 0
const task = effect {
  attempt++
  if (attempt <= 2) {
    await sync(() => { output.push(`Attempt ${attempt} failed`) })
    return await fail(`Error ${attempt}`)
  }
  await sync(() => { output.push(`Attempt ${attempt} succeeded`) })
  return "success"
}

const program = repeatOrElse(
  task,
  Schedule.recurs(3),
  (error, previous) =>
    sync(() => { output.push(
      `Final failure: ${error}, after ${
        Option.isSome(previous) ? previous.value.attempt : 0
      } attempts`
    ) }).pipe(map(() => 0))
)

void output.push(runSync(program))
output // => ["Attempt 1 failed", "Final failure: Error 1, after 0 attempts", 0]
```

## replicateEffect

**Replicating an effect**

```efx
const output: Array<unknown> = []

const program = effect {
  const results = await replicateEffect(3)(succeed(1))
  await sync(() => { output.push(results) })
}

runSync(program)
output // => [[1, 1, 1]]
```

## schedule

**Scheduling repeated execution**

```efx
const output: Array<unknown> = []

const task = effect {
  await sync(() => { output.push("Task executing...") })
  return 1
}

const program = schedule(task, Schedule.recurs(2))

void output.push(runSync(program))
output // => ["Task executing...", "Task executing...", 2]
```

## scheduleFrom

**Scheduling from an initial value**

```efx
const output: Array<unknown> = []

const task = (input: number) =>
  effect {
    await sync(() => { output.push(`Processing: ${input}`) })
    return input + 1
  }

// Start with 0, repeat 3 times
const program = scheduleFrom(
  task(0),
  0,
  Schedule.recurs(2)
)

void output.push(runSync(program))
output // => ["Processing: 0", "Processing: 0", 2]
```

## tracer

**Accessing the current tracer**

```efx
const program = effect {
  const currentTracer = await tracer
  return typeof currentTracer.span
}

runSync(program) // => "function"
```

## withTracer

**Providing a tracer**

```efx
const program = effect {
  const tracer = await Effect.tracer
  return await withTracer(succeed("completed"), tracer)
}

runSync(program) // => "completed"
```

## withTracerEnabled

**Enabling or disabling tracing**

```efx
const program = succeed(42).pipe(
  withSpan("my-span"),
  // the span will not be registered with the tracer
  withTracerEnabled(false)
)
runSync(program) // => 42
```

## withTracerTiming

**Enabling or disabling tracing timing**

```efx
const program = succeed(42).pipe(
  withSpan("my-span"),
  // the span will not have timing information
  withTracerTiming(false)
)
runSync(program) // => 42
```

## annotateSpans

**Annotating all spans**

```efx
const program = succeed("result")

// Add single annotation
const annotated1 = annotateSpans(program, "user", "john")

// Add multiple annotations
const annotated2 = annotateSpans(program, {
  operation: "data-processing",
  version: "1.0.0",
  environment: "production"
})

runSync(all([annotated1, annotated2])) // => ['result', 'result']
```

## annotateCurrentSpan

**Annotating the current span**

```efx
const program = effect {
  await annotateCurrentSpan("userId", "123")
  await annotateCurrentSpan({
    operation: "user-lookup"
  })
  return "success"
}

const traced = withSpan(program, "user-operation")
runSync(traced) // => "success"
```

## currentSpan

**Reading the current span**

```efx
const program = effect {
  const span = await currentSpan
  return span.name
}

const traced = withSpan(program, "my-span")
runSync(traced) // => "my-span"
```

## currentParentSpan

**Reading the parent span**

```efx
const childOperation = effect {
  const parentSpan = await currentParentSpan
  return parentSpan._tag
}

const program = withSpan(childOperation, "child-span")

const traced = withSpan(program, "parent-span")
runSync(traced) // => "Span"
```

## spanAnnotations

**Providing span annotations**

```efx
const program = effect {
  const annotations = await spanAnnotations
  return annotations
} |> annotateSpans({ userId: "123", operation: "data-processing" })

runSync(program) // => { userId: '123', operation: 'data-processing' }
```

## spanLinks

**Providing span links**

```efx
const program = effect {
  // Get the current span links
  const links = await spanLinks
  return links
}

runSync(program).length // => 0
```

## linkSpans

**Linking one span to another span**

```efx
const program = withSpan(effect {
  const parentSpan = await currentSpan
  return await spanLinks.pipe(
    linkSpans(parentSpan, { relationship: "follows" })
  )
}, "parent-operation")

runSync(program).length // => 1
```

**Linking multiple spans at once**

```efx
const program = effect {
  const span1 = await makeSpan("span-1")
  const span2 = await makeSpan("span-2")

  return await spanLinks.pipe(
    linkSpans([span1, span2], {
      type: "dependency",
      source: "multiple-operations"
    })
  )
}

runSync(program).length // => 2
```

## makeSpan

**Creating a span manually**

```efx
const program = effect {
  const span = await makeSpan("my-operation")
  return span.name
}

runSync(program) // => "my-operation"
```

## makeSpanScoped

**Creating a scoped standalone span**

```efx
const program = scoped(
  effect {
    const span = await makeSpanScoped("scoped-operation")
    return span.name
    // Span automatically closes when scope ends
  }
)

runSync(program) // => "scoped-operation"
```

## useSpan

**Running an effect with a standalone span**

```efx
const program = useSpan(
  "user-operation",
  (span) => succeed(`${span.name}: success`)
)
runSync(program) // => "user-operation: success"
```

## withSpan

**Wrapping an effect in a child span**

```efx
const task = succeed("result")

const traced = withSpan(task, "my-task", {
  attributes: { version: "1.0" }
})
runSync(traced) // => "result"
```

## withSpanScoped

**Creating a scoped child span**

```efx
const program = scoped(
  effect {
    const task = succeed("working")
    await withSpanScoped(task, "scoped-task")
    return "completed"
  }
)
runSync(program) // => "completed"
```

## withParentSpan

**Setting a parent span**

```efx
const program = effect {
  const span = await makeSpan("parent-span")
  const childTask = succeed("child operation")
  await withParentSpan(childTask, span)
  return "completed"
}
runSync(program) // => "completed"
```

## request

**Executing a request through a resolver**

```efx
import { Request } from "effect"
const output: Array<unknown> = []

interface GetUser extends Request.Request<string> {
  readonly _tag: "GetUser"
  readonly id: number
}
const GetUser = Request.tagged<GetUser>("GetUser")

const resolver = RequestResolver.make<GetUser>(
  effect (entries) => {
    for (const entry of entries) {
      await Request.complete(entry, Exit.succeed(`user-${entry.request.id}`))
    }
  }
)

const program = effect {
  const name = await request(GetUser({ id: 1 }), resolver)
  await sync(() => { output.push(name) })
}

await runPromise(program)
output // => ["user-1"]
```

## forkChild

**Forking a child fiber**

```efx
const task = succeed("result")

const program = effect {
  const fiber = await task.pipe(forkChild)
  const result = await Fiber.join(fiber)
  return result
}

await runPromise(program) // => "result"
```

## forkIn

**Forking into a supplied scope**

```efx
const task = never

const program = scoped(
  effect {
    const scope = await Effect.scope
    const fiber = await forkIn(task, scope)
    // Fiber will be interrupted when scope closes
    return "done"
  }
)

await runPromise(program) // => "done"
```

## forkScoped

**Forking into the current scope**

```efx
const backgroundTask = never

const program = scoped(
  effect {
    await backgroundTask.pipe(forkScoped)

    // Fiber will be interrupted when scope closes
    return "scope completed"
  }
)

await runPromise(program) // => "scope completed"
```

## forkDetach

**Forking a detached fiber**

```efx
const daemonTask = succeed("daemon result")

const program = effect {
  const fiber = await daemonTask.pipe(forkDetach)
  return await Fiber.join(fiber)
}

await runPromise(program) // => "daemon result"
```

## fiber

**Accessing the current fiber**

```efx
const output: Array<unknown> = []

const program = effect {
  const fiber = await Effect.fiber
  await sync(() => { output.push(typeof fiber.id) })
}

runSync(program)
output // => ["number"]
```

## fiberId

**Accessing the current fiber id**

```efx
const program = fiberId.pipe(map((id) => typeof id))
runSync(program) // => "number"
```

## runFork

**Running an effect in the background**

```efx
const output: Array<unknown> = []

//      ┌─── Effect<number, never, never>
//      ▼
const program = sync(() => { output.push("running...") }).pipe(as("done"))

//      ┌─── RuntimeFiber<number, never>
//      ▼
const fiber = runFork(program)

void output.push(await runPromise(Fiber.join(fiber)))
output // => ["running...", "done"]
```

## runForkWith

**Running with services in the background**

```efx
const output: Array<unknown> = []

interface Logger {
  log: (message: string) => void
}

const Logger = Context.Service<Logger>("Logger")

const services = Context.make(Logger, {
  log: (message) => void output.push(message)
})

const program = effect {
  const logger = await Logger
  logger.log("Hello from service!")
  return "done"
}

const fiber = runForkWith(services)(program)
void output.push(await runPromise(Fiber.join(fiber)))
output // => ["Hello from service!", "done"]
```

## runCallbackWith

**Running with services and a callback**

```efx
const output: Array<unknown> = []

interface Logger {
  log: (message: string) => Effect<void>
}

const Logger = Context.Service<Logger>("Logger")

const services = Context.make(Logger, {
  log: (message) => sync(() => { output.push(message) })
})

const program = effect {
  const logger = await Logger
  await logger.log("Started")
  return "done"
}

await new Promise<void>((resolve) => {
  runCallbackWith(services)(program, {
    onExit: (exit) => {
      void output.push(exit._tag)
      resolve()
    }
  })
})
output // => ["Started", "Success"]
```

## runCallback

**Running with a callback**

```efx
const output: Array<unknown> = []

const program = effect {
  await sync(() => { output.push("working") })
  return "done"
}

await new Promise<void>((resolve) => {
  runCallback(program, {
    onExit: (exit) => {
      runSync(
        Exit.match(exit, {
          onFailure: () => sync(() => { output.push("failed") }),
          onSuccess: (value) => sync(() => { output.push(`success: ${value}`) })
        })
      )
      resolve()
    }
  })
})

output // => ["working", "success: done"]
```

## runPromise

**Running a successful effect as a Promise**

```efx
await runPromise(succeed(1)) // => 1
```

**Running effects as promises**

```efx
//Example: Handling a Failing Effect as a Rejected Promise
const output: Array<unknown> = []

await runPromise(fail("my error")).catch(() => {
  void output.push("rejected")
})
output // => ["rejected"]
```

## runPromiseWith

**Running with services as a promise**

```efx
interface Config {
  apiUrl: string
}

const Config = Context.Service<Config>("Config")

const context = Context.make(Config, {
  apiUrl: "https://api.example.com"
})

const program = effect {
  const config = await Config
  return `Connecting to ${config.apiUrl}`
}

await runPromiseWith(context)(program) // => "Connecting to https://api.example.com"
```

## runPromiseExit

**Observing promise results as Exit**

```efx
import { Exit } from "effect"

// Execute a successful effect and get the Exit result as a Promise
await runPromiseExit(succeed(1)) // => Exit.succeed(1)

// Execute a failing effect and get the Exit result as a Promise
await runPromiseExit(fail("my error")) // => Exit.fail("my error")
```

## runPromiseExitWith

**Running with services as an Exit promise**

```efx
const output: Array<unknown> = []

interface Database {
  query: (sql: string) => string
}

const Database = Context.Service<Database>("Database")

const services = Context.make(Database, {
  query: (sql) => `Result for: ${sql}`
})

const program = effect {
  const db = await Database
  return db.query("SELECT * FROM users")
}

const exit = await runPromiseExitWith(services)(program)
if (Exit.isSuccess(exit)) {
  void output.push(`Success: ${exit.value}`)
}
output // => ["Success: Result for: SELECT * FROM users"]
```

## runSync

**Running a synchronous effect**

```efx
const output: Array<unknown> = []

const program = sync(() => {
  void output.push("Hello, World!")
  return 1
})

const result = runSync(program)
void output.push(result)
output // => ["Hello, World!", 1]
```

**Throwing for failed or async effects**

```efx
const output: Array<unknown> = []

try {
  // Attempt to run an effect that fails
  runSync(fail("my error"))
} catch (e) {
  void output.push("failed effect")
}
try {
  // Attempt to run an effect that involves async work
  runSync(promise(() => Promise.resolve(1)))
} catch (e) {
  void output.push("async effect")
}
output // => ["failed effect", "async effect"]
```

## runSyncWith

**Running synchronously with services**

```efx
interface MathService {
  add: (a: number, b: number) => number
}

const MathService = Context.Service<MathService>("MathService")

const context = Context.make(MathService, {
  add: (a, b) => a + b
})

const program = effect {
  const math = await MathService
  return math.add(2, 3)
}

const result = runSyncWith(context)(program)
result // => 5
```

## runSyncExit

**Observing synchronous results as Exit**

```efx
import { Exit } from "effect"

runSyncExit(succeed(1)) // => Exit.succeed(1)

runSyncExit(fail("my error")) // => Exit.fail("my error")
```

**Capturing async work as a Die cause**

```efx
const exit = runSyncExit(promise(() => Promise.resolve(1)))
const isAsyncDie = Exit.hasDies(exit) && exit.cause.reasons.some(
  (reason) => Cause.isDieReason(reason) && Cause.isAsyncFiberError(reason.defect)
)

isAsyncDie // => true
```

## runSyncExitWith

**Running synchronously with services as Exit**

```efx
const output: Array<unknown> = []

// Define a logger service
const Logger = Context.Service<{
  log: (msg: string) => void
}>("Logger")

const program = effect {
  const logger = await service(Logger)
  logger.log("Computing result...")
  return 42
}

// Prepare context
const context = Context.make(Logger, {
  log: (msg) => void output.push(`[LOG] ${msg}`)
})

const exit = runSyncExitWith(context)(program)

if (Exit.isSuccess(exit)) {
  void output.push(`Success: ${exit.value}`)
} else {
  void output.push(`Failure: ${exit.cause}`)
}
output // => ["[LOG] Computing result...", "Success: 42"]
```

## fn.Return

**Annotating an Effect function**

```efx
const f = effect (
  value: string
): number => {
  return await succeed(value.length)
}

//      ┌─── Effect.Effect<number>
//      ▼
const program = f("hello")
runSync(program) // => 5
```

**Annotating a parametric Effect function**

```efx
const f = Effect.fnUntraced(function*<A>(
  value: A
): Effect.fn.Return<A> {
  return yield* Effect.succeed(value)
})

//      ┌─── Effect.Effect<string>
//      ▼
const program = f("hello")
runSync(program) // => "hello"
```

## fnUntraced

**Defining untraced effect functions**

```efx
const f = effect (
  value: string
) => {
  return await succeed(value.length)
}

//      ┌─── Effect.Effect<number>
//      ▼
const program = f("hello")
runSync(program) // => 5
```

**Transforming the returned Effect**

```efx
const f = Effect.fnUntraced(
  function*(value: string) {
    return yield* succeed(value.length)
  },
  (effect, value) =>
    effect.pipe(map((length) => `${value}: ${length}`))
)

//      ┌─── Effect.Effect<string>
//      ▼
const program = f("hello")
runSync(program) // => "hello: 5"
```

**Annotating an untraced non-parametric function**

```efx
const f = effect (
  value: string
): number => {
  return await succeed(value.length)
}

//      ┌─── Effect.Effect<number>
//      ▼
const program = f("hello")
runSync(program) // => 5
```

**Annotating an untraced parametric function**

```efx
const f = Effect.fnUntraced(function*<A>(
  value: A
): Effect.fn.Return<A> {
  return yield* Effect.succeed(value)
})

//      ┌─── Effect.Effect<string>
//      ▼
const program = f("hello")
runSync(program) // => "hello"
```

## fn

**Defining traced effect functions**

```efx
const f = Effect.fn("calculateLength")(function*(value: string) {
  return yield* succeed(value.length)
})

//      ┌─── Effect.Effect<number>
//      ▼
const program = f("hello")
runSync(program) // => 5
```

**Transforming the returned Effect**

```efx
const f = Effect.fn("formatLength")(
  function*(value: string) {
    return yield* succeed(value.length)
  },
  (effect, value) =>
    effect.pipe(map((length) => `${value}: ${length}`))
)

//      ┌─── Effect.Effect<string>
//      ▼
const program = f("hello")
runSync(program) // => "hello: 5"
```

**Binding this**

```efx
class Counter {
  count = 0

  increment = Effect.fn("Counter.increment")(
    { self: this },
    function*(this: Counter, by: number) {
      this.count += by
      return yield* succeed(this.count)
    }
  )
}

const counter = new Counter()

//      ┌─── Effect.Effect<number>
//      ▼
const program = counter.increment(1)
runSync(program) // => 1
```

**Annotating a traced non-parametric function**

```efx
const f = Effect.fn("calculateLength")(function*(
  value: string
): Effect.fn.Return<number> {
  return yield* succeed(value.length)
})

//      ┌─── Effect.Effect<number>
//      ▼
const program = f("hello")
runSync(program) // => 5
```

**Annotating a traced parametric function**

```efx
const f = Effect.fn("succeed")(function*<A>(
  value: A
): Effect.fn.Return<A> {
  return yield* succeed(value)
})

//      ┌─── Effect.Effect<string>
//      ▼
const program = f("hello")
runSync(program) // => "hello"
```

## clockWith

**Accessing the Clock service**

```efx
const program = clockWith((clock) =>
  clock.currentTimeMillis.pipe(
    map(() => "Clock is available")
  )
)

runSync(program) // => "Clock is available"
```

## logWithLevel

**Logging at a dynamic level**

```efx
const output: Array<unknown> = []

const logWarn = logWithLevel("Warn")

const program = effect {
  await logWarn("Cache miss")
}
const logger = Logger.make<unknown, void>(({ logLevel, message }) => {
  void output.push(`${logLevel}: ${Array.isArray(message) ? message.map(String).join(" ") : String(message)}`)
})
const runnable = program
  |> provideService(References.MinimumLogLevel, "Debug")
  |> provide(Logger.layer([logger]))
runSync(runnable)
output // => ["Warn: Cache miss"]
```

## log

**Logging at the default level**

```efx
const output: Array<unknown> = []

const program = effect {
  const result = 2 + 2
  console.log("Result:", result)
  return result
}

const logger = Logger.make<unknown, void>(({ logLevel, message }) => {
  void output.push(`${logLevel}: ${Array.isArray(message) ? message.map(String).join(" ") : String(message)}`)
})
const runnable = provide(program, Logger.layer([logger]))
void output.push(runSync(runnable))
output // => ["Info: Result: 4", 4]
```

## logFatal

**Logging fatal messages**

```efx
const output: Array<unknown> = []

const program = effect {
  await logFatal("Critical system failure")
}

const logger = Logger.make<unknown, void>(({ logLevel, message }) => {
  void output.push(`${logLevel}: ${Array.isArray(message) ? message.map(String).join(" ") : String(message)}`)
})
const runnable = provide(program, Logger.layer([logger]))
runSync(runnable)
output // => ["Fatal: Critical system failure"]
```

## logWarning

**Logging warnings**

```efx
const output: Array<unknown> = []

const program = effect {
  console.warn("API rate limit approaching")
}

const logger = Logger.make<unknown, void>(({ logLevel, message }) => {
  void output.push(`${logLevel}: ${Array.isArray(message) ? message.map(String).join(" ") : String(message)}`)
})
runSync(provide(program, Logger.layer([logger])))
output // => ["Warn: API rate limit approaching"]
```

## logError

**Logging errors**

```efx
const output: Array<unknown> = []

const program = effect {
  console.error("Database connection failed")
}

const logger = Logger.make<unknown, void>(({ logLevel, message }) => {
  void output.push(`${logLevel}: ${Array.isArray(message) ? message.map(String).join(" ") : String(message)}`)
})
runSync(provide(program, Logger.layer([logger])))
output // => ["Error: Database connection failed"]
```

## logInfo

**Logging information**

```efx
const output: Array<unknown> = []

const program = effect {
  console.info("Application starting up")
}

const logger = Logger.make<unknown, void>(({ logLevel, message }) => {
  void output.push(`${logLevel}: ${Array.isArray(message) ? message.map(String).join(" ") : String(message)}`)
})
runSync(provide(program, Logger.layer([logger])))
output // => ["Info: Application starting up"]
```

## logDebug

**Logging debug messages**

```efx
const output: Array<unknown> = []

const program = effect {
  console.debug("Debug mode enabled")
}

const logger = Logger.make<unknown, void>(({ logLevel, message }) => {
  void output.push(`${logLevel}: ${Array.isArray(message) ? message.map(String).join(" ") : String(message)}`)
})
const runnable = program
  |> provideService(References.MinimumLogLevel, "Debug")
  |> provide(Logger.layer([logger]))
runSync(runnable)
output // => ["Debug: Debug mode enabled"]
```

## logTrace

**Logging trace messages**

```efx
const output: Array<unknown> = []

const program = effect {
  await logTrace("Entering function processData")
}

const logger = Logger.make<unknown, void>(({ logLevel, message }) => {
  void output.push(`${logLevel}: ${Array.isArray(message) ? message.map(String).join(" ") : String(message)}`)
})
const runnable = program
  |> provideService(References.MinimumLogLevel, "Trace")
  |> provide(Logger.layer([logger]))
runSync(runnable)
output // => ["Trace: Entering function processData"]
```

## withLogger

**Adding a logger to an effect**

```efx
const output: Array<unknown> = []

// Create a custom logger that logs to the console
const customLogger = Logger.make<unknown, void>(({ message }) =>
  void output.push(`[CUSTOM]: ${Array.isArray(message) ? message.map(String).join(" ") : String(message)}`)
)

const program = effect {
  console.log("This will go to both default and custom logger")
  return "completed"
}

// Add the custom logger to the effect
const programWithLogger = withLogger(program, customLogger)

runSync(provide(programWithLogger, Logger.layer([])))
output // => ["[CUSTOM]: This will go to both default and custom logger"]
```

## annotateLogs

**Adding log annotations**

```efx
const output: Array<unknown> = []

const program = effect {
  console.log("Starting operation")
}

// Add annotations to all log messages
const annotatedProgram = annotateLogs(program, {
  userId: "user123",
  operation: "data-processing"
})

// Also supports single key-value annotations
const singleAnnotated = annotateLogs(program, "requestId", "req-456")

const logger = Logger.make<unknown, void>(({ message }) =>
  void output.push(Array.isArray(message) ? message.join(" ") : String(message))
)
const run = (effect: Effect<void>) =>
  runSync(provide(effect, Logger.layer([logger])))
run(annotatedProgram)
run(singleAnnotated)
output // => ["Starting operation", "Starting operation"]
```

## annotateLogsScoped

**Adding scoped log annotations**

```efx
const output: Array<unknown> = []

const program = scoped(
  effect {
    console.log("before")
    await annotateLogsScoped({ requestId: "req-123" })
    console.log("inside scope")
  }
)

const logger = Logger.make<unknown, void>(({ message }) =>
  void output.push(Array.isArray(message) ? message.join(" ") : String(message))
)
runSync(provide(program, Logger.layer([logger])))
output // => ["before", "inside scope"]
```

## withLogSpan

**Adding a log span**

```efx
const output: Array<unknown> = []

const databaseOperation = effect {
  console.log("Connecting to database")
  console.log("Executing query")
  console.log("Processing results")
  return "data"
}

const httpRequest = effect {
  console.log("Making HTTP request")
  const data = await withLogSpan(databaseOperation, "db-operation")
  console.log("Sending response")
  return data
}

const program = withLogSpan(httpRequest, "http-handler")

const logger = Logger.make<unknown, void>(({ message }) =>
  void output.push(Array.isArray(message) ? message.join(" ") : String(message))
)
void output.push(runSync(provide(program, Logger.layer([logger]))))
output // => ["Making HTTP request", "Connecting to database", "Executing query", "Processing results", "Sending response", "data"]
```

## track

**Counting executions**

```efx
const counter = Metric.counter("effect_executions", {
  description: "Counts effect executions"
}).pipe(Metric.withConstantInput(1))

const program = succeed("Hello").pipe(
  track(counter)
)

runSync(program)
runSync(Metric.value(counter)).count // => 1
```

**Mapping exits**

```efx
const exitTracker = Metric.frequency("exit_types", {
  description: "Tracks success/failure/defect counts"
})

const mapExitToString = (exit: Exit<string, Error>) => {
  if (Exit.isSuccess(exit)) return "success"
  if (Exit.isFailure(exit)) return "failure"
  return "defect"
}

const effect = succeed("result").pipe(
  track(exitTracker, mapExitToString)
)
runSync(effect)
runSync(Metric.value(exitTracker)).occurrences.get("success") // => 1
```

## trackSuccesses

**Counting successful results**

```efx
const successCounter = Metric.counter("successes").pipe(
  Metric.withConstantInput(1)
)

const program = succeed(42).pipe(
  trackSuccesses(successCounter)
)

runSync(program)
runSync(Metric.value(successCounter)).count // => 1
```

**Mapping successes before tracking**

```efx
// Track successful request sizes
const requestSizeGauge = Metric.gauge("request_size_bytes")

const program = succeed("Hello World!").pipe(
  trackSuccesses(requestSizeGauge, (value: string) => value.length)
)

runSync(program)
runSync(Metric.value(requestSizeGauge)).value // => 12
```

## trackErrors

**Counting expected failures**

```efx
const errorCounter = Metric.counter("errors").pipe(
  Metric.withConstantInput(1)
)

const program = fail("Network timeout").pipe(
  trackErrors(errorCounter)
)

runSyncExit(program)
runSync(Metric.value(errorCounter)).count // => 1
```

**Mapping errors before tracking**

```efx
class ConnectionFailedError extends Data.TaggedError("ConnectionFailedError")<{}> {}

// Track error types using frequency metric
const errorTypeFrequency = Metric.frequency("error_types")

const program = fail(new ConnectionFailedError()).pipe(
  trackErrors(errorTypeFrequency, (error: ConnectionFailedError) => error._tag)
)

runSyncExit(program)
runSync(Metric.value(errorTypeFrequency)).occurrences.get("ConnectionFailedError") // => 1
```

## trackDefects

**Counting defects**

```efx
const defectCounter = Metric.counter("defects").pipe(
  Metric.withConstantInput(1)
)

const program = die("Critical system failure").pipe(
  trackDefects(defectCounter)
)

runSyncExit(program)
runSync(Metric.value(defectCounter)).count // => 1
```

**Mapping defects before tracking**

```efx
// Track defect types using frequency metric
const defectTypeFrequency = Metric.frequency("defect_types")

const program = die(new Error("Null pointer exception")).pipe(
  trackDefects(defectTypeFrequency, (defect: unknown) => {
    if (defect instanceof Error) return defect.constructor.name
    return typeof defect
  })
)

runSyncExit(program)
runSync(Metric.value(defectTypeFrequency)).occurrences.get("Error") // => 1
```

## trackDuration

**Recording execution duration**

```efx
const executionTimer = Metric.timer("execution_time")

const program = succeed("done").pipe(
  trackDuration(executionTimer)
)

runSync(program)
runSync(Metric.value(executionTimer)).count // => 1
```

**Mapping duration before tracking**

```efx
// Track execution time in milliseconds using custom mapping
const durationGauge = Metric.gauge("execution_millis")

const program = succeed("done").pipe(
  trackDuration(durationGauge, () => 1)
)

runSync(program)
runSync(Metric.value(durationGauge)).value // => 1
```

## Transaction

**Building transactions**

```efx
// Transaction class for software transactional memory operations
const txEffect = effect {
  const tx = await Transaction
  // Use transaction for coordinated state changes
  return "Transaction complete"
}

const runnable = provideService(txEffect, Transaction, {
  retry: false,
  journal: new Map()
})
runSync(runnable) // => "Transaction complete"
```

## tx

**Running a transaction**

```efx
const output: Array<unknown> = []

const program = effect {
  const ref1 = await TxRef.make(0)
  const ref2 = await TxRef.make(0)

  // Nested tx calls compose into the same transaction
  await tx(effect {
    await TxRef.set(ref1, 10)
    await tx(TxRef.set(ref2, 20))
    const sum = await TxRef.get(ref1) + await TxRef.get(ref2)
    void output.push(`Transaction sum: ${sum}`)
  })

  void output.push(`Final ref1: ${await TxRef.get(ref1)}`)
  void output.push(`Final ref2: ${await TxRef.get(ref2)}`)
}

runSync(program)
output // => ["Transaction sum: 30", "Final ref1: 10", "Final ref2: 20"]
```

## txRetry

**Retrying transactions**

```efx
const program = effect {
  const ref = await TxRef.make(0)
  const update = await Deferred.make<void>()

  await forkChild(
    Deferred.await(update).pipe(andThen(tx(TxRef.set(ref, 1))))
  )

  return await tx(effect {
    const value = await TxRef.get(ref)
    if (value === 0) {
      await Deferred.succeed(update, undefined)
      return await txRetry
    }
    return value
  })
}

await runPromise(program) // => 1
```

## effectify

**Converting callbacks to effects**

```efx
const uppercase = (
  input: string,
  callback: (error: Error | null, value?: string) => void
) => queueMicrotask(() => callback(null, input.toUpperCase()))

const effectfulUppercase = effectify(uppercase)
const program = effectfulUppercase("hello")

await runPromise(program) // => "HELLO"
```

**Mapping callback errors to typed failures**

```efx
const fail = (
  input: string,
  callback: (error: Error | null, value?: string) => void
) => queueMicrotask(() => callback(new Error("unavailable")))

const effectfulFail = effectify(
  fail,
  (error, args) => new Error(`Failed to process ${args[0]}: ${error.message}`)
)

const program = flip(effectfulFail("hello"))

const error = await runPromise(program)
error.message // => "Failed to process hello: unavailable"
```

## satisfiesSuccessType

**Constraining the success type**

```efx
// Define a constraint that the success type must be a number
const satisfiesNumber = satisfiesSuccessType<number>()

// This works - Effect<42, never, never> extends Effect<number, never, never>
const validEffect = satisfiesNumber(succeed(42))
runSync(validEffect) // => 42

// This would cause a TypeScript compilation error:
// const invalidEffect = satisfiesNumber(Effect.succeed("string"))
//                                      ^^^^^^^^^^^^^^^^^^^^^^
// Type 'string' is not assignable to type 'number'
```

## satisfiesErrorType

**Constraining the error type**

```efx
class ValidationError extends Data.TaggedError("ValidationError")<{}> {}

// Define a constraint that the error type must be a ValidationError
const satisfiesError = satisfiesErrorType<ValidationError>()

// This works - Effect<number, ValidationError, never> extends the constrained type
const validEffect = satisfiesError(fail(new ValidationError()))
runSync(flip(validEffect))._tag // => "ValidationError"

// This would cause a TypeScript compilation error:
// const invalidEffect = satisfiesError(Effect.fail("string error"))
//                                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^
// Type 'string' is not assignable to type 'ValidationError'
```

## satisfiesServicesType

**Constraining the services type**

```efx
// Define a constraint that requires a string as the requirements type
const satisfiesStringServices = satisfiesServicesType<string>()

// This works - effect requires string
const validEffect: Effect<number, never, "config"> = succeed(42)
const constrainedEffect = satisfiesStringServices(validEffect)

// This would cause a TypeScript compilation error if uncommented:
// const invalidEffect: Effect.Effect<number, never, number> = Effect.succeed(42)
// const constrainedInvalid = satisfiesStringServices(invalidEffect)
```

## mapEager

**Mapping already completed effects**

```efx
// For resolved effects, the mapping is applied immediately
const resolved = succeed(5)
const mapped = mapEager(resolved, (n) => n * 2) // Applied eagerly

// For pending effects, behaves like regular map
const pending = delay(succeed(5), 0)
const mappedPending = mapEager(pending, (n) => n * 2) // Uses regular map

await runPromise(all([mapped, mappedPending])) // => [10, 10]
```

## mapErrorEager

**Mapping errors eagerly when possible**

```efx
const output: Array<unknown> = []

// For resolved failure effects, the error mapping is applied immediately
const failed = fail("original error")
const mapped = mapErrorEager(failed, (err: string) => `mapped: ${err}`) // Applied eagerly

// For pending effects, behaves like regular mapError
const pending = delay(fail("error"), 0)
const mappedPending = mapErrorEager(
  pending,
  (err: string) => `mapped: ${err}`
) // Uses regular mapError

void output.push(await runPromise(all([
  flip(mapped),
  flip(mappedPending)
])))
output // => [['mapped: original error', 'mapped: error']]
```

## mapBothEager

**Mapping both channels eagerly when possible**

```efx
const output: Array<unknown> = []

// For resolved effects, the appropriate mapping is applied immediately
const success = succeed(5)
const mapped = mapBothEager(success, {
  onFailure: (err: string) => `Failed: ${err}`,
  onSuccess: (n: number) => n * 2
}) // onSuccess applied eagerly

const failure = fail("error")
const mappedError = mapBothEager(failure, {
  onFailure: (err: string) => `Failed: ${err}`,
  onSuccess: (n: number) => n * 2
}) // onFailure applied eagerly

void output.push(runSync(mapped))
void output.push(runSync(flip(mappedError)))
output // => [10, "Failed: error"]
```

## flatMapEager

**Flat mapping eagerly when possible**

```efx
// For resolved effects, the flatMap is applied immediately
const resolved = succeed(5)
const flatMapped = flatMapEager(resolved, (n) => succeed(n * 2)) // Applied eagerly

// For pending effects, behaves like regular flatMap
const pending = delay(succeed(5), 0)
const flatMappedPending = flatMapEager(
  pending,
  (n) => succeed(n * 2)
) // Uses regular flatMap

await runPromise(all([flatMapped, flatMappedPending])) // => [10, 10]
```

## catchEager

**Catching failures eagerly when possible**

```efx
const output: Array<unknown> = []

// For resolved failure effects, the catch function is applied immediately
const failed = fail("original error")
const recovered = catchEager(
  failed,
  (err: string) => succeed(`recovered from: ${err}`)
) // Applied eagerly

// For success effects, returns success as-is
const success = succeed(42)
const unchanged = catchEager(
  success,
  (err: string) => succeed(`recovered from: ${err}`)
) // Returns success as-is

// For pending effects, behaves like regular catch
const pending = delay(fail("error"), 0)
const recoveredPending = catchEager(
  pending,
  (err: string) => succeed(`recovered from: ${err}`)
) // Uses regular catch

void output.push(await runPromise(all([
  recovered,
  unchanged,
  recoveredPending
])))
output // => [['recovered from: original error', 42, 'recovered from: error']]
```

## fnUntracedEager

**Defining eager untraced effect functions**

```efx
const computation = fnUntracedEager(function*() {
  yield* succeed(1)
  yield* succeed(2)
  return "computed eagerly"
})

const effect = computation() // Executed immediately if all effects are sync
runSync(effect) // => "computed eagerly"
```
