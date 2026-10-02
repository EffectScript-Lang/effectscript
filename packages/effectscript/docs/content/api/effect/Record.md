# effect/Record

The examples in the JSDoc of `packages/effect/src/Record.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## ReadonlyRecord

**Defining a readonly record type**

```efx
import type { Record } from "effect"

// Creating a readonly record type
type UserRecord = Record.ReadonlyRecord<"name" | "age", string | number>

const user: UserRecord = {
  name: "John",
  age: 30
}
user // => { name: "John", age: 30 }
```

**Using readonly record helper types**

```efx
import type { Record } from "effect"

// Using NonLiteralKey to convert literal keys to generic types
type GenericKey = Record.ReadonlyRecord.NonLiteralKey<"foo" | "bar"> // string

// Using IntersectKeys to find common keys between record types
type CommonKeys = Record.ReadonlyRecord.IntersectKeys<"a" | "b", "b" | "c"> // "b"

"key" satisfies GenericKey
"b" satisfies CommonKeys
```

## ReadonlyRecord.NonLiteralKey

**Converting literal keys to non-literal keys**

```efx
import type { Record } from "effect"

// For literal string keys, this becomes 'string'
type Example1 = Record.ReadonlyRecord.NonLiteralKey<"foo" | "bar"> // string

// For symbol keys, this becomes 'symbol'
type Example2 = Record.ReadonlyRecord.NonLiteralKey<symbol> // symbol

const symbol: Example2 = Symbol.for("key")
"key" satisfies Example1
symbol
```

## ReadonlyRecord.IntersectKeys

**Intersecting record keys**

```efx
import type { Record } from "effect"

// Intersection of literal keys
type Example1 = Record.ReadonlyRecord.IntersectKeys<"a" | "b", "b" | "c"> // "b"

// Intersection with generic string
type Example2 = Record.ReadonlyRecord.IntersectKeys<string, "a" | "b"> // string

"b" satisfies Example1
"a" satisfies Example2
```

## ReadonlyRecordTypeLambda

**Applying a readonly record type lambda**

```efx
import type { HKT, Record } from "effect"

type Settings = HKT.Kind<
  Record.ReadonlyRecordTypeLambda<"port" | "retries">,
  never,
  never,
  never,
  number
>

const defaults: Settings = {
  port: 3000,
  retries: 3
}
defaults // => { port: 3000, retries: 3 }
```

## empty

**Creating an empty record**

```efx
import { Record } from "effect"

// Create an empty record
const emptyRecord = Record.empty<string, number>()
emptyRecord // => {}

// The type ensures type safety for future operations
Record.set(emptyRecord, "count", 42) // => { count: 42 }
```

## isEmptyRecord

**Checking for an empty record**

```efx
import { Record } from "effect"

Record.isEmptyRecord({}) // => true
Record.isEmptyRecord({ a: 3 }) // => false
```

## isEmptyReadonlyRecord

**Checking for an empty readonly record**

```efx
import { Record } from "effect"

Record.isEmptyReadonlyRecord({}) // => true
Record.isEmptyReadonlyRecord({ a: 3 }) // => false
```

## fromIterableWith

**Building a record from mapped iterable values**

```efx
import { Record } from "effect"

Record.fromIterableWith([1, 2, 3, 4], (a) => [String(a), a * 2]) // => { "1": 2, "2": 4, "3": 6, "4": 8 }
```

## fromIterableBy

**Building a record keyed by iterable values**

```efx
import { Record } from "effect"

const users = [
  { id: "2", name: "name2" },
  { id: "1", name: "name1" }
]

Record.fromIterableBy(
  users,
  (user) => user.id
) // => { "1": { id: "1", name: "name1" }, "2": { id: "2", name: "name2" } }
```

## fromEntries

**Building a record from entries**

```efx
import { Record } from "effect"

Record.fromEntries([["a", 1], ["b", 2]]) // => { a: 1, b: 2 }
```

## collect

**Collecting mapped record values**

```efx
import { Record } from "effect"

const x = { a: 1, b: 2, c: 3 }
Record.collect(x, (key, n) => [key, n]) // => [["a", 1], ["b", 2], ["c", 3]]
```

## toEntries

**Converting a record to entries**

```efx
import { Record } from "effect"

const x = { a: 1, b: 2, c: 3 }
Record.toEntries(x) // => [["a", 1], ["b", 2], ["c", 3]]
```

## size

**Getting the record size**

```efx
import { Record } from "effect"

Record.size({ a: "a", b: 1, c: true }) // => 3
```

## has

**Checking key membership**

```efx
import { Record } from "effect"

Record.has({ a: 1, b: 2 }, "a") // => true
Record.has(Record.empty<string>(), "c") // => false
```

## get

**Getting a value as an Option**

```efx
import { Option, Record as R } from "effect"

const person: Record<string, unknown> = { name: "John Doe", age: 35 }

R.get(person, "name") // => Option.some("John Doe")
R.get(person, "email") // => Option.none()
```

## modify

**Modifying a value at a key**

```efx
import { Option, Record } from "effect"

const f = (x: number) => x * 2

const input: Record<string, number> = { a: 3 }

Record.modify(input, "a", f) // => Option.some({ a: 6 })
Record.modify(input, "b", f) // => Option.none()
```

## replace

**Replacing a value at a key**

```efx
import { Option, Record } from "effect"

Record.replace({ a: 1, b: 2, c: 3 }, "a", 10) // => Option.some({ a: 10, b: 2, c: 3 })
Record.replace(Record.empty<string>(), "a", 10) // => Option.none()
```

## remove

**Removing a key**

```efx
import { Record } from "effect"

Record.remove({ a: 1, b: 2 }, "a") // => { b: 2 }
```

## pop

**Popping a value and removing its key**

```efx
import { Option, Record } from "effect"

const input: Record<string, number> = { a: 1, b: 2 }

Record.pop(input, "a") // => Option.some([1, { b: 2 }])
Record.pop(input, "c") // => Option.none()
```

## map

**Mapping record values**

```efx
import { Record } from "effect"

const f = (n: number) => `-${n}`

Record.map({ a: 3, b: 5 }, f) // => { a: "-3", b: "-5" }

const g = (n: number, key: string) => `${key.toUpperCase()}-${n}`

Record.map({ a: 3, b: 5 }, g) // => { a: "A-3", b: "B-5" }
```

## mapKeys

**Mapping record keys**

```efx
import { Record } from "effect"

Record.mapKeys({ a: 3, b: 5 }, (key) => key.toUpperCase()) // => { A: 3, B: 5 }
```

## mapEntries

**Mapping record entries**

```efx
import { Record } from "effect"

Record.mapEntries({ a: 3, b: 5 }, (a, key) => [key.toUpperCase(), a + 1]) // => { A: 4, B: 6 }
```

## filterMap

**Filtering and mapping with Result**

```efx
import { Record, Result } from "effect"

const x = { a: 1, b: 2, c: 3 }
const f = (a: number, key: string) => a > 2 ? Result.succeed(a * 2) : Result.failVoid
Record.filterMap(x, f) // => { c: 6 }
```

## filter

**Filtering record values**

```efx
import { Record } from "effect"

const x = { a: 1, b: 2, c: 3, d: 4 }
Record.filter(x, (n) => n > 2) // => { c: 3, d: 4 }
```

## getSomes

**Extracting Some values**

```efx
import { Option, Record } from "effect"

Record.getSomes({ a: Option.some(1), b: Option.none(), c: Option.some(2) }) // => { a: 1, c: 2 }
```

## getFailures

**Extracting Result failures**

```efx
import { Record, Result } from "effect"

Record.getFailures({
    a: Result.succeed(1),
    b: Result.fail("err"),
    c: Result.succeed(2)
}) // => { b: "err" }
```

## getSuccesses

**Extracting Result successes**

```efx
import { Record, Result } from "effect"

Record.getSuccesses({
    a: Result.succeed(1),
    b: Result.fail("err"),
    c: Result.succeed(2)
}) // => { a: 1, c: 2 }
```

## partition

**Partitioning with Result**

```efx
import { Record, Result } from "effect"

const x = { a: 1, b: 2, c: 3 }
const f = (n: number) => (n % 2 === 0 ? Result.succeed(n) : Result.fail(n))
Record.partition(x, f) // => [{ b: 2 }, { a: 1, c: 3 }]
```

## separate

**Separating Result values**

```efx
import { Record, Result } from "effect"

Record.separate({ a: Result.fail("e"), b: Result.succeed(1) }) // => [{ b: 1 }, { a: "e" }]
```

## keys

**Getting record keys**

```efx
import { Record } from "effect"

Record.keys({ a: 1, b: 2, c: 3 }) // => ["a", "b", "c"]
```

## values

**Getting record values**

```efx
import { Record } from "effect"

Record.values({ a: 1, b: 2, c: 3 }) // => [1, 2, 3]
```

## set

**Setting a record value**

```efx
import { Record } from "effect"

Record.set("a", 5)({ a: 1, b: 2 }) // => { a: 5, b: 2 }
Record.set("c", 5)({ a: 1, b: 2 }) // => { a: 1, b: 2, c: 5 }
```

## assignProperty

**Assigning an external key safely**

```efx
import { Record } from "effect"

const key: string = "__proto__" // Assume this comes from external input
const value = { polluted: true }

const unsafe: Record<string, unknown> = {}
unsafe[key] = value
Object.getPrototypeOf(unsafe) === value // => true

const safe: Record<string, unknown> = {}
Record.assignProperty(safe, key, value)
Object.getPrototypeOf(safe) === Object.prototype // => true
safe[key] === value // => true
```

## isSubrecordBy

**Checking subrecords with a custom equivalence**

```efx
import { Equivalence, Record } from "effect"

const isSubrecord = Record.isSubrecordBy(
  Equivalence.make<string>((self, that) => self.toLowerCase() === that.toLowerCase())
)

const required: Record.ReadonlyRecord<string, string> = { role: "Admin" }
const available: Record.ReadonlyRecord<string, string> = {
  role: "admin",
  status: "active"
}

isSubrecord(required, available) // => true
isSubrecord({ role: "Admin", status: "inactive" }, available) // => false
isSubrecord(required, { role: "editor", status: "active" }) // => false
```

## isSubrecord

**Checking subrecords**

```efx
import { Record } from "effect"

Record.isSubrecord({ a: 1 } as Record<string, number>, { a: 1, b: 2 }) // => true
Record.isSubrecord({ a: 1, b: 2 }, { a: 1 } as Record<string, number>) // => false
```

## reduce

**Reducing record values**

```efx
import { Record } from "effect"

Record.reduce({ a: 1, b: 2, c: 3 }, 0, (acc, value) => acc + value) // => 6
```

## every

**Checking every record value**

```efx
import { Record } from "effect"

Record.every({ a: 1, b: 2 }, (n) => n > 0) // => true
Record.every({ a: 1, b: -1 }, (n) => n > 0) // => false
```

## some

**Checking for any matching value**

```efx
import { Record } from "effect"

Record.some({ a: 1, b: 2 }, (n) => n > 1) // => true
Record.some({ a: 1, b: 2 }, (n) => n > 2) // => false
```

## union

**Merging records with union**

```efx
import { Record } from "effect"

Record.union({ a: 1, b: 2 }, { b: 3, c: 4 }, (a, b) => a + b) // => { a: 1, b: 5, c: 4 }
```

## intersection

**Merging intersecting keys**

```efx
import { Record } from "effect"

Record.intersection({ a: 1, b: 2 }, { b: 3, c: 4 }, (a, b) => a + b) // => { b: 5 }
```

## difference

**Keeping keys unique to each record**

```efx
import { Record } from "effect"

Record.difference({ a: 1, b: 2 }, { b: 3, c: 4 }) // => { a: 1, c: 4 }
```

## makeEquivalence

**Comparing records with a value equivalence**

```efx
import { Equal, Record } from "effect"

const recordEquivalence = Record.makeEquivalence(Equal.asEquivalence<number>())

recordEquivalence({ a: 1, b: 2 }, { a: 1, b: 2 }) // => true
recordEquivalence({ a: 1, b: 2 }, { a: 1, b: 3 }) // => false
```

## singleton

**Creating a singleton record**

```efx
import { Record } from "effect"

Record.singleton("a", 1) // => { a: 1 }
```

## findFirst

**Finding the first matching entry**

```efx
import { Option, Record } from "effect"

const record = { a: 1, b: 2, c: 3 }
Record.findFirst(
  record,
  (value, key) => value > 1 && key !== "b"
) // => Option.some(["c", 3])
```
