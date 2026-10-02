# effect/Equal

The examples in the JSDoc of `packages/effect/src/Equal.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## symbol

**Implementing Equal on a class**

```efx
import { Equal, Hash } from "effect"

class UserId implements Equal.Equal {
  constructor(readonly id: string) {}

  [Equal.symbol](that: Equal.Equal): boolean {
    return that instanceof UserId && this.id === that.id
  }

  [Hash.symbol](): number {
    return Hash.string(this.id)
  }
}

Equal.equals(new UserId("1"), new UserId("1")) // => true
Equal.equals(new UserId("1"), new UserId("2")) // => false
```

## Equal

**Comparing coordinates by value**

```efx
import { Equal, Hash } from "effect"

class Coordinate implements Equal.Equal {
  constructor(readonly x: number, readonly y: number) {}

  [Equal.symbol](that: Equal.Equal): boolean {
    return that instanceof Coordinate &&
      this.x === that.x &&
      this.y === that.y
  }

  [Hash.symbol](): number {
    return Hash.string(`${this.x},${this.y}`)
  }
}

Equal.equals(new Coordinate(1, 2), new Coordinate(1, 2)) // => true
Equal.equals(new Coordinate(1, 2), new Coordinate(3, 4)) // => false
```

## equals

**Comparing values**

```efx
import { Equal } from "effect"

Equal.equals(1, 1) // => true
Equal.equals(NaN, NaN) // => true
Equal.equals("a", "b") // => false

Equal.equals({ a: 1, b: 2 }, { a: 1, b: 2 }) // => true
Equal.equals([1, [2, 3]], [1, [2, 3]]) // => true

Equal.equals(new Date("2024-01-01"), new Date("2024-01-01")) // => true

const m1 = new Map([["a", 1], ["b", 2]])
const m2 = new Map([["b", 2], ["a", 1]])
Equal.equals(m1, m2) // => true

const is5 = Equal.equals(5)
is5(5) // => true
is5(3) // => false
```

## isEqual

**Checking Equal values**

```efx
import { Equal, Hash } from "effect"

class Token implements Equal.Equal {
  constructor(readonly value: string) {}
  [Equal.symbol](that: Equal.Equal): boolean {
    return that instanceof Token && this.value === that.value
  }
  [Hash.symbol](): number {
    return Hash.string(this.value)
  }
}

Equal.isEqual(new Token("abc")) // => true
Equal.isEqual({ x: 1 }) // => false
Equal.isEqual(42) // => false
```

## asEquivalence

**Deduplicating with Equal semantics**

```efx
import { Array, Equal } from "effect"

Array.dedupeWith([1, 2, 2, 3, 1], Equal.asEquivalence<number>()) // => [1, 2, 3]
```

## byReference

**Opting out of structural equality**

```efx
import { Equal } from "effect"

const a = { x: 1 }
const b = { x: 1 }

Equal.equals(a, b) // => true

const aRef = Equal.byReference(a)
Equal.equals(aRef, b) // => false
Equal.equals(aRef, aRef) // => true
aRef.x // => 1
```

## byReferenceUnsafe

**Marking an object for reference equality**

```efx
import { Equal } from "effect"

const obj1 = { a: 1, b: 2 }
const obj2 = { a: 1, b: 2 }

const marked = Equal.byReferenceUnsafe(obj1)

Equal.equals(obj1, obj2) // => false
Equal.equals(obj1, obj1) // => true
marked === obj1 // => true
```
