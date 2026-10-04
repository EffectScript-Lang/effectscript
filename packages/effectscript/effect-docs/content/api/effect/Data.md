# effect/Data

The examples in the JSDoc of `packages/effect/src/Data.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Class

**Defining a value class**

```efx
import { Data, Equal } from "effect"

class Person extends Data.Class<{ readonly name: string }> {}

Equal.equals(new Person({ name: "Mike" }), new Person({ name: "Mike" })) // => true
```

## TaggedClass

**Defining a tagged class**

```efx
import { Data } from "effect"

class Person extends Data.TaggedClass("Person")<{
  readonly name: string
}> {}

new Person({ name: "Mike" })._tag // => "Person"
```

## TaggedEnum

**Defining a tagged enum**

```efx
import { Data } from "effect"

type HttpError = Data.TaggedEnum<{
  BadRequest: { readonly status: 400; readonly message: string }
  NotFound: { readonly status: 404 }
}>

// Equivalent to:
// | { readonly _tag: "BadRequest"; readonly status: 400; readonly message: string }
// | { readonly _tag: "NotFound"; readonly status: 404 }

const { BadRequest, NotFound } = Data.taggedEnum<HttpError>()

BadRequest({ status: 400, message: "missing id" })._tag // => "BadRequest"
```

## TaggedEnum.WithGenerics

**Defining a generic tagged enum**

```efx
import { Data } from "effect"

type MyResult<E, A> = Data.TaggedEnum<{
  Failure: { readonly error: E }
  Success: { readonly value: A }
}>

interface MyResultDef extends Data.TaggedEnum.WithGenerics<2> {
  readonly taggedEnum: MyResult<this["A"], this["B"]>
}

const { Failure, Success } = Data.taggedEnum<MyResultDef>()

const ok = Success({ value: 42 })
// ok: { readonly _tag: "Success"; readonly value: number }
ok // => { value: 42, _tag: "Success" }
```

## TaggedEnum.Kind

**Applying generics**

```efx
import type { Data } from "effect"

type Option<A> = Data.TaggedEnum<{
  None: {}
  Some: { readonly value: A }
}>
interface OptionDef extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: Option<this["A"]>
}

// Resolves to the concrete union for `string`:
// { _tag: "None" } | { _tag: "Some"; value: string }
type StringOption = Data.TaggedEnum.Kind<OptionDef, string>
```

## TaggedEnum.Args

**Extracting variant args**

```efx
import type { Data } from "effect"

type Result =
  | { readonly _tag: "Ok"; readonly value: number }
  | { readonly _tag: "Err"; readonly error: string }

type OkArgs = Data.TaggedEnum.Args<Result, "Ok">
// { readonly value: number }

type ErrArgs = Data.TaggedEnum.Args<Result, "Err">
// { readonly error: string }
```

## TaggedEnum.Value

**Extracting a variant type**

```efx
import type { Data } from "effect"

type Result =
  | { readonly _tag: "Ok"; readonly value: number }
  | { readonly _tag: "Err"; readonly error: string }

type OkVariant = Data.TaggedEnum.Value<Result, "Ok">
// { readonly _tag: "Ok"; readonly value: number }
```

## TaggedEnum.Constructor

**Using the constructor object**

```efx
import { Data } from "effect"

type Shape =
  | { readonly _tag: "Circle"; readonly radius: number }
  | { readonly _tag: "Rect"; readonly w: number; readonly h: number }

const { Circle, Rect, $is, $match } = Data.taggedEnum<Shape>()

const shape = Circle({ radius: 10 })

if ($is("Circle")(shape)) {
  shape.radius // => 10
}

$match(shape, {
  Circle: (s) => `circle r=${s.radius}`,
  Rect: (s) => `rect ${s.w}x${s.h}`
}) // => "circle r=10"
```

## taggedEnum

**Creating and matching tagged enum values**

```efx
import { Data } from "effect"

type HttpError = Data.TaggedEnum<{
  BadRequest: { readonly message: string }
  NotFound: { readonly url: string }
}>

const { BadRequest, NotFound, $is, $match } = Data.taggedEnum<HttpError>()

const err = NotFound({ url: "/missing" })

$is("NotFound")(err) // => true

$match(err, {
  BadRequest: (e) => e.message,
  NotFound: (e) => `${e.url} not found`
}) // => "/missing not found"
```

**Defining a generic tagged enum**

```efx
import { Data } from "effect"

type MyResult<E, A> = Data.TaggedEnum<{
  Failure: { readonly error: E }
  Success: { readonly value: A }
}>
interface MyResultDef extends Data.TaggedEnum.WithGenerics<2> {
  readonly taggedEnum: MyResult<this["A"], this["B"]>
}
const { Failure, Success } = Data.taggedEnum<MyResultDef>()

const ok = Success({ value: 42 })
// ok: { readonly _tag: "Success"; readonly value: number }
ok // => { value: 42, _tag: "Success" }
```

## Error

**Defining a yieldable error**

```efx
import { Exit } from "effect"

class NetworkError extends Data.Error<{
  readonly code: number
  readonly message: string
}> {}

const program = effect {
  return await new NetworkError({ code: 500, message: "timeout" })
}

runSync(exit(program)) // => Exit.fail(new NetworkError({ code: 500, message: "timeout" }))
```

## TaggedError

**Recovering by tag**

```efx
class NotFound extends Data.TaggedError("NotFound")<{
  readonly resource: string
}> {}

class Forbidden extends Data.TaggedError("Forbidden")<{
  readonly reason: string
}> {}

const program = effect {
  return await new NotFound({ resource: "/users/42" })
}

const recovered = program
  |> catchTag("NotFound", (e) =>
    succeed(`missing: ${e.resource}`))

await runPromise(recovered) // => "missing: /users/42"
```
