# effect/Types

The examples in the JSDoc of `packages/effect/src/Types.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## TupleOf

**Checking fixed-length tuples**

```efx
import type { Types } from "effect"

// Exactly 3 numbers
const triple: Types.TupleOf<3, number> = [1, 2, 3]

// @ts-expect-error - too few elements
const tooFew: Types.TupleOf<3, number> = [1, 2]

// @ts-expect-error - too many elements
const tooMany: Types.TupleOf<3, number> = [1, 2, 3, 4]
```

## TupleOfAtLeast

**Checking minimum-length tuples**

```efx
import type { Types } from "effect"

// At least 2 strings
const ok1: Types.TupleOfAtLeast<2, string> = ["a", "b"]
const ok2: Types.TupleOfAtLeast<2, string> = ["a", "b", "c", "d"]

// @ts-expect-error - too few elements
const bad: Types.TupleOfAtLeast<2, string> = ["a"]
```

## Tags

**Extracting tags**

```efx
import type { Types } from "effect"

type MyError =
  | { readonly _tag: "NotFound"; readonly id: string }
  | { readonly _tag: "Timeout"; readonly ms: number }
  | string

type Result = Types.Tags<MyError>
// "NotFound" | "Timeout"

const witness: Result = "NotFound"
```

## ExcludeTag

**Removing a variant**

```efx
import type { Types } from "effect"

type MyError =
  | { readonly _tag: "NotFound"; readonly id: string }
  | { readonly _tag: "Timeout"; readonly ms: number }
  | string

type WithoutTimeout = Types.ExcludeTag<MyError, "Timeout">
// { readonly _tag: "NotFound"; readonly id: string } | string

const witness: WithoutTimeout = { _tag: "NotFound", id: "1" }
```

## ExtractTag

**Extracting a variant**

```efx
import type { Types } from "effect"

type MyError =
  | { readonly _tag: "NotFound"; readonly id: string }
  | { readonly _tag: "Timeout"; readonly ms: number }

type TimeoutError = Types.ExtractTag<MyError, "Timeout">
// { readonly _tag: "Timeout"; readonly ms: number }

const witness: TimeoutError = { _tag: "Timeout", ms: 100 }
```

## UnionToIntersection

**Converting a union to an intersection**

```efx
import type { Types } from "effect"

type Union = { a: string } | { b: number }
type Result = Types.UnionToIntersection<Union>
// { a: string } & { b: number }

const witness: Result = { a: "value", b: 1 }
```

## Simplify

**Simplifying an intersection**

```efx
import type { Types } from "effect"

// Without Simplify: IDE shows { a: number } & { b: string }
// With Simplify: IDE shows { a: number; b: string }
type Clean = Types.Simplify<{ a: number } & { b: string }>

const witness: Clean = { a: 1, b: "value" }
```

## Equals

**Checking type equality**

```efx
import type { Types } from "effect"

type Yes = Types.Equals<{ a: number }, { a: number }> // true
type No = Types.Equals<{ a: number }, { a: string }> // false
type AnyCheck = Types.Equals<any, string> // false
```

## EqualsWith

**Choosing a conditional type based on equality**

```efx
import type { Types } from "effect"

type R1 = Types.EqualsWith<string, string, "same", "diff"> // "same"
type R2 = Types.EqualsWith<string, number, "same", "diff"> // "diff"
```

## Has

**Checking key presence**

```efx
import type { Types } from "effect"

type Yes = Types.Has<{ a: number; b: string }, "a" | "c"> // true
type No = Types.Has<{ a: number }, "b" | "c"> // false
```

## MergeLeft

**Merging with left bias**

```efx
import type { Types } from "effect"

type Result = Types.MergeLeft<
  { a: number; b: number },
  { a: string; c: boolean }
>
// { a: number; b: number; c: boolean }

const witness: Result = { a: 1, b: 2, c: true }
```

## MergeRight

**Right-biased merge**

```efx
import type { Types } from "effect"

type Result = Types.MergeRight<
  { a: number; b: number },
  { a: string; c: boolean }
>
// { a: string; b: number; c: boolean }

const witness: Result = { a: "value", b: 2, c: true }
```

## Concurrency

**Setting concurrency values**

```efx
import type { Types } from "effect"

const sequential: Types.Concurrency = 1
const limited: Types.Concurrency = 5
const unbounded: Types.Concurrency = "unbounded"
```

## Mutable

**Converting shallowly to mutable types**

```efx
import type { Types } from "effect"

type Obj = Types.Mutable<{
  readonly a: string
  readonly b: ReadonlyArray<number>
}>
// { a: string; b: ReadonlyArray<number> }
//   ^ mutable    ^ still readonly inside

type Arr = Types.Mutable<ReadonlyArray<string>>
// string[]

type Tup = Types.Mutable<readonly [string, number]>
// [string, number]

const tuple: Tup = ["value", 1]
tuple[1] = 2
```

## DeepMutable

**Converting deeply to mutable types**

```efx
import { DateTime, type Types } from "effect"

type Deep = Types.DeepMutable<{
  readonly a: string
  readonly b: ReadonlyArray<{ readonly c: number }>
  readonly createdAt: DateTime.DateTime
}>
// { a: string; b: Array<{ c: number }>; createdAt: DateTime.DateTime }

const witness: Deep = {
  a: "value",
  b: [{ c: 1 }],
  createdAt: DateTime.makeUnsafe(0)
}
witness.b[0].c = 2
```

## NoInfer

**Controlling inference**

```efx
import type { Types } from "effect"

function withDefault<T>(value: T, _fallback: Types.NoInfer<T>): T {
  return value
}

// T is inferred as "a" | "b" from the first argument only
const result = withDefault<"a" | "b">("a", "b")
```

## Invariant

**Defining an invariant phantom type**

```efx
import type { Types } from "effect"

interface Container<T> {
  readonly _phantom: Types.Invariant<T>
  readonly value: T
}

const container: Container<number> = { _phantom: (value) => value, value: 1 }
```

## Invariant.Type

**Extracting the inner type**

```efx
import type { Types } from "effect"

type Inner = Types.Invariant.Type<Types.Invariant<number>>
// number

const witness: Inner = 1
```

## Covariant

**Defining a covariant phantom type**

```efx
import type { Types } from "effect"

interface Producer<T> {
  readonly _phantom: Types.Covariant<T>
  readonly get: () => T
}

const producer: Producer<string> = { _phantom: () => "value", get: () => "value" }
```

## Covariant.Type

**Extracting the inner type**

```efx
import type { Types } from "effect"

type Inner = Types.Covariant.Type<Types.Covariant<string>>
// string

const witness: Inner = "value"
```

## Contravariant

**Defining a contravariant phantom type**

```efx
import type { Types } from "effect"

interface Consumer<T> {
  readonly _phantom: Types.Contravariant<T>
  readonly accept: (value: T) => void
}

const consumer: Consumer<string> = {
  _phantom: () => {},
  accept: (_value) => {}
}
```

## Contravariant.Type

**Extracting the inner type**

```efx
import type { Types } from "effect"

type Inner = Types.Contravariant.Type<Types.Contravariant<string>>
// string

const witness: Inner = "value"
```

## NotFunction

**Filtering out functions**

```efx
import type { Types } from "effect"

type Result = Types.NotFunction<string | (() => void) | number>
// string | number

const witness: Result = "value"
```

## NoExcessProperties

**Preventing extra properties**

```efx
import type { Types } from "effect"

type Expected = { a: number; b: string }
type Input = { a: number; b: string; c: boolean }

type Result = Types.NoExcessProperties<Expected, Input>
// { a: number; b: string; readonly c: never }

const accepted: Types.NoExcessProperties<Expected, Expected> = { a: 1, b: "value" }
```

## IsUnion

**Detecting union types**

```efx
import type { Types } from "effect"

type Yes = Types.IsUnion<"a" | "b"> // true
type No = Types.IsUnion<string> // false
```

## ReasonOf

**Extracting reason types**

```efx
import type { Types } from "effect"

type RateLimitError = { readonly _tag: "RateLimitError"; readonly retryAfter: number }
type QuotaError = { readonly _tag: "QuotaError"; readonly limit: number }
type ApiError = { readonly _tag: "ApiError"; readonly reason: RateLimitError | QuotaError }

type Reasons = Types.ReasonOf<ApiError>
// RateLimitError | QuotaError

const witness: Reasons = { _tag: "QuotaError", limit: 10 }
```

## ReasonTags

**Getting reason tags**

```efx
import type { Types } from "effect"

type RateLimitError = { readonly _tag: "RateLimitError"; readonly retryAfter: number }
type QuotaError = { readonly _tag: "QuotaError"; readonly limit: number }
type ApiError = { readonly _tag: "ApiError"; readonly reason: RateLimitError | QuotaError }

type Result = Types.ReasonTags<ApiError>
// "RateLimitError" | "QuotaError"

const witness: Result = "RateLimitError"
```

## ExtractReason

**Extracting a reason variant**

```efx
import type { Types } from "effect"

type RateLimitError = { readonly _tag: "RateLimitError"; readonly retryAfter: number }
type QuotaError = { readonly _tag: "QuotaError"; readonly limit: number }
type ApiError = { readonly _tag: "ApiError"; readonly reason: RateLimitError | QuotaError }

type Result = Types.ExtractReason<ApiError, "RateLimitError">
// { readonly _tag: "RateLimitError"; readonly retryAfter: number }

const witness: Result = { _tag: "RateLimitError", retryAfter: 30 }
```

## NarrowReason

**Narrowing a reason variant**

```efx
import type { Types } from "effect"

type RateLimitError = { readonly _tag: "RateLimitError"; readonly retryAfter: number }
type QuotaError = { readonly _tag: "QuotaError"; readonly limit: number }
type ApiError = { readonly _tag: "ApiError"; readonly reason: RateLimitError | QuotaError }

type Result = Types.NarrowReason<ApiError, "RateLimitError">
// ApiError & { readonly reason: { readonly _tag: "RateLimitError"; readonly retryAfter: number } }

const witness: Result = {
  _tag: "ApiError",
  reason: { _tag: "RateLimitError", retryAfter: 30 }
}
```

## OmitReason

**Omitting a reason variant**

```efx
import type { Types } from "effect"

type RateLimitError = { readonly _tag: "RateLimitError"; readonly retryAfter: number }
type QuotaError = { readonly _tag: "QuotaError"; readonly limit: number }
type ApiError = { readonly _tag: "ApiError"; readonly reason: RateLimitError | QuotaError }

type Result = Types.OmitReason<ApiError, "RateLimitError">
// ApiError & { readonly reason: { readonly _tag: "QuotaError"; readonly limit: number } }

const witness: Result = {
  _tag: "ApiError",
  reason: { _tag: "QuotaError", limit: 10 }
}
```

## ExcludeReason

**Excluding a reason variant**

```efx
import type { Types } from "effect"

type RateLimitError = { readonly _tag: "RateLimitError"; readonly retryAfter: number }
type QuotaError = { readonly _tag: "QuotaError"; readonly limit: number }
type ApiError = { readonly _tag: "ApiError"; readonly reason: RateLimitError | QuotaError }

type Result = Types.ExcludeReason<ApiError, "RateLimitError">
// { readonly _tag: "QuotaError"; readonly limit: number }

const witness: Result = { _tag: "QuotaError", limit: 10 }
```
