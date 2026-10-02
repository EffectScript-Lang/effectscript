# effect/Equivalence

The examples in the JSDoc of `packages/effect/src/Equivalence.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Equivalence

**Defining simple number equivalence**

```efx
import type { Equivalence } from "effect"

const numberEq: Equivalence.Equivalence<number> = (a, b) => a === b

numberEq(1, 1) // => true
numberEq(1, 2) // => false
```

**Defining custom object equivalence**

```efx
import type { Equivalence } from "effect"

interface Point {
  x: number
  y: number
}

const pointEq: Equivalence.Equivalence<Point> = (a, b) =>
  a.x === b.x && a.y === b.y

pointEq({ x: 1, y: 2 }, { x: 1, y: 2 }) // => true
```

## EquivalenceTypeLambda

**Type-level usage**

```efx
import type { Equivalence, HKT } from "effect"

// Used internally for type-level computations
type NumberEquivalence = HKT.Kind<
  Equivalence.EquivalenceTypeLambda,
  never,
  never,
  never,
  number
>
// Equivalent to: Equivalence.Equivalence<number>
```

## make

**Case-insensitive string equivalence**

```efx
import { Equivalence } from "effect"

const caseInsensitive = Equivalence.make<string>((a, b) =>
  a.toLowerCase() === b.toLowerCase()
)

caseInsensitive("Hello", "HELLO") // => true
caseInsensitive("foo", "bar") // => false

// Same reference optimization
const str = "test"
caseInsensitive(str, str) // => true
```

**Comparing numbers with tolerance**

```efx
import { Equivalence } from "effect"

const tolerance = Equivalence.make<number>((a, b) => Math.abs(a - b) < 0.0001)

tolerance(1.0, 1.001) // => false
tolerance(1.0, 1.00001) // => true
```

## strictEqual

**Comparing primitive types**

```efx
import { Equivalence } from "effect"

const strictEq = Equivalence.strictEqual<number>()

strictEq(1, 1) // => true
strictEq(1, 2) // => false
strictEq(NaN, NaN) // => false
```

**Comparing objects by reference**

```efx
import { Equivalence } from "effect"

const obj = { value: 42 }
const strictObjEq = Equivalence.strictEqual<typeof obj>()

strictObjEq(obj, obj) // => true
strictObjEq(obj, { value: 42 }) // => false
```

## String

**Comparing strings**

```efx
import { Equivalence } from "effect"

Equivalence.String("hello", "hello") // => true
Equivalence.String("hello", "world") // => false
```

## Number

**Comparing numbers**

```efx
import { Equivalence } from "effect"

Equivalence.Number(1, 1) // => true
Equivalence.Number(1, 2) // => false
Equivalence.Number(NaN, NaN) // => true
```

## Boolean

**Comparing booleans**

```efx
import { Equivalence } from "effect"

Equivalence.Boolean(true, true) // => true
Equivalence.Boolean(true, false) // => false
```

## BigInt

**Comparing bigints**

```efx
import { Equivalence } from "effect"

Equivalence.BigInt(1n, 1n) // => true
Equivalence.BigInt(1n, 2n) // => false
```

## combine

**Combining name and age equivalences**

```efx
import { Equivalence } from "effect"

interface Person {
  name: string
  age: number
}

const nameEquivalence = Equivalence.mapInput(
  Equivalence.strictEqual<string>(),
  (p: Person) => p.name
)

const ageEquivalence = Equivalence.mapInput(
  Equivalence.strictEqual<number>(),
  (p: Person) => p.age
)

const personEquivalence = Equivalence.combine(nameEquivalence, ageEquivalence)

const person1 = { name: "Alice", age: 30 }
const person2 = { name: "Alice", age: 30 }
const person3 = { name: "Alice", age: 31 }

personEquivalence(person1, person2) // => true
personEquivalence(person1, person3) // => false
```

## combineAll

**Combining multiple field equivalences**

```efx
import { Equivalence } from "effect"

interface Point3D {
  x: number
  y: number
  z: number
}

const xEq = Equivalence.mapInput(
  Equivalence.strictEqual<number>(),
  (p: Point3D) => p.x
)
const yEq = Equivalence.mapInput(
  Equivalence.strictEqual<number>(),
  (p: Point3D) => p.y
)
const zEq = Equivalence.mapInput(
  Equivalence.strictEqual<number>(),
  (p: Point3D) => p.z
)

const point3DEq = Equivalence.combineAll([xEq, yEq, zEq])

const point1 = { x: 1, y: 2, z: 3 }
const point2 = { x: 1, y: 2, z: 3 }
const point3 = { x: 1, y: 2, z: 4 }

point3DEq(point1, point2) // => true
point3DEq(point1, point3) // => false
```

**Handling empty collections**

```efx
import { Equivalence } from "effect"

// Empty collection always returns true
const alwaysEq = Equivalence.combineAll([])
alwaysEq("anything", "else") // => true
```

## mapInput

**Deriving equivalence from an object property**

```efx
import { Equivalence } from "effect"

interface User {
  id: number
  name: string
  email: string
}

// Create equivalence based on user ID only
const userByIdEq = Equivalence.mapInput(
  Equivalence.strictEqual<number>(),
  (user: User) => user.id
)

const user1 = { id: 1, name: "Alice", email: "alice@example.com" }
const user2 = { id: 1, name: "Alice Smith", email: "alice.smith@example.com" }
const user3 = { id: 2, name: "Bob", email: "bob@example.com" }

userByIdEq(user1, user2) // => true
userByIdEq(user1, user3) // => false
```

**Case-insensitive string equivalence**

```efx
import { Equivalence } from "effect"

const caseInsensitiveEq = Equivalence.mapInput(
  Equivalence.strictEqual<string>(),
  (s: string) => s.toLowerCase()
)

caseInsensitiveEq("Hello", "HELLO") // => true
caseInsensitiveEq("Hello", "World") // => false
```

## Tuple

**Comparing homogeneous tuples**

```efx
import { Equivalence } from "effect"

const stringTupleEq = Equivalence.Tuple([
  Equivalence.strictEqual<string>(),
  Equivalence.strictEqual<string>(),
  Equivalence.strictEqual<string>()
])

const tuple1 = ["hello", "world", "test"] as const
const tuple2 = ["hello", "world", "test"] as const
const tuple3 = ["hello", "world", "different"] as const

stringTupleEq(tuple1, tuple2) // => true
stringTupleEq(tuple1, tuple3) // => false
```

**Comparing tuples with custom equivalences**

```efx
import { Equivalence } from "effect"

const caseInsensitive = Equivalence.mapInput(
  Equivalence.strictEqual<string>(),
  (s: string) => s.toLowerCase()
)

const customTupleEq = Equivalence.Tuple([
  caseInsensitive,
  caseInsensitive,
  caseInsensitive
])

customTupleEq(["Hello", "World", "Test"], ["HELLO", "WORLD", "TEST"]) // => true
```

## Module

**Comparing number arrays**

```efx
import { Equivalence } from "effect"

const numberArrayEq = Equivalence.Array(Equivalence.strictEqual<number>())

numberArrayEq([1, 2, 3], [1, 2, 3]) // => true
numberArrayEq([1, 2, 3], [1, 2, 4]) // => false
numberArrayEq([1, 2], [1, 2, 3]) // => false
```

**Case-insensitive string array**

```efx
import { Equivalence } from "effect"

const caseInsensitive = Equivalence.mapInput(
  Equivalence.strictEqual<string>(),
  (s: string) => s.toLowerCase()
)
const stringArrayEq = Equivalence.Array(caseInsensitive)

stringArrayEq(["Hello", "World"], ["HELLO", "WORLD"]) // => true
stringArrayEq(["Hello"], ["Hi"]) // => false
stringArrayEq([], []) // => true
```

## Struct

**Comparing structs with different equivalences per field**

```efx
import { Equivalence } from "effect"

interface Person {
  name: string
  age: number
  email: string
}

const caseInsensitive = Equivalence.mapInput(
  Equivalence.strictEqual<string>(),
  (s: string) => s.toLowerCase()
)

const personEq = Equivalence.Struct({
  name: caseInsensitive,
  age: Equivalence.strictEqual<number>(),
  email: caseInsensitive
})

const person1 = { name: "Alice", age: 30, email: "alice@example.com" }
const person2 = { name: "ALICE", age: 30, email: "ALICE@EXAMPLE.COM" }
const person3 = { name: "Alice", age: 31, email: "alice@example.com" }

personEq(person1, person2) // => true
personEq(person1, person3) // => false
```

**Comparing specific fields**

```efx
import { Equivalence } from "effect"

const nameAgeEq = Equivalence.Struct({
  name: Equivalence.strictEqual<string>(),
  age: Equivalence.strictEqual<number>()
})

// Only compares name and age, ignores other properties
const obj1 = { name: "Alice", age: 30, extra: "ignored" }
const obj2 = { name: "Alice", age: 30, extra: "different" }
nameAgeEq(obj1, obj2) // => true
```

## Record

**Defining records with string values**

```efx
import { Equivalence } from "effect"

const stringRecordEq = Equivalence.Record(Equivalence.strictEqual<string>())

const record1 = { a: "hello", b: "world" }
const record2 = { a: "hello", b: "world" }
const record3 = { a: "hello", b: "different" }
const record4 = { a: "hello" } // missing key 'b'

stringRecordEq(record1, record2) // => true
stringRecordEq(record1, record3) // => false
stringRecordEq(record1, record4) // => false
```

**Defining records with number values**

```efx
import { Equivalence } from "effect"

const numberRecordEq = Equivalence.Record(Equivalence.strictEqual<number>())

const scores1 = { alice: 100, bob: 85 }
const scores2 = { alice: 100, bob: 85 }
const scores3 = { alice: 100, bob: 90 }

numberRecordEq(scores1, scores2) // => true
numberRecordEq(scores1, scores3) // => false
```

## makeReducer

**Creating a Reducer**

```efx
import { Equivalence } from "effect"

const reducer = Equivalence.makeReducer<number>()
const equivalences = [
  Equivalence.strictEqual<number>(),
  Equivalence.make<number>((a, b) => Math.abs(a - b) < 1)
]

const combined = reducer.combineAll(equivalences)
// Combined equivalence requires both conditions to be true
combined(1, 1) // => true
combined(1, 1.5) // => false
```

## Date

**Comparing Date values**

```efx
import { Equivalence } from "effect"

const d1 = new Date("2020-01-01T00:00:00.000Z")
const d2 = new Date("2020-01-01T00:00:00.000Z")
const d3 = new Date("2021-01-01T00:00:00.000Z")
const invalidDate1 = new Date("foo")
const invalidDate2 = new Date("bar")

Equivalence.Date(d1, d2) // => true
Equivalence.Date(d1, d3) // => false
Equivalence.Date(invalidDate1, invalidDate2) // => true
Equivalence.Date(invalidDate1, d1) // => false
```

**Comparing reference and value equality**

```efx
import { Equivalence } from "effect"

const d1 = new Date(0)
const d2 = new Date(0)

d1 === d2 // => false
Equivalence.Date(d1, d2) // => true
```
