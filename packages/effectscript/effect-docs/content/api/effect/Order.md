# effect/Order

The examples in the JSDoc of `packages/effect/src/Order.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Order

**Defining a custom Order**

```efx
import { Order } from "effect"

const byAge: Order.Order<{ name: string; age: number }> = (self, that) => {
  if (self.age < that.age) return -1
  if (self.age > that.age) return 1
  return 0
}

const person1 = { name: "Alice", age: 30 }
const person2 = { name: "Bob", age: 25 }
byAge(person1, person2) // => 1
```

## make

**Creating an Order**

```efx
import { Order } from "effect"

const byAge = Order.make<{ name: string; age: number }>((self, that) => {
  if (self.age < that.age) return -1
  if (self.age > that.age) return 1
  return 0
})

byAge({ name: "Alice", age: 30 }, { name: "Bob", age: 25 }) // => 1
byAge({ name: "Alice", age: 25 }, { name: "Bob", age: 30 }) // => -1
```

## String

**Ordering strings**

```efx
import { Order } from "effect"

Order.String("apple", "banana") // => -1
Order.String("banana", "apple") // => 1
Order.String("apple", "apple") // => 0
```

## Number

**Ordering numbers**

```efx
import { Order } from "effect"

Order.Number(1, 1) // => 0
Order.Number(1, 2) // => -1
Order.Number(2, 1) // => 1

Order.Number(0, -0) // => 0
Order.Number(NaN, 1) // => -1
```

## Boolean

**Ordering booleans**

```efx
import { Order } from "effect"

Order.Boolean(false, true) // => -1
Order.Boolean(true, false) // => 1
Order.Boolean(true, true) // => 0
```

## BigInt

**Ordering BigInts**

```efx
import { Order } from "effect"

Order.BigInt(1n, 2n) // => -1
Order.BigInt(2n, 1n) // => 1
Order.BigInt(1n, 1n) // => 0
```

## flip

**Reversing an Order**

```efx
import { Order } from "effect"

const flip = Order.flip(Order.Number)

flip(1, 2) // => 1
flip(2, 1) // => -1
flip(1, 1) // => 0
```

## combine

**Combining two Orders**

```efx
import { Order } from "effect"

const byAge = Order.mapInput(
  Order.Number,
  (person: { name: string; age: number }) => person.age
)
const byName = Order.mapInput(
  Order.String,
  (person: { name: string; age: number }) => person.name
)
const byAgeAndName = Order.combine(byAge, byName)

const person1 = { name: "Alice", age: 30 }
const person2 = { name: "Bob", age: 30 }
const person3 = { name: "Charlie", age: 25 }

byAgeAndName(person1, person2) // => -1
byAgeAndName(person1, person3) // => 1
```

## alwaysEqual

**Ordering with an always-equal Order**

```efx
import { Order } from "effect"

const alwaysEqualOrder = Order.alwaysEqual<number>()

alwaysEqualOrder(1, 2) // => 0
alwaysEqualOrder(2, 1) // => 0
alwaysEqualOrder(1, 1) // => 0
```

## combineAll

**Combining multiple Orders**

```efx
import { Order } from "effect"

const byAge = Order.mapInput(
  Order.Number,
  (person: { name: string; age: number }) => person.age
)
const byName = Order.mapInput(
  Order.String,
  (person: { name: string; age: number }) => person.name
)

const combinedOrder = Order.combineAll([byAge, byName])

const person1 = { name: "Alice", age: 30 }
const person2 = { name: "Bob", age: 30 }

combinedOrder(person1, person2) // => -1
```

## mapInput

**Mapping Input**

```efx
import { Order } from "effect"

const byLength = Order.mapInput(Order.Number, (s: string) => s.length)

byLength("a", "bb") // => -1
byLength("bb", "a") // => 1
byLength("aa", "bb") // => 0
```

## Date

**Ordering Dates**

```efx
import { Order } from "effect"

const date1 = new Date("2023-01-01")
const date2 = new Date("2023-01-02")

Order.Date(date1, date2) // => -1
Order.Date(date2, date1) // => 1
Order.Date(date1, date1) // => 0
```

## Tuple

**Ordering tuples**

```efx
import { Order } from "effect"

const tupleOrder = Order.Tuple([Order.Number, Order.String])

tupleOrder([1, "a"], [2, "b"]) // => -1
tupleOrder([1, "b"], [1, "a"]) // => 1
tupleOrder([1, "a"], [1, "a"]) // => 0
```

## Array

**Ordering array elements**

```efx
import { Order } from "effect"

const arrayOrder = Order.Array(Order.Number)

arrayOrder([1, 2], [1, 3]) // => -1
arrayOrder([1, 2], [1, 2, 3]) // => -1
arrayOrder([1, 2, 3], [1, 2]) // => 1
arrayOrder([1, 2], [1, 2]) // => 0
```

## Struct

**Ordering structs**

```efx
import { Order } from "effect"

const personOrder = Order.Struct({
  name: Order.String,
  age: Order.Number
})

const person1 = { name: "Alice", age: 30 }
const person2 = { name: "Bob", age: 25 }
const person3 = { name: "Alice", age: 25 }

personOrder(person1, person2) // => -1
personOrder(person1, person3) // => 1
personOrder(person1, person1) // => 0
```

## isLessThan

**Checking less-than comparisons**

```efx
import { Order } from "effect"

const isLessThanNumber = Order.isLessThan(Order.Number)

isLessThanNumber(1, 2) // => true
isLessThanNumber(2, 1) // => false
isLessThanNumber(1, 1) // => false
```

## isGreaterThan

**Checking greater-than comparisons**

```efx
import { Order } from "effect"

const isGreaterThanNumber = Order.isGreaterThan(Order.Number)

isGreaterThanNumber(2, 1) // => true
isGreaterThanNumber(1, 2) // => false
isGreaterThanNumber(1, 1) // => false
```

## isLessThanOrEqualTo

**Checking less-than-or-equal comparisons**

```efx
import { Order } from "effect"

const isLessThanOrEqualToNumber = Order.isLessThanOrEqualTo(Order.Number)

isLessThanOrEqualToNumber(1, 2) // => true
isLessThanOrEqualToNumber(1, 1) // => true
isLessThanOrEqualToNumber(2, 1) // => false
```

## isGreaterThanOrEqualTo

**Checking greater-than-or-equal comparisons**

```efx
import { Order } from "effect"

const isGreaterThanOrEqualToNumber = Order.isGreaterThanOrEqualTo(Order.Number)

isGreaterThanOrEqualToNumber(2, 1) // => true
isGreaterThanOrEqualToNumber(1, 1) // => true
isGreaterThanOrEqualToNumber(1, 2) // => false
```

## min

**Selecting the minimum value**

```efx
import { Order } from "effect"

const minNumber = Order.min(Order.Number)

minNumber(1, 2) // => 1
minNumber(2, 1) // => 1
minNumber(1, 1) // => 1
```

## max

**Selecting the maximum value**

```efx
import { Order } from "effect"

const maxNumber = Order.max(Order.Number)

maxNumber(1, 2) // => 2
maxNumber(2, 1) // => 2
maxNumber(1, 1) // => 1
```

## clamp

**Clamping values**

```efx
import { Order } from "effect"

const clamp = Order.clamp(Order.Number)({ minimum: 1, maximum: 5 })

clamp(3) // => 3
clamp(0) // => 1
clamp(6) // => 5
```

## isBetween

**Checking ranges**

```efx
import { Order } from "effect"

const betweenNumber = Order.isBetween(Order.Number)

betweenNumber(5, { minimum: 1, maximum: 10 }) // => true
betweenNumber(1, { minimum: 1, maximum: 10 }) // => true
betweenNumber(10, { minimum: 1, maximum: 10 }) // => true
betweenNumber(0, { minimum: 1, maximum: 10 }) // => false
betweenNumber(11, { minimum: 1, maximum: 10 }) // => false
```

## makeReducer

**Creating a Reducer**

```efx
import { Order } from "effect"

const reducer = Order.makeReducer<number>()
const orders = [Order.Number, Order.flip(Order.Number)]

const combined = reducer.combineAll(orders)
combined(1, 2) // => -1
```
