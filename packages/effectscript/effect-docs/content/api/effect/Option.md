# effect/Option

The examples in the JSDoc of `packages/effect/src/Option.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Option.Value

**Extracting the value type**

```efx
import { Option } from "effect"

const myOption: Option.Option<string> = Option.some("value")
type MyType = Option.Option.Value<typeof myOption>

const witness: MyType = "value"
```

## none

**Creating an empty Option**

```efx
import { Option } from "effect"

//      ┌─── Option<never>
//      ▼
const noValue = Option.none() // => Option.none()
```

## some

**Wrapping a value**

```efx
import { Option } from "effect"

//      ┌─── Option<number>
//      ▼
const value = Option.some(1) // => Option.some(1)
```

## isOption

**Checking if a value is an Option**

```efx
import { Option } from "effect"

Option.isOption(Option.some(1)) // => true
Option.isOption(Option.none()) // => true
Option.isOption({}) // => false
```

## isNone

**Checking for None**

```efx
import { Option } from "effect"

Option.isNone(Option.some(1)) // => false
Option.isNone(Option.none()) // => true
```

## isSome

**Checking for Some**

```efx
import { Option } from "effect"

Option.isSome(Option.some(1)) // => true
Option.isSome(Option.none()) // => false
```

## match

**Matching on an Option**

```efx
import { Option } from "effect"

Option.match(Option.some(1), {
  onNone: () => "Option is empty",
  onSome: (value) => `Option has a value: ${value}`
}) // => "Option has a value: 1"
```

## toRefinement

**Converting a parser to a type guard**

```efx
import { Option } from "effect"

type MyData = string | number

const parseString = (data: MyData): Option.Option<string> =>
  typeof data === "string" ? Option.some(data) : Option.none()

//      ┌─── (a: MyData) => a is string
//      ▼
const isString = Option.toRefinement(parseString)

isString("a") // => true
isString(1) // => false
```

## fromIterable

**Getting the first element**

```efx
import { Option } from "effect"

Option.fromIterable([1, 2, 3]) // => Option.some(1)
Option.fromIterable([]) // => Option.none()
```

## getSuccess

**Extracting the success side**

```efx
import { Option, Result } from "effect"

Option.getSuccess(Result.succeed("ok")) // => Option.some("ok")
Option.getSuccess(Result.fail("err")) // => Option.none()
```

## getFailure

**Extracting the failure side**

```efx
import { Option, Result } from "effect"

Option.getFailure(Result.succeed("ok")) // => Option.none()
Option.getFailure(Result.fail("err")) // => Option.some("err")
```

## getOrElse

**Unwrapping with a fallback**

```efx
import { Option } from "effect"

Option.some(1).pipe(Option.getOrElse(() => 0)) // => 1
Option.none().pipe(Option.getOrElse(() => 0)) // => 0
```

## orElse

**Providing a fallback Option**

```efx
import { Option } from "effect"

Option.none().pipe(Option.orElse(() => Option.some("b"))) // => Option.some("b")
Option.some("a").pipe(Option.orElse(() => Option.some("b"))) // => Option.some("a")
```

## orElseSome

**Providing a fallback value**

```efx
import { Option } from "effect"

Option.none().pipe(Option.orElseSome(() => "b")) // => Option.some("b")
Option.some("a").pipe(Option.orElseSome(() => "b")) // => Option.some("a")
```

## orElseResult

**Tracking value source**

```efx
import { Option, Result } from "effect"

const fallback = () => Option.some("fallback")

Option.orElseResult(Option.some("primary"), fallback) // => Option.some(Result.fail("primary"))
Option.orElseResult(Option.none(), fallback) // => Option.some(Result.succeed("fallback"))
```

## firstSomeOf

**Finding the first Some**

```efx
import { Option } from "effect"

Option.firstSomeOf([
  Option.none(),
  Option.some(1),
  Option.some(2)
]) // => Option.some(1)
```

## fromNullishOr

**Converting nullable values to an Option**

```efx
import { Option } from "effect"

Option.fromNullishOr(undefined) // => Option.none()
Option.fromNullishOr(null) // => Option.none()
Option.fromNullishOr(1) // => Option.some(1)
```

## fromUndefinedOr

**Converting possibly undefined values to an Option**

```efx
import { Option } from "effect"

Option.fromUndefinedOr(undefined) // => Option.none()
Option.fromUndefinedOr(null) // => Option.some(null)
Option.fromUndefinedOr(42) // => Option.some(42)
```

## fromNullOr

**Converting possibly null values to an Option**

```efx
import { Option } from "effect"

Option.fromNullOr(null) // => Option.none()
Option.fromNullOr(undefined) // => Option.some(undefined)
Option.fromNullOr(42) // => Option.some(42)
```

## liftNullishOr

**Lifting a parser**

```efx
import { Option } from "effect"

const parse = (s: string): number | undefined => {
  const n = parseFloat(s)
  return isNaN(n) ? undefined : n
}

const parseOption = Option.liftNullishOr(parse)

parseOption("1") // => Option.some(1)
parseOption("not a number") // => Option.none()
```

## getOrNull

**Unwrapping to null**

```efx
import { Option } from "effect"

Option.getOrNull(Option.some(1)) // => 1
Option.getOrNull(Option.none()) // => null
```

## getOrUndefined

**Unwrapping to undefined**

```efx
import { Option } from "effect"

Option.getOrUndefined(Option.some(1)) // => 1
Option.getOrUndefined(Option.none()) // => undefined
```

## liftThrowable

**Lifting JSON.parse**

```efx
import { Option } from "effect"

const parse = Option.liftThrowable(JSON.parse)

parse("1") // => Option.some(1)
parse("") // => Option.none()
```

## getOrThrowWith

**Throwing a custom error**

```efx
import { Option, Result } from "effect"

Option.getOrThrowWith(Option.some(1), () => new Error("missing")) // => 1

const failure = Result.try({
  try: () => Option.getOrThrowWith(Option.none(), () => new Error("missing")),
  catch: (error) => (error as Error).message
})
Result.getFailure(failure).pipe(Option.getOrElse(() => "no error")) // => "missing"
```

## getOrThrow

**Throwing a default error**

```efx
import { Option, Result } from "effect"

Option.getOrThrow(Option.some(1)) // => 1

const failure = Result.try({
  try: () => Option.getOrThrow(Option.none()),
  catch: (error) => (error as Error).message
})
Result.getFailure(failure).pipe(Option.getOrElse(() => "no error")) // => "getOrThrow called on a None"
```

## map

**Mapping over an Option**

```efx
import { Option } from "effect"

Option.map(Option.some(2), (n) => n * 2) // => Option.some(4)
Option.map(Option.none(), (n: number) => n * 2) // => Option.none()
```

## as

**Replacing a value**

```efx
import { Option } from "effect"

Option.as(Option.some(42), "new value") // => Option.some("new value")
Option.as(Option.none(), "new value") // => Option.none()
```

## asVoid

**Voiding the value**

```efx
import { Option } from "effect"

Option.asVoid(Option.some(42)) // => Option.some(undefined)
Option.asVoid(Option.none()) // => Option.none()
```

## void

**Referencing Option.void**

```efx
import { Option } from "effect"

Option.void // => Option.some(undefined)
```

## flatMap

**Chaining optional lookups**

```efx
import { Option } from "effect"

interface User {
  readonly name: string
  readonly address: Option.Option<{ readonly street: Option.Option<string> }>
}

const user: User = {
  name: "John",
  address: Option.some({ street: Option.some("123 Main St") })
}

user.address.pipe(
  Option.flatMap((addr) => addr.street)
) // => Option.some("123 Main St")
```

## andThen

**Chaining with andThen**

```efx
import { Option } from "effect"

// Chain with a function returning Option
Option.andThen(Option.some(5), (x) => Option.some(x * 2)) // => Option.some(10)

// Chain with a static value
Option.andThen(Option.some(5), "hello") // => Option.some("hello")

// Chain with None - skips
Option.andThen(Option.none(), (x) => Option.some(x * 2)) // => Option.none()
```

## flatMapNullishOr

**Navigating optional properties**

```efx
import { Option } from "effect"

interface Employee {
  company?: { address?: { street?: { name?: string } } }
}

const emp: Employee = {
  company: { address: { street: { name: "high street" } } }
}

Option.some(emp).pipe(
  Option.flatMapNullishOr((e) => e.company?.address?.street?.name)
) // => Option.some("high street")
```

## flatten

**Flattening nested Options**

```efx
import { Option } from "effect"

Option.flatten(Option.some(Option.some("value"))) // => Option.some("value")
Option.flatten(Option.some(Option.none())) // => Option.none()
```

## zipRight

**Keeping the second value**

```efx
import { Option } from "effect"

Option.zipRight(Option.some(1), Option.some("hello")) // => Option.some("hello")
Option.zipRight(Option.none(), Option.some("hello")) // => Option.none()
```

## zipLeft

**Keeping the first value**

```efx
import { Option } from "effect"

Option.zipLeft(Option.some("hello"), Option.some(1)) // => Option.some("hello")
Option.zipLeft(Option.some("hello"), Option.none()) // => Option.none()
```

## composeK

**Composing parsers**

```efx
import { Option } from "effect"

const parse = (s: string): Option.Option<number> =>
  isNaN(Number(s)) ? Option.none() : Option.some(Number(s))

const double = (n: number): Option.Option<number> =>
  n > 0 ? Option.some(n * 2) : Option.none()

const parseAndDouble = Option.composeK(parse, double)

parseAndDouble("42") // => Option.some(84)
parseAndDouble("not a number") // => Option.none()
```

## tap

**Validating without transforming**

```efx
import { Option } from "effect"

const getInteger = (n: number) =>
  Number.isInteger(n) ? Option.some(n) : Option.none()

Option.tap(Option.some(1), getInteger) // => Option.some(1)
Option.tap(Option.some(1.14), getInteger) // => Option.none()
```

## product

**Pairing two Options**

```efx
import { Option } from "effect"

Option.product(Option.some("hello"), Option.some(42)) // => Option.some(["hello", 42])
Option.product(Option.none(), Option.some(42)) // => Option.none()
```

## productMany

**Combining many Options**

```efx
import { Option } from "effect"

const first = Option.some(1)
const rest = [Option.some(2), Option.some(3)]

Option.productMany(first, rest) // => Option.some([1, 2, 3])
Option.productMany(first, [Option.some(2), Option.none()]) // => Option.none()
```

## all

**Combining a tuple and a struct**

```efx
import { Option } from "effect"

const maybeName: Option.Option<string> = Option.some("John")
const maybeAge: Option.Option<number> = Option.some(25)

//      ┌─── Option<[string, number]>
//      ▼
const tuple = Option.all([maybeName, maybeAge]) // => Option.some(["John", 25])

//      ┌─── Option<{ name: string; age: number; }>
//      ▼
const struct = Option.all({ name: maybeName, age: maybeAge }) // => Option.some({ name: "John", age: 25 })
```

## zipWith

**Combining with a function**

```efx
import { Option } from "effect"

Option.zipWith(
  Option.some("John"),
  Option.some(25),
  (name, age) => ({ name: name.toUpperCase(), age })
) // => Option.some({ name: "JOHN", age: 25 })
```

## reduceCompact

**Summing present values**

```efx

const items = [Option.some(1), Option.none(), Option.some(2), Option.none()]

items |> Option.reduceCompact(0, (b, a) => b + a) // => 3
```

## toArray

**Converting to an array**

```efx
import { Option } from "effect"

Option.toArray(Option.some(1)) // => [1]
Option.toArray(Option.none()) // => []
```

## partitionMap

**Partitioning by Result**

```efx
import { Option, Result } from "effect"

const parseNumber = (s: string): Result.Result<number, string> => {
  const n = Number(s)
  return isNaN(n) ? Result.fail("Not a number") : Result.succeed(n)
}

Option.partitionMap(Option.some("42"), parseNumber) // => [Option.some(42), Option.none()]
Option.partitionMap(Option.some("abc"), parseNumber) // => [Option.none(), Option.some("Not a number")]
Option.partitionMap(Option.none(), parseNumber) // => [Option.none(), Option.none()]
```

## filterMap

**Filtering and transforming**

```efx
import { Option, Result } from "effect"

Option.filterMap(
  Option.some(2),
  (n) => (n % 2 === 0 ? Result.succeed(`Even: ${n}`) : Result.failVoid)
) // => Option.some("Even: 2")
```

## filter

**Filtering with a predicate**

```efx
import { Option } from "effect"

const removeEmpty = (input: Option.Option<string>) =>
  Option.filter(input, (value) => value !== "")

removeEmpty(Option.some("hello")) // => Option.some("hello")
removeEmpty(Option.some("")) // => Option.none()
removeEmpty(Option.none()) // => Option.none()
```

## makeEquivalence

**Comparing Options**

```efx
import { Equivalence, Option } from "effect"

const eq = Option.makeEquivalence(Equivalence.strictEqual<number>())

eq(Option.some(1), Option.some(1)) // => true
eq(Option.some(1), Option.some(2)) // => false
eq(Option.none(), Option.none()) // => true
```

## makeOrder

**Ordering Options**

```efx
import { Number as N, Option } from "effect"

const ord = Option.makeOrder(N.Order)

ord(Option.none(), Option.some(1)) // => -1
ord(Option.some(1), Option.none()) // => 1
ord(Option.some(1), Option.some(2)) // => -1
```

## lift2

**Lifting addition**

```efx
import { Option } from "effect"

const addOptions = Option.lift2((a: number, b: number) => a + b)

addOptions(Option.some(2), Option.some(3)) // => Option.some(5)
addOptions(Option.some(2), Option.none()) // => Option.none()
```

## liftPredicate

**Validating positive numbers**

```efx
import { Option } from "effect"

const parsePositive = Option.liftPredicate((n: number) => n > 0)

parsePositive(1) // => Option.some(1)
parsePositive(-1) // => Option.none()
```

## containsWith

**Checking with custom equivalence**

```efx
import { Equivalence, Option } from "effect"

const check = Option.containsWith(Equivalence.strictEqual<number>())

Option.some(2).pipe(check(2)) // => true
Option.some(1).pipe(check(2)) // => false
Option.none().pipe(check(2)) // => false
```

## contains

**Checking containment**

```efx
import { Option } from "effect"

Option.some(2).pipe(Option.contains(2)) // => true
Option.some(1).pipe(Option.contains(2)) // => false
Option.none().pipe(Option.contains(2)) // => false
```

## exists

**Testing a condition**

```efx
import { Option } from "effect"

const isEven = (n: number) => n % 2 === 0

Option.some(2).pipe(Option.exists(isEven)) // => true
Option.some(1).pipe(Option.exists(isEven)) // => false
Option.none().pipe(Option.exists(isEven)) // => false
```

## bindTo

**Starting do notation**

```efx

Option.some(2)
  |> Option.bindTo("x")
  |> Option.bind("y", () => Option.some(3))
  |> Option.let("sum", ({ x, y }) => x + y) // => Option.some({ x: 2, y: 3, sum: 5 })
```

## let

**Adding a computed value**

```efx

Option.Do
  |> Option.bind("x", () => Option.some(2))
  |> Option.bind("y", () => Option.some(3))
  |> Option.let("sum", ({ x, y }) => x + y) // => Option.some({ x: 2, y: 3, sum: 5 })
```

## bind

**Binding Option values**

```efx

Option.Do
  |> Option.bind("x", () => Option.some(2))
  |> Option.bind("y", () => Option.some(3))
  |> Option.let("sum", ({ x, y }) => x + y)
  |> Option.filter(({ x, y }) => x * y > 5) // => Option.some({ x: 2, y: 3, sum: 5 })
```

## Do

**Building Option pipelines with do notation**

```efx

Option.Do
  |> Option.bind("x", () => Option.some(2))
  |> Option.bind("y", () => Option.some(3))
  |> Option.let("sum", ({ x, y }) => x + y)
  |> Option.filter(({ x, y }) => x * y > 5) // => Option.some({ x: 2, y: 3, sum: 5 })
```

## gen

**Sequencing Option computations with generator syntax**

```efx
import { Option } from "effect"

const maybeName: Option.Option<string> = Option.some("John")
const maybeAge: Option.Option<number> = Option.some(25)

Option.gen(function*() {
  const name = (yield* maybeName).toUpperCase()
  const age = yield* maybeAge
  return { name, age }
}) // => Option.some({ name: "JOHN", age: 25 })
```

## makeReducer

**Reducing with first-wins semantics**

```efx
import { Number, Option } from "effect"

const reducer = Option.makeReducer(Number.ReducerSum)
reducer.combineAll([Option.some(1), Option.none(), Option.some(2)]) // => Option.some(3)
```

## makeCombinerFailFast

**Fail-fast combining**

```efx
import { Number, Option } from "effect"

const combiner = Option.makeCombinerFailFast(Number.ReducerSum)
combiner.combine(Option.some(1), Option.some(2)) // => Option.some(3)
combiner.combine(Option.some(1), Option.none()) // => Option.none()
```

## makeReducerFailFast

**Fail-fast reducing**

```efx
import { Number, Option } from "effect"

const reducer = Option.makeReducerFailFast(Number.ReducerSum)
reducer.combineAll([Option.some(1), Option.some(2)]) // => Option.some(3)
reducer.combineAll([Option.some(1), Option.none()]) // => Option.none()
```
