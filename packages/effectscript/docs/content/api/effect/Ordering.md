# effect/Ordering

The examples in the JSDoc of `packages/effect/src/Ordering.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Ordering

**Defining comparison results**

```efx
import type { Ordering } from "effect"

// Custom comparison function
const compareNumbers = (a: number, b: number): Ordering.Ordering => {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

compareNumbers(5, 10) // => -1
compareNumbers(10, 5) // => 1
compareNumbers(5, 5) // => 0

// Using with string comparison
const compareStrings = (a: string, b: string): Ordering.Ordering => {
  return a.localeCompare(b) as Ordering.Ordering
}
```

## reverse

**Reversing comparison order**

```efx
import { Ordering } from "effect"

// Basic reversal
Ordering.reverse(1) // => -1
Ordering.reverse(-1) // => 1
Ordering.reverse(0) // => 0

// Creating descending sort from ascending comparison
const compareNumbers = (a: number, b: number): Ordering.Ordering =>
  a < b ? -1 : a > b ? 1 : 0

const compareDescending = (a: number, b: number): Ordering.Ordering =>
  Ordering.reverse(compareNumbers(a, b))

const numbers = [3, 1, 4, 1, 5]
numbers.sort(compareNumbers) // [1, 1, 3, 4, 5] (ascending)
numbers.sort(compareDescending) // [5, 4, 3, 1, 1] (descending)

// Useful for toggling sort direction
const createSorter = (ascending: boolean) => (a: number, b: number) => {
  const ordering = compareNumbers(a, b)
  return ascending ? ordering : Ordering.reverse(ordering)
}
```

## match

**Pattern matching on orderings**

```efx
import { Function, Ordering } from "effect"

const toMessage = Ordering.match({
  onLessThan: Function.constant("less than"),
  onEqual: Function.constant("equal"),
  onGreaterThan: Function.constant("greater than")
})

toMessage(-1) // => "less than"
toMessage(0) // => "equal"
toMessage(1) // => "greater than"
```
