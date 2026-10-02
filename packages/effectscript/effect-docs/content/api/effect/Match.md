# effect/Match

The examples in the JSDoc of `packages/effect/src/Match.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Matcher

**Matching string and number values**

```efx
import { Match } from "effect"

// Simulated dynamic input that can be a string or a number
const input: string | number = "some input"

//      ┌─── string
//      ▼
const result = Match.value(input).pipe(
  // Match if the value is a number
  Match.when(Match.number, (n) => `number: ${n}`),
  // Match if the value is a string
  Match.when(Match.string, (s) => `string: ${s}`),
  // Ensure all possible cases are covered
  Match.exhaustive
)

result // => "string: some input"
```

## TypeMatcher

**Creating a type matcher**

```efx
import { Match } from "effect"

// Create a TypeMatcher for string | number
const matcher = Match.type<string | number>().pipe(
  Match.when(Match.string, (s) => `String: ${s}`),
  Match.when(Match.number, (n) => `Number: ${n}`),
  Match.exhaustive
)

matcher("hello") // => "String: hello"
matcher(42) // => "Number: 42"
```

## ValueMatcher

**Creating a value matcher**

```efx
import { Match } from "effect"

const input = { type: "user", name: "Alice", age: 30 }

// Create a ValueMatcher for the specific input
const result = Match.value(input).pipe(
  Match.when({ type: "user" }, (user) => `User: ${user.name}`),
  Match.when({ type: "admin" }, (admin) => `Admin: ${admin.name}`),
  Match.orElse(() => "Unknown type")
)

result // => "User: Alice"
```

## When

**Creating positive match cases**

```efx
import { Match } from "effect"

// When creates cases that match specific patterns
const stringMatcher = Match.type<string | number>().pipe(
  Match.when(Match.string, (s: string) => `Got string: ${s}`),
  Match.when(Match.number, (n: number) => `Got number: ${n}`),
  Match.exhaustive
)

stringMatcher("hello") // => "Got string: hello"
stringMatcher(42) // => "Got number: 42"
```

## Not

**Creating negative match cases**

```efx
import { Match } from "effect"

// Not creates cases that exclude specific patterns
const matcher = Match.type<string>().pipe(
  // Match any string except "forbidden"
  Match.not("forbidden", (s) => `Allowed: ${s}`),
  Match.orElse(() => "This string is forbidden")
)

matcher("hello") // => "Allowed: hello"
matcher("forbidden") // => "This string is forbidden"
```

## type

**Matching Numbers and Strings**

```efx
import { Match } from "effect"

// Create a matcher for values that are either strings or numbers
//
//      ┌─── (u: string | number) => string
//      ▼
const match = Match.type<string | number>().pipe(
  // Match when the value is a number
  Match.when(Match.number, (n) => `number: ${n}`),
  // Match when the value is a string
  Match.when(Match.string, (s) => `string: ${s}`),
  // Ensure all possible cases are handled
  Match.exhaustive
)

match(0) // => "number: 0"

match("hello") // => "string: hello"
```

## fn

**Creating a reusable matcher**

```efx
import { Match } from "effect"

const format = Match.fn((prefix: string, value: "a" | "b") => value).pipe(
  Match.when("a", (_value, prefix) => `${prefix}: A`),
  Match.when("b", (_value, prefix) => `${prefix}: B`),
  Match.exhaustive
)

format("status", "a") // => "status: A"
```

## value

**Matching an Object by Property**

```efx
import { Match } from "effect"

const input = { name: "John", age: 30 }

// Create a matcher for the specific object
const result = Match.value(input).pipe(
  // Match when the 'name' property is "John"
  Match.when(
    { name: "John" },
    (user) => `${user.name} is ${user.age} years old`
  ),
  // Provide a fallback if no match is found
  Match.orElse(() => "Oh, not John")
)

result // => "John is 30 years old"
```

## valueTags

**Matching value tags**

```efx

type Status = { readonly _tag: "Success"; readonly data: string }

const success: Status = { _tag: "Success", data: "Hello" }

// Simple valueTags usage
const message = match (success) {
  when Success(result): `Success: ${result.data}`
}

message // => "Success: Hello"
```

## typeTags

**Matching type tags**

```efx
import { Match } from "effect"

type Result =
  | { readonly _tag: "Success"; readonly data: string }
  | { readonly _tag: "Error"; readonly message: string }
  | { readonly _tag: "Loading" }

// Create a matcher with specific return type
const formatResult = Match.typeTags<Result, string>()({
  Success: (result) => `Data: ${result.data}`,
  Error: (result) => `Error: ${result.message}`,
  Loading: () => "Loading..."
})

formatResult({ _tag: "Success", data: "Hello World" }) // => "Data: Hello World"

formatResult({ _tag: "Error", message: "Network failed" }) // => "Error: Network failed"

// Create a matcher with inferred return type
const processResult = Match.typeTags<Result>()({
  Success: (result) => ({ type: "ok", value: result.data }),
  Error: (result) => ({ type: "error", error: result.message }),
  Loading: () => ({ type: "pending" })
})

processResult({ _tag: "Loading" }) // => { type: "pending" }
```

## withReturnType

**Validating return type consistency**

```efx
import { Match } from "effect"

const match = Match.type<{ a: number } | { b: string }>().pipe(
  // Ensure all branches return a string
  Match.withReturnType<string>(),
  // ❌ Type error: 'number' is not assignable to type 'string'
  // @ts-expect-error
  Match.when({ a: Match.number }, (_) => _.a),
  // ✅ Correct: returns a string
  Match.when({ b: Match.string }, (_) => _.b),
  Match.exhaustive
)
```

## when

**Matching with values and predicates**

```efx
import { Match } from "effect"

// Create a matcher for objects with an "age" property
const match = Match.type<{ age: number }>().pipe(
  // Match when age is greater than 18
  Match.when(
    { age: (age: number) => age > 18 },
    (user: { age: number }) => `Age: ${user.age}`
  ),
  // Match when age is exactly 18
  Match.when({ age: 18 }, () => "You can vote"),
  // Fallback case for all other ages
  Match.orElse((user: { age: number }) => `${user.age} is too young`)
)

match({ age: 20 }) // => "Age: 20"

match({ age: 18 }) // => "You can vote"

match({ age: 4 }) // => "4 is too young"
```

## whenOr

**Matching one of several patterns**

```efx
import { Match } from "effect"

type ErrorType =
  | { readonly _tag: "NetworkError"; readonly message: string }
  | { readonly _tag: "TimeoutError"; readonly duration: number }
  | { readonly _tag: "ValidationError"; readonly field: string }

const handleError = Match.type<ErrorType>().pipe(
  Match.whenOr(
    { _tag: "NetworkError" },
    { _tag: "TimeoutError" },
    () => "Retry the request"
  ),
  Match.when({ _tag: "ValidationError" }, (_) => `Invalid field: ${_.field}`),
  Match.exhaustive
)

handleError({ _tag: "NetworkError", message: "No connection" }) // => "Retry the request"

handleError({ _tag: "ValidationError", field: "email" }) // => "Invalid field: email"
```

## whenAnd

**Matching all provided patterns**

```efx
import { Match } from "effect"

type User = { readonly age: number; readonly role: "admin" | "user" }

const checkUser = Match.type<User>().pipe(
  Match.whenAnd(
    { age: (n) => n >= 18 },
    { role: "admin" },
    () => "Admin access granted"
  ),
  Match.orElse(() => "Access denied")
)

checkUser({ age: 20, role: "admin" }) // => "Admin access granted"

checkUser({ age: 20, role: "user" }) // => "Access denied"
```

## discriminator

**Matching on a discriminator field**

```efx

const match = Match.type<
    { type: "A"; a: string } | { type: "B"; b: number } | {
      type: "C"
      c: boolean
    }
  >()
  |> Match.discriminator("type")("A", "B", (_) => `A or B: ${_.type}`)
  |> Match.discriminator("type")("C", (_) => `C(${_.c})`)
  |> Match.exhaustive
match({ type: "A", a: "ok" }) // => "A or B: A"
match({ type: "C", c: true }) // => "C(true)"
```

## discriminatorStartsWith

**Matching discriminator prefixes**

```efx

const match = Match.type<{ type: "A" } | { type: "B" } | { type: "A.A" } | {}>()
  |> Match.discriminatorStartsWith("type")("A", (_) => 1 as const)
  |> Match.discriminatorStartsWith("type")("B", (_) => 2 as const)
  |> Match.orElse((_) => 3 as const)

match({ type: "A" }) // => 1
match({ type: "B" }) // => 2
match({ type: "A.A" }) // => 1
```

## discriminators

**Mapping discriminator handlers**

```efx

const match = Match.type<
    { type: "A"; a: string } | { type: "B"; b: number } | {
      type: "C"
      c: boolean
    }
  >()
  |> Match.discriminators("type")({
    A: (a) => a.a,
    B: (b) => b.b,
    C: (c) => c.c
  })
  |> Match.exhaustive
match({ type: "A", a: "ok" }) // => "ok"
match({ type: "B", b: 42 }) // => 42
```

## discriminatorsExhaustive

**Handling all discriminator cases**

```efx

const match = Match.type<
    { type: "A"; a: string } | { type: "B"; b: number } | {
      type: "C"
      c: boolean
    }
  >()
  |> Match.discriminatorsExhaustive("type")({
    A: (a) => a.a,
    B: (b) => b.b,
    C: (c) => c.c
  })
match({ type: "C", c: true }) // => true
```

## tag

**Matching a discriminated union by tag**

```efx
import { Match } from "effect"

type Event =
  | { readonly _tag: "fetch" }
  | { readonly _tag: "success"; readonly data: string }
  | { readonly _tag: "error"; readonly error: Error }
  | { readonly _tag: "cancel" }

const match = Match.type<Event>().pipe(
  // Match either "fetch" or "success"
  Match.tag("fetch", "success", () => `Ok!`),
  // Match "error" and extract the error message
  Match.tag("error", (event) => `Error: ${event.error.message}`),
  // Match "cancel"
  Match.tag("cancel", () => "Cancelled"),
  Match.exhaustive
)

match({ _tag: "success", data: "Hello" }) // => "Ok!"

match({ _tag: "error", error: new Error("Oops!") }) // => "Error: Oops!"
```

## tagStartsWith

**Matching tag prefixes**

```efx

const match = Match.type<{ _tag: "A" } | { _tag: "B" } | { _tag: "A.A" } | {}>()
  |> Match.tagStartsWith("A", (_) => 1 as const)
  |> Match.tagStartsWith("B", (_) => 2 as const)
  |> Match.orElse((_) => 3 as const)

match({ _tag: "A" }) // => 1
match({ _tag: "B" }) // => 2
match({ _tag: "A.A" }) // => 1
```

## tags

**Mapping tag handlers**

```efx

const match = Match.type<
    { _tag: "A"; a: string } | { _tag: "B"; b: number } | {
      _tag: "C"
      c: boolean
    }
  >()
  |> Match.tags({
    A: (a) => a.a,
    B: (b) => b.b,
    C: (c) => c.c
  })
  |> Match.exhaustive
match({ _tag: "A", a: "ok" }) // => "ok"
```

## tagsExhaustive

**Handling all tag cases**

```efx

const match = Match.type<
    { _tag: "A"; a: string } | { _tag: "B"; b: number } | {
      _tag: "C"
      c: boolean
    }
  >()
  |> Match.tagsExhaustive({
    A: (a) => a.a,
    B: (b) => b.b,
    C: (c) => c.c
  })
match({ _tag: "B", b: 42 }) // => 42
```

## not

**Ignoring a specific value**

```efx
import { Match } from "effect"

// Create a matcher for string or number values
const match = Match.type<string | number>().pipe(
  // Match any value except "hi", returning "ok"
  Match.not("hi", () => "ok"),
  // Fallback case for when the value is "hi"
  Match.orElse(() => "fallback")
)

match("hello") // => "ok"

match("hi") // => "fallback"
```

## nonEmptyString

**Matching non-empty strings**

```efx
import { Match } from "effect"

const processInput = Match.type<string>()
  .pipe(
    Match.when(Match.nonEmptyString, (str) => `Valid input: ${str}`),
    Match.orElse(() => "Input cannot be empty")
  )

processInput("hello") // => "Valid input: hello"

processInput("") // => "Input cannot be empty"

processInput("   ") // => "Valid input:    "
```

## is

**Matching literal values**

```efx
import { Match } from "effect"

const handleStatus = Match.type<string | number>()
  .pipe(
    Match.when(Match.is("success", "ok", 200), () => "Operation successful"),
    Match.when(Match.is("error", "failed", 500), () => "Operation failed"),
    Match.when(Match.is(0, false, null), () => "Falsy value"),
    Match.orElse((value) => `Unknown status: ${value}`)
  )

handleStatus("success") // => "Operation successful"

handleStatus(200) // => "Operation successful"

handleStatus("failed") // => "Operation failed"

handleStatus(0) // => "Falsy value"

handleStatus("pending") // => "Unknown status: pending"
```

## string

**Matching string values**

```efx
import { Match } from "effect"

const processValue = Match.type<string | number | boolean>().pipe(
  Match.when(Match.string, (str) => `String: ${str.toUpperCase()}`),
  Match.when(Match.number, (num) => `Number: ${num * 2}`),
  Match.when(Match.boolean, (bool) => `Boolean: ${bool ? "yes" : "no"}`),
  Match.exhaustive
)

processValue("hello") // => "String: HELLO"
processValue(42) // => "Number: 84"
processValue(true) // => "Boolean: yes"
```

## number

**Matching number values**

```efx
import { Match } from "effect"

const categorizeNumber = Match.type<unknown>().pipe(
  Match.when(Match.number, (num) => {
    if (Number.isNaN(num)) return "Not a number"
    if (!Number.isFinite(num)) return "Infinite"
    if (Number.isInteger(num)) return `Integer: ${num}`
    return `Float: ${num.toFixed(2)}`
  }),
  Match.orElse(() => "Not a number type")
)

categorizeNumber(42) // => "Integer: 42"
categorizeNumber(3.14) // => "Float: 3.14"
categorizeNumber(NaN) // => "Not a number"
categorizeNumber("hello") // => "Not a number type"
```

## any

**Matching any remaining value**

```efx
import { Match } from "effect"

const describeValue = Match.type<unknown>()
  .pipe(
    Match.when(Match.string, (str) => `String: ${str}`),
    Match.when(Match.number, (num) => `Number: ${num}`),
    Match.when(Match.boolean, (bool) => `Boolean: ${bool}`),
    Match.when(Match.any, (value) => `Other: ${typeof value}`),
    Match.exhaustive
  )

describeValue("hello") // => "String: hello"

describeValue(42) // => "Number: 42"

describeValue([1, 2, 3]) // => "Other: object"

describeValue(null) // => "Other: object"
```

## defined

**Matching defined values**

```efx
import { Match } from "effect"

const processValue = Match.type<string | number | null | undefined>()
  .pipe(
    Match.when(Match.defined, (value) => `Defined value: ${value}`),
    Match.orElse(() => "Value is null or undefined")
  )

processValue("hello") // => "Defined value: hello"

processValue(42) // => "Defined value: 42"

processValue(0) // => "Defined value: 0"

processValue("") // => "Defined value: "

processValue(null) // => "Value is null or undefined"

processValue(undefined) // => "Value is null or undefined"
```

## boolean

**Matching boolean values**

```efx
import { Match } from "effect"

const describeTruthiness = Match.type<unknown>().pipe(
  Match.when(
    Match.boolean,
    (bool) => bool ? "Definitely true" : "Definitely false"
  ),
  Match.when(0, () => "Falsy number"),
  Match.when("", () => "Empty string"),
  Match.when(Match.null, () => "Null value"),
  Match.orElse(() => "Some other truthy value")
)

describeTruthiness(true) // => "Definitely true"
describeTruthiness(false) // => "Definitely false"
describeTruthiness(0) // => "Falsy number"
describeTruthiness(1) // => "Some other truthy value"
```

## bigint

**Matching bigint values**

```efx
import { Match } from "effect"

const processLargeNumber = Match.type<unknown>().pipe(
  Match.when(Match.bigint, (big) => {
    if (big > 9007199254740991n) {
      return `Large integer: ${big.toString()}`
    }
    return `BigInt: ${big.toString()}`
  }),
  Match.when(Match.number, (num) => `Regular number: ${num}`),
  Match.orElse(() => "Not a numeric type")
)

processLargeNumber(123n) // => "BigInt: 123"
processLargeNumber(9007199254740992n) // => "Large integer: 9007199254740992"
processLargeNumber(123) // => "Regular number: 123"
processLargeNumber("123") // => "Not a numeric type"
```

## symbol

**Matching symbol values**

```efx
import { Match } from "effect"

const mySymbol = Symbol("my-symbol")
const globalSymbol = Symbol.for("global-symbol")

const handleSymbol = Match.type<unknown>().pipe(
  Match.when(Match.symbol, (sym) => {
    const description = sym.description
    if (description) {
      return `Symbol with description: ${description}`
    }
    return "Symbol without description"
  }),
  Match.orElse(() => "Not a symbol")
)

handleSymbol(mySymbol) // => "Symbol with description: my-symbol"
handleSymbol(Symbol()) // => "Symbol without description"
handleSymbol("string") // => "Not a symbol"
```

## date

**Matching Date instances**

```efx
import { Match } from "effect"

const processDateValue = Match.type<unknown>().pipe(
  Match.when(Match.date, (date) => {
    if (isNaN(date.getTime())) {
      return "Invalid date"
    }
    return `Date: ${date.toISOString().split("T")[0]}`
  }),
  Match.when(Match.string, (str) => `Date string: ${str}`),
  Match.orElse(() => "Not a date-related value")
)

processDateValue(new Date("2024-01-01")) // => "Date: 2024-01-01"
processDateValue(new Date("invalid")) // => "Invalid date"
processDateValue("2024-01-01") // => "Date string: 2024-01-01"
processDateValue(1704067200000) // => "Not a date-related value"
```

## record

**Matching record objects**

```efx
import { Match } from "effect"

const analyzeValue = Match.type<unknown>().pipe(
  Match.when(Match.record, (obj) => {
    const keys = Object.keys(obj)
    const valueCount = keys.length
    return `Object with ${valueCount} properties: [${keys.join(", ")}]`
  }),
  Match.when(
    Match.instanceOf(Array),
    (arr) => `Array with ${arr.length} items`
  ),
  Match.orElse(() => "Not an object")
)

analyzeValue({ name: "Alice", age: 30 }) // => "Object with 2 properties: [name, age]"
analyzeValue([1, 2, 3]) // => "Array with 3 items"
analyzeValue(null) // => "Not an object"
analyzeValue("hello") // => "Not an object"
```

## instanceOf

**Matching class instances**

```efx
import { Match } from "effect"

class CustomError extends Error {
  constructor(message: string, public code: number) {
    super(message)
  }
}

const handleValue = Match.type<unknown>()
  .pipe(
    Match.when(
      Match.instanceOf(CustomError),
      (err) => `Custom error: ${err.message} (code: ${err.code})`
    ),
    Match.when(
      Match.instanceOf(Error),
      (err) => `Standard error: ${err.message}`
    ),
    Match.when(
      Match.instanceOf(Array),
      (arr) => `Array with ${arr.length} items`
    ),
    Match.when(
      Match.instanceOf(Map),
      (map) => `Map with ${map.size} entries`
    ),
    Match.orElse((value) => `Other: ${typeof value}`)
  )

handleValue(new CustomError("Failed", 404)) // => "Custom error: Failed (code: 404)"
handleValue(new Error("Generic error")) // => "Standard error: Generic error"
handleValue([1, 2, 3]) // => "Array with 3 items"
handleValue(new Map([["count", 1]])) // => "Map with 1 entries"
```

## instanceOfUnsafe

**Matching class instances unsafely**

```efx
import { Match } from "effect"

class CustomError extends Error {
  constructor(message: string, public code: number) {
    super(message)
  }
}

// When you need to match instances but handle type narrowing manually
const handleError = Match.type<unknown>().pipe(
  Match.when(Match.instanceOfUnsafe(CustomError), (err: any) => {
    // Manual type assertion needed
    const customErr = err as CustomError
    return `Custom error ${customErr.code}: ${customErr.message}`
  }),
  Match.orElse(() => "Not a CustomError")
)
handleError(new CustomError("failed", 500)) // => "Custom error 500: failed"
```

## orElse

**Providing a default value when no patterns match**

```efx
import { Match } from "effect"

// Create a matcher for string or number values
const match = Match.type<string | number>().pipe(
  // Match when the value is "a"
  Match.when("a", () => "ok"),
  // Fallback when no patterns match
  Match.orElse(() => "fallback")
)

match("a") // => "ok"

match("b") // => "fallback"
```

## orElseAbsurd

**Throwing on unmatched input**

```efx
import { Match } from "effect"

const strictMatcher = Match.type<"a" | "b">().pipe(
  Match.when("a", () => "Found A"),
  Match.when("b", () => "Found B"),
  // Will throw if input is neither "a" nor "b"
  Match.orElseAbsurd
)

strictMatcher("a") // => "Found A"
strictMatcher("b") // => "Found B"

// This would throw an error at runtime:
// strictMatcher("c" as any) // throws
```

## result

**Extracting a user role with `Match.result`**

```efx
import { Match } from "effect"

type User = { readonly role: "admin" | "editor" | "viewer" }

// Create a matcher to extract user roles
const getRole = Match.type<User>().pipe(
  Match.when({ role: "admin" }, () => "Has full access"),
  Match.when({ role: "editor" }, () => "Can edit content"),
  Match.result // Wrap the result in an Result
)

getRole({ role: "admin" })._tag // => "Success"

getRole({ role: "viewer" })._tag // => "Failure"
```

## option

**Extracting a user role with `Match.option`**

```efx
import { Match } from "effect"

type User = { readonly role: "admin" | "editor" | "viewer" }

// Create a matcher to extract user roles
const getRole = Match.type<User>().pipe(
  Match.when({ role: "admin" }, () => "Has full access"),
  Match.when({ role: "editor" }, () => "Can edit content"),
  Match.option // Wrap the result in an Option
)

getRole({ role: "admin" })._tag // => "Some"

getRole({ role: "viewer" })._tag // => "None"
```

## exhaustive

**Ensuring all cases are covered**

```efx
import { Match } from "effect"

// Create a matcher for string or number values
const match = Match.type<string | number>().pipe(
  // Match when the value is a number
  Match.when(Match.number, (n) => `number: ${n}`),
  // Mark the match as exhaustive, ensuring all cases are handled
  // TypeScript will throw an error if any case is missing
  // @ts-expect-error Type 'string' is not assignable to type 'never'
  Match.exhaustive
)
```

## SafeRefinement

**Using safe refinements**

```efx
import { Match } from "effect"

// Built-in safe refinements
const processValue = Match.type<unknown>().pipe(
  Match.when(Match.string, (s) => s.toUpperCase()),
  Match.when(Match.number, (n) => n * 2),
  Match.when(Match.defined, (value) => `Defined: ${value}`),
  Match.orElse(() => "Undefined or null")
)

processValue("hello") // => "HELLO"
processValue(21) // => 42
processValue(true) // => "Defined: true"
processValue(null) // => "Undefined or null"
```

## Types.WhenMatch

**Computing matched types**

```efx
import type { Match } from "effect"

// WhenMatch computes the narrowed type after pattern matching
type StringMatch = Match.Types.WhenMatch<string | number, typeof Match.string>
// Result: string

type ObjectMatch = Match.Types.WhenMatch<
  { type: "user"; name: string } | {
    type: "admin"
    permissions: Array<string>
  },
  { type: "user" }
>
// Result: { type: "user"; name: string }
```

## Types.NotMatch

**Computing unmatched types**

```efx
import type { Match } from "effect"

// NotMatch computes what remains after exclusion
type NotString = Match.Types.NotMatch<
  string | number | boolean,
  typeof Match.string
>
// Result: number | boolean

type NotSpecificValue = Match.Types.NotMatch<"a" | "b" | "c", "a">
// Result: "b" | "c"
```

## Types.PForMatch

**Resolving match patterns**

```efx
import type { Match } from "effect"

// PForMatch resolves patterns to their matched types
type StringPattern = Match.Types.PForMatch<typeof Match.string>
// Result: string

type ObjectPattern = Match.Types.PForMatch<{ name: string }>
// Result: { name: string }
```

## Types.PForExclude

**Computing excluded patterns**

```efx
import type { Match } from "effect"

// PForExclude computes what to exclude from type operations
type ExcludeString = Match.Types.PForExclude<typeof Match.string>
// Used internally to filter out string types

type ExcludeObject = Match.Types.PForExclude<{ type: "admin" }>
// Used internally to filter out admin objects
```

## Types.PatternBase

**Describing complex object patterns**

```efx
import { Match } from "effect"

// PatternBase enables complex object patterns
type UserPattern = Match.Types.PatternBase<{
  name: string
  age: number
  role: "admin" | "user"
}>
// Allows: { name?: string | Predicate, age?: number | Predicate, ... }

// Example usage:
const result = Match.value({ name: "Alice", age: 30, role: "admin" as const }).pipe(
  Match.when(
    { age: (n: number) => n >= 18, role: "admin" },
    (user: { name: string; age: number; role: "admin" }) =>
      `Admin: ${user.name}`
  ),
  Match.orElse(() => "Not an adult admin")
)
result // => "Admin: Alice"
```

## Types.Without

**Tracking excluded types**

```efx
import { Match } from "effect"

// Without is used internally when you write:
const match = Match.type<string | number | boolean>().pipe(
  Match.not(Match.string, (value) => `not string: ${value}`),
  // At this point, type system uses Without<string> to track exclusion
  Match.orElse(() => "was a string")
)
match(42) // => "not string: 42"
```

## Types.Only

**Tracking included types**

```efx
import { Match } from "effect"

// Only is used internally when you write:
const match = Match.type<string | number | boolean>().pipe(
  Match.when(Match.string, (s) => `string: ${s}`),
  // At this point, type system uses Only<string> for the match
  Match.orElse((value) => `not string: ${value}`)
)
match("ok") // => "string: ok"
```

## Types.AddWithout

**Accumulating excluded types**

```efx
import { Match } from "effect"

// AddWithout is used when combining multiple exclusions:
const match = Match.type<string | number | boolean | null>().pipe(
  Match.not(Match.string, () => "not string"),
  Match.not(Match.number, () => "not number"),
  // Type system uses AddWithout to combine exclusions
  Match.orElse(() => "was string or number")
)
match(true) // => "not string"
```

## Types.AddOnly

**Refining included types**

```efx
import { Match } from "effect"

// AddOnly is used when refining positive matches:
const match = Match.type<{ type: "user" | "admin"; name: string }>().pipe(
  Match.when({ type: "admin" }, (admin) => admin.name),
  // Type system uses AddOnly to refine the constraint
  Match.orElse(() => "not admin")
)
match({ type: "admin", name: "Alice" }) // => "Alice"
```

## Types.ApplyFilters

**Applying accumulated filters**

```efx
import type { Match } from "effect"

// ApplyFilters computes the final narrowed type:
type Result = Match.Types.ApplyFilters<
  string | number | boolean,
  Match.Types.Only<string>
>
// Result: string

type ExclusionResult = Match.Types.ApplyFilters<
  string | number | boolean,
  Match.Types.Without<string>
>
// Result: number | boolean
```

## Types.Tags

**Extracting discriminator tags**

```efx
import type { Match } from "effect"

type Events =
  | { _tag: "click"; x: number; y: number }
  | { _tag: "keypress"; key: string }
  | { _tag: "scroll"; delta: number }

type EventTags = Match.Types.Tags<"_tag", Events>
// Result: "click" | "keypress" | "scroll"

type CustomTags = Match.Types.Tags<
  "type",
  | { type: "user"; name: string }
  | { type: "admin"; permissions: Array<string> }
>
// Result: "user" | "admin"
```

## Types.ArrayToIntersection

**Converting arrays to intersections**

```efx
import type { Match } from "effect"

type Combined = Match.Types.ArrayToIntersection<[
  { name: string },
  { age: number },
  { active: boolean }
]>
// Result: { name: string } & { age: number } & { active: boolean }
//         = { name: string; age: number; active: boolean }

// This type utility enables complex type intersections
// Complex type operations are handled by this utility type
// for advanced pattern matching scenarios
```

## Types.ExtractMatch

**Extracting matched types**

```efx
import { Match } from "effect"

type StringExtract = Match.Types.ExtractMatch<
  string | number | boolean,
  typeof Match.string
>
// Result: string

type ObjectExtract = Match.Types.ExtractMatch<
  { type: "user"; name: string } | { type: "admin"; role: string },
  { type: "user" }
>
// Result: { type: "user"; name: string }

// This powers the type narrowing in:
Match.when(Match.string, (s) => s.toUpperCase())
//                      ^^^ s is correctly typed as string
```
