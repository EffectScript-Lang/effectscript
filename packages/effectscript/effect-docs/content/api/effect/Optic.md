# effect/Optic

The examples in the JSDoc of `packages/effect/src/Optic.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Iso

**Converting between Celsius and Fahrenheit**

```efx
import { Optic } from "effect"

const fahrenheit = Optic.makeIso<number, number>(
  (c) => c * 9 / 5 + 32,
  (f) => (f - 32) * 5 / 9
)

fahrenheit.get(100) // => 212

fahrenheit.set(32) // => 0
```

## makeIso

**Wrapping and unwrapping a branded type**

```efx
import { Optic } from "effect"

type Meters = { readonly value: number }
const meters = Optic.makeIso<Meters, number>(
  (m) => m.value,
  (n) => ({ value: n })
)

meters.get({ value: 100 }) // => 100

meters.set(42) // => { value: 42 }
```

## Lens

**Focusing on a struct field**

```efx
import { Optic } from "effect"

type Person = { readonly name: string; readonly age: number }

const _name = Optic.id<Person>().key("name")

_name.get({ name: "Alice", age: 30 }) // => "Alice"
```

## makeLens

**Focusing on the first element of a pair**

```efx
import { Optic } from "effect"

const _first = Optic.makeLens<readonly [string, number], string>(
  (pair) => pair[0],
  (s, pair) => [s, pair[1]]
)

_first.get(["hello", 42]) // => "hello"

_first.replace("world", ["hello", 42]) // => ["world", 42]
```

## Prism

**Narrowing a tagged union**

```efx
import { Optic, Result } from "effect"

type Shape =
  | { readonly _tag: "Circle"; readonly radius: number }
  | { readonly _tag: "Rect"; readonly width: number }

const _circle = Optic.id<Shape>().tag("Circle")

_circle.getResult({ _tag: "Circle", radius: 5 }) // => Result.succeed({ _tag: "Circle", radius: 5 })

Result.isFailure(_circle.getResult({ _tag: "Rect", width: 10 })) // => true
```

## makePrism

**Parsing a string to a number**

```efx
import { Optic, Result, SchemaIssue } from "effect"

const numeric = Optic.makePrism<string, number>(
  (s) => {
    const n = Number(s)
    return Number.isNaN(n)
      ? Result.fail(new SchemaIssue.InvalidValue({ message: "not a number" }))
      : Result.succeed(n)
  },
  String
)

numeric.getResult("42") // => Result.succeed(42)

numeric.set(42) // => "42"
```

## fromChecks

**Creating a positive integer prism**

```efx
import { Optic, Result, Schema } from "effect"

const posInt = Optic.fromChecks<number>(
  Schema.isGreaterThan(0),
  Schema.isInt()
)

posInt.getResult(3) // => Result.succeed(3)

Result.isFailure(posInt.getResult(-1)) // => true
```

## Optional

**Focusing on an optional record key**

```efx
import { Optic, Result } from "effect"

type Env = { [key: string]: string }
const _home = Optic.id<Env>().at("HOME")

_home.getResult({ HOME: "/root" }) // => Result.succeed("/root")

Result.isFailure(_home.getResult({ PATH: "/bin" })) // => true

// replace returns original on failure
_home.replace("/new", { PATH: "/bin" }) // => { PATH: "/bin" }
```

## Optional.compose

**Composing a lens with a prism**

```efx
import { Optic, Option, Result } from "effect"

type State = { value: Option.Option<number> }

const _inner = Optic.id<State>().key("value").compose(Optic.some())
// _inner is Optional<State, number>
_inner.getResult({ value: Option.some(1) }) // => Result.succeed(1)
```

## Optional.modify

**Incrementing a nested field**

```efx
import { Optic } from "effect"

type S = { readonly a: { readonly b: number } }
const _b = Optic.id<S>().key("a").key("b")

const inc = _b.modify((n) => n + 1)
inc({ a: { b: 1 } }) // => { a: { b: 2 } }
```

## Optional.key

**Drilling into nested structs**

```efx
import { Optic } from "effect"

type S = { readonly a: { readonly b: number } }
const _b = Optic.id<S>().key("a").key("b")

_b.get({ a: { b: 42 } }) // => 42
```

## Optional.optionalKey

**Deleting an optional key**

```efx
import { Optic } from "effect"

type S = { readonly a?: number }
const _a = Optic.id<S>().optionalKey("a")

_a.replace(undefined, { a: 1 }) // => {}

_a.replace(2, {}) // => { a: 2 }
```

## Optional.check

**Focusing only on positive numbers**

```efx
import { Optic, Result, Schema } from "effect"

const _pos = Optic.id<number>().check(Schema.isGreaterThan(0))

_pos.getResult(5) // => Result.succeed(5)

Result.isFailure(_pos.getResult(-1)) // => true
```

## Optional.refine

**Narrowing a union**

```efx
import { Optic, Result } from "effect"

type B = { readonly _tag: "b"; readonly b: number }
type S = { readonly _tag: "a"; readonly a: string } | B

const _b = Optic.id<S>().refine(
  (s: S): s is B => s._tag === "b",
  { expected: `"b" tag` }
)

_b.getResult({ _tag: "b", b: 1 }) // => Result.succeed({ _tag: "b", b: 1 })
```

## Optional.tag

**Focusing a tagged variant**

```efx
import { Optic, Result } from "effect"

type Shape =
  | { readonly _tag: "Circle"; readonly radius: number }
  | { readonly _tag: "Rect"; readonly width: number }

const _radius = Optic.id<Shape>().tag("Circle").key("radius")

_radius.getResult({ _tag: "Circle", radius: 5 }) // => Result.succeed(5)

Result.isFailure(_radius.getResult({ _tag: "Rect", width: 10 })) // => true
```

## Optional.at

**Accessing records safely**

```efx
import { Optic, Result } from "effect"

type Env = { [key: string]: number }
const _x = Optic.id<Env>().at("x")

_x.getResult({ x: 1 }) // => Result.succeed(1)

Result.isFailure(_x.getResult({ y: 2 })) // => true
```

## Optional.pick

**Picking keys**

```efx
import { Optic } from "effect"

type S = { readonly a: string; readonly b: number; readonly c: boolean }

const _ac = Optic.id<S>().pick(["a", "c"])

_ac.get({ a: "hi", b: 1, c: true }) // => { a: "hi", c: true }
```

## Optional.omit

**Omitting keys**

```efx
import { Optic } from "effect"

type S = { readonly a: string; readonly b: number; readonly c: boolean }

const _ac = Optic.id<S>().omit(["b"])

_ac.get({ a: "hi", b: 1, c: true }) // => { a: "hi", c: true }
```

## Optional.notUndefined

**Filtering undefined values**

```efx
import { Optic, Result } from "effect"

const _defined = Optic.id<number | undefined>().notUndefined()

_defined.getResult(42) // => Result.succeed(42)

Result.isFailure(_defined.getResult(undefined)) // => true
```

## Optional.forEach

**Incrementing liked posts**

```efx
import { Optic, Schema } from "effect"

type Post = { title: string; likes: number }
type S = { user: { posts: ReadonlyArray<Post> } }

const _likes = Optic.id<S>()
  .key("user")
  .key("posts")
  .forEach((post) => post.key("likes").check(Schema.isGreaterThan(0)))

const addLike = _likes.modifyAll((n) => n + 1)

const result = addLike({
  user: { posts: [{ title: "a", likes: 0 }, { title: "b", likes: 1 }] }
})
result.user.posts // => [{ title: "a", likes: 0 }, { title: "b", likes: 2 }]
```

## Optional.modifyAll

**Doubling all focused values**

```efx
import { Optic, Schema } from "effect"

type S = { readonly items: ReadonlyArray<number> }

const _positive = Optic.id<S>()
  .key("items")
  .forEach((n) => n.check(Schema.isGreaterThan(0)))

const doubled = _positive.modifyAll((n) => n * 2)

doubled({ items: [1, -2, 3] }) // => { items: [2, -2, 6] }
```

## makeOptional

**Accessing record keys safely**

```efx
import { Optic, Result, SchemaIssue } from "effect"

const atKey = (key: string) => {
  const issue = new SchemaIssue.Pointer([key], new SchemaIssue.MissingKey(undefined))
  return Optic.makeOptional<Record<string, number>, number>(
    (s) =>
      Object.hasOwn(s, key)
        ? Result.succeed(s[key])
        : Result.fail(issue),
    (a, s) =>
      Object.hasOwn(s, key)
        ? Result.succeed({ ...s, [key]: a })
        : Result.fail(issue)
  )
}

atKey("x").getResult({ x: 1 }) // => Result.succeed(1)
```

## Traversal

**Traversing array elements with a filter**

```efx
import { Optic, Schema } from "effect"

type S = { readonly items: ReadonlyArray<number> }

const _positive = Optic.id<S>()
  .key("items")
  .forEach((n) => n.check(Schema.isGreaterThan(0)))

const getPositive = Optic.getAll(_positive)

getPositive({ items: [1, -2, 3] }) // => [1, 3]
```

## getAll

**Collecting positive numbers**

```efx
import { Optic, Schema } from "effect"

type S = { readonly values: ReadonlyArray<number> }

const _pos = Optic.id<S>()
  .key("values")
  .forEach((n) => n.check(Schema.isGreaterThan(0)))

const getPositive = Optic.getAll(_pos)

getPositive({ values: [3, -1, 5] }) // => [3, 5]

getPositive({ values: [-1, -2] }) // => []
```

## id

**Starting an optic chain**

```efx
import { Optic } from "effect"

type S = { readonly x: number }

const _x = Optic.id<S>().key("x")

_x.get({ x: 42 }) // => 42
```

## entries

**Traversing record values**

```efx
import { Optic, Schema } from "effect"

const _positiveValues = Optic.entries<number>()
  .forEach((entry) => entry.key(1).check(Schema.isGreaterThan(0)))

const inc = _positiveValues.modifyAll((n) => n + 1)

inc({ a: 0, b: 3, c: -1 }) // => { a: 0, b: 4, c: -1 }
```

## some

**Accessing Some value**

```efx
import { Optic, Option, Result } from "effect"

const _some = Optic.id<Option.Option<number>>().compose(Optic.some())

_some.getResult(Option.some(42)) // => Result.succeed(42)

Result.isFailure(_some.getResult(Option.none())) // => true

_some.set(10) // => Option.some(10)
```

## none

**Matching None**

```efx
import { Optic, Option, Result } from "effect"

const _none = Optic.id<Option.Option<number>>().compose(Optic.none())

_none.getResult(Option.none()) // => Result.succeed(undefined)

Result.isFailure(_none.getResult(Option.some(1))) // => true
```

## success

**Accessing success**

```efx
import { Optic, Result } from "effect"

const _ok = Optic.id<Result.Result<number, string>>().compose(Optic.success())

_ok.getResult(Result.succeed(42)) // => Result.succeed(42)

Result.isFailure(_ok.getResult(Result.fail("err"))) // => true
```

## failure

**Accessing failure**

```efx
import { Optic, Result } from "effect"

const _err = Optic.id<Result.Result<number, string>>().compose(Optic.failure())

_err.getResult(Result.fail("oops")) // => Result.succeed("oops")

Result.isFailure(_err.getResult(Result.succeed(42))) // => true
```
