# effect/Filter

The examples in the JSDoc of `packages/effect/src/Filter.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Filter

**Defining a positive number filter**

```efx
import { Filter, Result } from "effect"

// A filter that only passes positive numbers
const positiveFilter: Filter.Filter<number> = (n) => n > 0 ? Result.succeed(n) : Result.fail(n)

positiveFilter(5) // => Result.succeed(5)
positiveFilter(-3) // => Result.fail(-3)
```

## FilterEffect

**Defining an effectful user filter**

```efx

// An effectful filter that validates user data
type User = { id: string; isActive: boolean }
type ValidationError = { message: string }

const validateUser: Filter.FilterEffect<
  string,
  User,
  User,
  ValidationError,
  never
> = (id) =>
  effect {
    const user: User = { id, isActive: id.length > 0 }
    return user.isActive ? Result.succeed(user) : Result.fail(user)
  }

await runPromise(validateUser("alice")) // => Result.succeed({ id: "alice", isActive: true })
await runPromise(validateUser("")) // => Result.fail({ id: "", isActive: false })
```

## make

**Creating custom filters**

```efx
import { Filter, Result } from "effect"

// Create a filter for positive numbers
const positiveFilter = Filter.make((n: number) => n > 0 ? Result.succeed(n) : Result.fail(n))

// Create a filter that transforms strings to uppercase
const uppercaseFilter = Filter.make((s: string) =>
  s.length > 0 ? Result.succeed(s.toUpperCase()) : Result.fail(s)
)
positiveFilter(1) // => Result.succeed(1)
uppercaseFilter("ok") // => Result.succeed("OK")
```

## makeEffect

**Creating effectful filters**

```efx

// Create an effectful filter that validates async
const asyncValidate = Filter.makeEffect((id: string) =>
  effect {
    const isValid = await succeed(id.length > 0)
    return isValid ? Result.succeed(id) : Result.fail(id)
  }
)

await runPromise(asyncValidate("id")) // => Result.succeed("id")
```

## fromPredicate

**Creating filters from predicates**

```efx
import { Filter, Result } from "effect"

// Create filter from predicate
const positiveNumbers = Filter.fromPredicate((n: number) => n > 0)
const nonEmptyStrings = Filter.fromPredicate((s: string) => s.length > 0)

// Type refinement
const isString = Filter.fromPredicate((x: unknown): x is string =>
  typeof x === "string"
)
positiveNumbers(1) // => Result.succeed(1)
nonEmptyStrings("") // => Result.fail("")
isString("ok") // => Result.succeed("ok")
```

## string

**Filtering strings**

```efx
import { Filter, Result } from "effect"

Filter.string("hello") // => Result.succeed("hello")
Filter.string(42) // => Result.fail(42)
```

## number

**Filtering numbers**

```efx
import { Filter, Result } from "effect"

Filter.number(42) // => Result.succeed(42)
Filter.number("42") // => Result.fail("42")
```

## zip

**Zipping filters**

```efx
import { Filter, Result } from "effect"

const positiveNumbers = Filter.fromPredicate((n: number) => n > 0)
const evenNumbers = Filter.fromPredicate((n: number) => n % 2 === 0)

const positiveAndEven = Filter.zip(positiveNumbers, evenNumbers)
positiveAndEven(2) // => Result.succeed([2, 2])
```

## andLeft

**Keeping the left filter result**

```efx
import { Filter, Result } from "effect"

const positiveNumbers = Filter.fromPredicate((n: number) => n > 0)
const evenNumbers = Filter.fromPredicate((n: number) => n % 2 === 0)

const positiveEven = Filter.andLeft(positiveNumbers, evenNumbers)
positiveEven(2) // => Result.succeed(2)
```

## andRight

**Keeping the right filter result**

```efx
import { Filter, Result } from "effect"

const positiveNumbers = Filter.fromPredicate((n: number) => n > 0)
const doubleNumbers = Filter.make((n: number) =>
  n > 0 ? Result.succeed(n * 2) : Result.fail(n)
)

const positiveDoubled = Filter.andRight(positiveNumbers, doubleNumbers)
positiveDoubled(2) // => Result.succeed(4)
```

## compose

**Composing filters**

```efx
import { Filter, Result } from "effect"

const stringFilter = Filter.string
const nonEmptyUpper = Filter.make((s: string) =>
  s.length > 0 ? Result.succeed(s.toUpperCase()) : Result.fail(s)
)

const stringToUpper = Filter.compose(stringFilter, nonEmptyUpper)
stringToUpper("hello") // => Result.succeed("HELLO")
```
