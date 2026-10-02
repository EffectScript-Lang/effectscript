# effect/Predicate

The examples in the JSDoc of `packages/effect/src/Predicate.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Predicate

**Defining a predicate**

```efx
import { Predicate } from "effect"

const isPositive: Predicate.Predicate<number> = (n) => n > 0

isPositive(1) // => true
```

## PredicateTypeLambda

**Type-level usage**

```efx
import { Predicate } from "effect"

type P = Predicate.Predicate<number>
type TL = Predicate.PredicateTypeLambda

const witness: P = (value) => value > 0
witness(1) // => true
```

## Refinement

**Narrowing unknown values**

```efx
import { Predicate } from "effect"

const isString: Predicate.Refinement<unknown, string> = (u): u is string => typeof u === "string"

const data: unknown = "hello"
if (isString(data)) {
  data.toUpperCase() // => "HELLO"
}
```

## Predicate

**Extracting predicate input**

```efx
import { Predicate } from "effect"

type IsString = Predicate.Predicate<string>
type Input = Predicate.Predicate.In<IsString>

const input: Input = "value"
```

## Predicate.In

**Inferring the input type**

```efx
import { Predicate } from "effect"

type P = Predicate.Predicate<number>
type Input = Predicate.Predicate.In<P>

const input: Input = 1
```

## Predicate.Any

**Using generic constraints**

```efx
import { Predicate } from "effect"

type AnyPredicate = Predicate.Predicate.Any

const witness: AnyPredicate = () => true
witness("value") // => true
```

## Refinement

**Extracting refinement types**

```efx
import { Predicate } from "effect"

type IsString = Predicate.Refinement<unknown, string>
type Input = Predicate.Refinement.In<IsString>
type Output = Predicate.Refinement.Out<IsString>

const output: Output = "value"
```

## Refinement.In

**Inferring the input type**

```efx
import { Predicate } from "effect"

type R = Predicate.Refinement<unknown, string>
type Input = Predicate.Refinement.In<R>

const input: Input = "value"
```

## Refinement.Out

**Inferring the output type**

```efx
import { Predicate } from "effect"

type R = Predicate.Refinement<unknown, string>
type Output = Predicate.Refinement.Out<R>

const output: Output = "value"
```

## Refinement.Any

**Using generic constraints**

```efx
import { Predicate } from "effect"

type AnyRefinement = Predicate.Refinement.Any

const witness: AnyRefinement = (_): _ is string => true
witness("value") // => true
```

## mapInput

**Checking string length**

```efx
import { Predicate } from "effect"

const isLongerThan2 = Predicate.mapInput((s: string) => s.length)(
  (n: number) => n > 2
)

isLongerThan2("hello") // => true
```

## isTupleOf

**Checking exact length**

```efx
import { Predicate } from "effect"

const isPair = Predicate.isTupleOf(2)

isPair([1, 2]) // => true
```

## isTupleOfAtLeast

**Checking minimum length**

```efx
import { Predicate } from "effect"

const hasAtLeast2 = Predicate.isTupleOfAtLeast(2)

hasAtLeast2([1, 2, 3]) // => true
```

## isTruthy

**Filtering truthy values**

```efx
import { Predicate } from "effect"

const values = [0, 1, "", "ok", false]
const truthy = values.filter(Predicate.isTruthy) // => [1, "ok"]
```

## isSet

**Guarding a Set**

```efx
import { Predicate } from "effect"

const data: unknown = new Set([1, 2])

if (Predicate.isSet(data)) {
  data.size // => 2
}
```

## isMap

**Guarding a Map**

```efx
import { Predicate } from "effect"

const data: unknown = new Map([["a", 1]])

if (Predicate.isMap(data)) {
  data.size // => 1
}
```

## isString

**Guarding strings**

```efx
import { Predicate } from "effect"

const data: unknown = "hi"

if (Predicate.isString(data)) {
  data.toUpperCase() // => "HI"
}
```

## isNumber

**Guarding numbers**

```efx
import { Predicate } from "effect"

const data: unknown = 42

if (Predicate.isNumber(data)) {
  data + 1 // => 43
}
```

## isBoolean

**Guarding booleans**

```efx
import { Predicate } from "effect"

const data: unknown = true

if (Predicate.isBoolean(data)) {
  data ? "yes" : "no" // => "yes"
}
```

## isBigInt

**Guarding bigints**

```efx
import { Predicate } from "effect"

const data: unknown = 1n

if (Predicate.isBigInt(data)) {
  data + 2n // => 3n
}
```

## isSymbol

**Guarding symbols**

```efx
import { Predicate } from "effect"

const data: unknown = Symbol.for("id")

if (Predicate.isSymbol(data)) {
  data.description // => "id"
}
```

## isPropertyKey

**Guarding property keys**

```efx
import { Predicate } from "effect"

const key: unknown = "name"
const obj: Record<PropertyKey, unknown> = { name: "Ada" }

if (Predicate.isPropertyKey(key) && key in obj) {
  obj[key] // => "Ada"
}
```

## isFunction

**Guarding functions**

```efx
import { Predicate } from "effect"

const data: unknown = () => 1

if (Predicate.isFunction(data)) {
  data() // => 1
}
```

## isUndefined

**Guarding undefined values**

```efx
import { Predicate } from "effect"

const data: unknown = undefined

Predicate.isUndefined(data) // => true
```

## isNotUndefined

**Filtering undefined values**

```efx
import { Predicate } from "effect"

const values = [1, undefined, 2]
const defined = values.filter(Predicate.isNotUndefined) // => [1, 2]
```

## isNull

**Guarding null values**

```efx
import { Predicate } from "effect"

const data: unknown = null

Predicate.isNull(data) // => true
```

## isNotNull

**Filtering null values**

```efx
import { Predicate } from "effect"

const values = [1, null, 2]
const nonNull = values.filter(Predicate.isNotNull) // => [1, 2]
```

## isNullish

**Guarding nullish values**

```efx
import { Predicate } from "effect"

const values = [0, null, "", undefined]
const nullish = values.filter(Predicate.isNullish) // => [null, undefined]
```

## isNotNullish

**Filtering non-nullish values**

```efx
import { Predicate } from "effect"

const values = [0, null, "", undefined]
const present = values.filter(Predicate.isNotNullish) // => [0, ""]
```

## isNever

**Matching no values**

```efx
import { Predicate } from "effect"

Predicate.isNever("anything") // => false
```

## isUnknown

**Matching every value**

```efx
import { Predicate } from "effect"

Predicate.isUnknown(123) // => true
```

## isObjectOrArray

**Checking objects or arrays**

```efx
import { Predicate } from "effect"

Predicate.isObjectOrArray([]) // => true
```

## isObject

**Guarding objects**

```efx
import { Predicate } from "effect"

Predicate.isObject({ a: 1 }) // => true
Predicate.isObject([1, 2]) // => false
```

## isReadonlyObject

**Checking readonly objects**

```efx
import { Predicate } from "effect"

const data: unknown = { a: 1 }

Predicate.isReadonlyObject(data) // => true
```

## isObjectKeyword

**Checking object keywords**

```efx
import { Predicate } from "effect"

Predicate.isObjectKeyword(() => 1) // => true
Predicate.isObjectKeyword(null) // => false
```

## hasProperty

**Guarding object properties**

```efx
import { Predicate } from "effect"

const hasName = Predicate.hasProperty("name")
const data: unknown = { name: "Ada" }

if (hasName(data)) {
  data.name // => "Ada"
}
```

## isTagged

**Guarding tagged values**

```efx
import { Predicate } from "effect"

const isOk = Predicate.isTagged("Ok")

isOk({ _tag: "Ok", value: 1 }) // => true
```

## isError

**Guarding errors**

```efx
import { Predicate } from "effect"

const data: unknown = new Error("boom")

Predicate.isError(data) // => true
```

## isUint8Array

**Guarding Uint8Array values**

```efx
import { Predicate } from "effect"

const data: unknown = new Uint8Array([1, 2])

Predicate.isUint8Array(data) // => true
```

## isDate

**Guarding Date values**

```efx
import { Predicate } from "effect"

const data: unknown = new Date()

Predicate.isDate(data) // => true
```

## isIterable

**Guarding iterables**

```efx
import { Predicate } from "effect"

const data: unknown = [1, 2, 3]

Predicate.isIterable(data) // => true
```

## isPromise

**Guarding promises**

```efx
import { Predicate } from "effect"

const data: unknown = Promise.resolve(1)

Predicate.isPromise(data) // => true
```

## isPromiseLike

**Guarding promise-like values**

```efx
import { Predicate } from "effect"

const data: unknown = { then: () => {} }

Predicate.isPromiseLike(data) // => true
```

## isRegExp

**Guarding RegExp values**

```efx
import { Predicate } from "effect"

const data: unknown = /abc/

Predicate.isRegExp(data) // => true
```

## compose

**Composing refinements**

```efx
import { Predicate } from "effect"

const isNumber: Predicate.Refinement<unknown, number> = (u): u is number => typeof u === "number"
const isInteger: Predicate.Refinement<number, number> = (n): n is number => Number.isInteger(n)

const isIntegerNumber = Predicate.compose(isNumber, isInteger)

isIntegerNumber(1) // => true
```

## Tuple

**Checking tuples**

```efx
import { Predicate } from "effect"

const tupleCheck = Predicate.Tuple([(n: number) => n > 0, Predicate.isString])

tupleCheck([1, "ok"]) // => true
```

## Struct

**Checking structs**

```efx
import { Predicate } from "effect"

const userCheck = Predicate.Struct({
  id: Predicate.isNumber,
  name: Predicate.isString
})

userCheck({ id: 1, name: "Ada" }) // => true
```

## not

**Negating a predicate**

```efx
import { Predicate } from "effect"

const isNotString = Predicate.not(Predicate.isString)

isNotString(1) // => true
```

## or

**Checking either condition**

```efx
import { Predicate } from "effect"

const isStringOrNumber = Predicate.or(Predicate.isString, Predicate.isNumber)

isStringOrNumber("a") // => true
```

## and

**Checking both conditions**

```efx
import { Predicate } from "effect"

const hasAAndB = Predicate.and(
  Predicate.hasProperty("a"),
  Predicate.hasProperty("b")
)

const input: unknown = JSON.parse(`{"a":1,"b":"ok"}`)
if (hasAAndB(input)) {
  // input has both properties at this point
  const a = input.a
  const b = input.b

  const values = [a, b] // => [1, "ok"]
}
```

## xor

**Checking exclusive-or conditions**

```efx
import { Predicate } from "effect"

const isEven = (n: number) => n % 2 === 0
const isPositive = (n: number) => n > 0
const either = Predicate.xor(isEven, isPositive)

either(-2) // => true
```

## eqv

**Defining equivalence**

```efx
import { Predicate } from "effect"

const isEven = (n: number) => n % 2 === 0
const same = Predicate.eqv(isEven, isEven)

same(3) // => true
```

## implies

**Checking implication**

```efx
import { Predicate } from "effect"

const isAdult = (age: number) => age >= 18
const canVote = (age: number) => age >= 18
const implies = Predicate.implies(isAdult, canVote)

implies(16) // => true
```

## nor

**Checking NOR conditions**

```efx
import { Predicate } from "effect"

const neither = Predicate.nor(Predicate.isString, Predicate.isNumber)

neither(true) // => true
```

## nand

**Checking NAND conditions**

```efx
import { Predicate } from "effect"

const notBoth = Predicate.nand(Predicate.isString, Predicate.isNumber)

notBoth("a") // => true
```

## every

**Checking all predicates**

```efx
import { Predicate } from "effect"

const allChecks = Predicate.every([Predicate.isNumber, (n: number) => n > 0])

allChecks(2) // => true
```

## some

**Checking any predicate**

```efx
import { Predicate } from "effect"

const anyCheck = Predicate.some([Predicate.isString, Predicate.isNumber])

anyCheck("ok") // => true
```
