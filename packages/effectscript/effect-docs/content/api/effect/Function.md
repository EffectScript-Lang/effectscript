# effect/Function

The examples in the JSDoc of `packages/effect/src/Function.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## FunctionTypeLambda

**Creating a function type with a type lambda**

```efx
import type { Function, HKT } from "effect"

// Create a function type using the type lambda
type StringToNumber = HKT.Kind<Function.FunctionTypeLambda, string, never, never, number>
// Equivalent to: (a: string) => number
```

## dual

**Selecting data-first or data-last style by arity**

```efx
import { Function } from "effect"

const sum = Function.dual<
  (that: number) => (self: number) => number,
  (self: number, that: number) => number
>(2, (self, that) => self + that)

sum(2, 3) // => 5
2 |> sum(3) // => 5
```

**Defining overloads with call signatures**

```efx
import { Function } from "effect"

const sum: {
  (that: number): (self: number) => number
  (self: number, that: number): number
} = Function.dual(2, (self: number, that: number): number => self + that)

sum(2, 3) // => 5
2 |> sum(3) // => 5
```

**Selecting data-first or data-last style with a predicate**

```efx
import { Function } from "effect"

const sum = Function.dual<
  (that: number) => (self: number) => number,
  (self: number, that: number) => number
>(
  (args) => args.length === 2,
  (self, that) => self + that
)

sum(2, 3) // => 5
2 |> sum(3) // => 5
```

## apply

**Applying an argument to a function**

```efx
import { Function, pipe, String } from "effect"

String.length |> Function.apply("hello") // => 5
```

## LazyArg

**Creating a lazy argument**

```efx
import { Function } from "effect"

const constNull: Function.LazyArg<null> = Function.constant(null)
constNull() // => null
```

## FunctionN

**Typing a variadic function**

```efx
import type { Function } from "effect"

const sum: Function.FunctionN<[number, number], number> = (a, b) => a + b
sum(2, 3) // => 5
```

## identity

**Returning the same value**

```efx
import { identity } from "effect"

identity(5) // => 5
```

## satisfies

**Checking an expression against a type**

```efx
import { Function } from "effect"

const test1 = Function.satisfies<number>()(5 as const) // => 5
// ^? const test: 5
// @ts-expect-error
const test2 = Function.satisfies<string>()(5)
// ^? Argument of type 'number' is not assignable to parameter of type 'string'
```

## constant

**Creating a constant thunk**

```efx
import { Function } from "effect"

const constNull = Function.constant(null)

constNull() // => null
constNull() // => null
```

## constTrue

**Returning true from a thunk**

```efx
import { Function } from "effect"

Function.constTrue() // => true
```

## constFalse

**Returning false from a thunk**

```efx
import { Function } from "effect"

Function.constFalse() // => false
```

## constNull

**Returning null from a thunk**

```efx
import { Function } from "effect"

Function.constNull() // => null
```

## constUndefined

**Returning undefined from a thunk**

```efx
import { Function } from "effect"

Function.constUndefined() // => undefined
```

## constVoid

**Returning void from a thunk**

```efx
import { Function } from "effect"

Function.constVoid() // => undefined
```

## flip

**Flipping curried arguments**

```efx
import { Function } from "effect"

const f = (a: number) => (b: string) => a - b.length

Function.flip(f)("aaa")(2) // => -1
```

## compose

**Composing two functions**

```efx
import { Function } from "effect"

const increment = (n: number) => n + 1
const square = (n: number) => n * n

Function.compose(increment, square)(2) // => 9
```

## absurd

**Handling impossible values**

```efx
import { absurd } from "effect"

const handleNever = (value: never) => {
  return absurd(value) // This will throw an error if called
}
```

## tupled

**Converting arguments to a tuple**

```efx
import { Function } from "effect"

const sumTupled = Function.tupled((x: number, y: number): number => x + y)

sumTupled([1, 2]) // => 3
```

## untupled

**Converting a tuple to arguments**

```efx
import { Function } from "effect"

const getFirst = Function.untupled(<A, B>(tuple: [A, B]): A => tuple[0])

getFirst(1, 2) // => 1
```

## pipe

**Piping values through functions**

```efx
import { pipe } from "effect"

pipe(
  1,
  (n) => n + 1,
  (n) => n * 2,
  (n) => `result: ${n}`
) // => "result: 4"
```

**Rewriting method chains with pipe**

```efx
import { Array } from "effect"

const numbers = [1, 2, 3, 4]
const double = (n: number) => n * 2
const greaterThanFour = (n: number) => n > 4

numbers
  |> Array.map(double)
  |> Array.filter(greaterThanFour) // => [6, 8]
```

## flow

**Composing functions left to right**

```efx
import { flow } from "effect"

const len = (s: string): number => s.length
const double = (n: number): number => n * 2

const f = flow(len, double)

f("aaa") // => 6
```

## hole

**Creating a development placeholder**

```efx
import { hole } from "effect"

// Intentionally not called: `hole` throws if the placeholder is evaluated.
const buildUser = (id: number): { readonly id: number; readonly name: string } => ({
  id,
  name: hole<string>()
})

```

## SK

**Discarding the first argument**

```efx
import { Function } from "effect"

Function.SK(0, "hello") // => "hello"
```
