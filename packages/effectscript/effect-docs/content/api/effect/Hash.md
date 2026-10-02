# effect/Hash

The examples in the JSDoc of `packages/effect/src/Hash.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Hash

**Implementing Hash**

```efx
import { Hash } from "effect"

class MyClass implements Hash.Hash {
  constructor(private value: number) {}

  [Hash.symbol](): number {
    return Hash.hash(this.value)
  }
}

new MyClass(42)[Hash.symbol]() // => 42
```

## hash

**Hashing different values**

```efx
import { Hash } from "effect"

Hash.hash(42) === Hash.hash(42) // => true
Hash.hash("hello") === Hash.hash("hello") // => true
Hash.hash([1, 2, 3]) === Hash.hash([1, 2, 3]) // => true
```

## random

**Hashing objects by reference**

```efx
import { Hash } from "effect"

const obj1 = { a: 1 }
const obj2 = { a: 1 }

Hash.random(obj1) === Hash.random(obj1) // => true

typeof Hash.random(obj2) // => "number"
```

## combine

**Combining hash values**

```efx
import { Hash, pipe } from "effect"

const hash1 = Hash.hash("hello")
const hash2 = Hash.hash("world")

const combined = Hash.combine(hash2)(hash1)
combined === pipe(hash1, Hash.combine(hash2)) // => true
```

## optimize

**Optimizing a hash value**

```efx
import { Hash } from "effect"

Hash.optimize(1234567890) // => 160826066
```

## isHash

**Checking for Hash support**

```efx
import { Hash } from "effect"

class MyHashable implements Hash.Hash {
  [Hash.symbol]() {
    return 42
  }
}

Hash.isHash(new MyHashable()) // => true
Hash.isHash({}) // => false
Hash.isHash("string") // => false
```

## number

**Hashing numbers**

```efx
import { Hash } from "effect"

Number.isInteger(Hash.number(42)) // => true
Number.isInteger(Hash.number(3.14)) // => true
Hash.number(NaN) === Hash.number(NaN) // => true
Hash.number(Infinity) === Hash.number(Infinity) // => true
Hash.number(100) === Hash.number(100) // => true
```

## string

**Hashing strings**

```efx
import { Hash } from "effect"

Hash.string("hello") // => 181380007
Hash.string("world") // => 164394279
Hash.string("") // => 5381
Hash.string("test") === Hash.string("test") // => true
```

## structureKeys

**Hashing selected object keys**

```efx
import { Hash } from "effect"

const person = { name: "John", age: 30, city: "New York" }

const hash1 = Hash.structureKeys(person, ["name", "age"])
const hash2 = Hash.structureKeys(person, ["name", "city"])

hash1 // => -731887653
hash2 // => 148523102

const person2 = { name: "John", age: 30, city: "Boston" }
const hash3 = Hash.structureKeys(person2, ["name", "age"])
hash1 === hash3 // => true
```

## structure

**Hashing object structures**

```efx
import { Hash } from "effect"

const obj1 = { name: "John", age: 30 }
const obj2 = { name: "Jane", age: 25 }
const obj3 = { name: "John", age: 30 }

Hash.structure(obj1) // => -731887653
Hash.structure(obj2) // => -222100417
Hash.structure(obj3) // => -731887653
Hash.structure(obj1) === Hash.structure(obj3) // => true
```

## array

**Hashing arrays**

```efx
import { Hash } from "effect"

const arr1 = [1, 2, 3]
const arr2 = [1, 2, 3]
const arr3 = [3, 2, 1]

Hash.array(arr1) === Hash.array(arr2) // => true
Hash.array(arr1) === Hash.array(arr3) // => false
```
