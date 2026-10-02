# effect/HKT

The examples in the JSDoc of `packages/effect/src/HKT.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## URI

**Linking a type class to a type lambda**

```efx
import type { HKT } from "effect"

interface IdentityTypeLambda extends HKT.TypeLambda {
  readonly type: this["Target"]
}

interface IdentityTypeClass extends HKT.TypeClass<IdentityTypeLambda> {
  readonly [HKT.URI]?: IdentityTypeLambda
  readonly of: <A>(value: A) => HKT.Kind<IdentityTypeLambda, never, never, never, A>
}

const identity: IdentityTypeClass = {
  of: (value) => value
}

type LinkedTypeLambda = typeof identity[typeof HKT.URI]

const value: HKT.Kind<NonNullable<LinkedTypeLambda>, never, never, never, string> = identity.of("ok")
```

## TypeClass

**Defining higher-kinded type classes**

```efx
import type { HKT } from "effect"

// Define a Functor type class
interface Functor<F extends HKT.TypeLambda> extends HKT.TypeClass<F> {
  map<A, B>(
    fa: HKT.Kind<F, never, never, never, A>,
    f: (a: A) => B
  ): HKT.Kind<F, never, never, never, B>
}

// Define a Monad type class
interface Monad<F extends HKT.TypeLambda> extends Functor<F> {
  flatMap<A, B>(
    fa: HKT.Kind<F, never, never, never, A>,
    f: (a: A) => HKT.Kind<F, never, never, never, B>
  ): HKT.Kind<F, never, never, never, B>
}

const witness: keyof Monad<HKT.TypeLambda> = "flatMap"
```

## TypeLambda

**Defining type lambdas**

```efx
import type { Effect, HKT } from "effect"

// TypeLambda for Array<A>
interface ArrayTypeLambda extends HKT.TypeLambda {
  readonly type: Array<this["Target"]>
}

// TypeLambda for Effect<A, E, R>
interface EffectTypeLambda extends HKT.TypeLambda {
  readonly type: Effect.Effect<this["Target"], this["Out2"], this["Out1"]>
}

// TypeLambda for function (A) => B
interface FunctionTypeLambda extends HKT.TypeLambda {
  readonly type: (a: this["In"]) => this["Target"]
}

const witness: HKT.Kind<ArrayTypeLambda, never, never, never, string> = ["ok"]
```

## Kind

**Applying type lambdas**

```efx
import { Option } from "effect"
import type { Effect, HKT } from "effect"

// Define TypeLambdas
interface OptionTypeLambda extends HKT.TypeLambda {
  readonly type: Option.Option<this["Target"]>
}

interface EffectTypeLambda extends HKT.TypeLambda {
  readonly type: Effect.Effect<this["Target"], this["Out2"], this["Out1"]>
}

// Apply type parameters to get concrete types
type OptionString = HKT.Kind<OptionTypeLambda, never, never, never, string>
// Result: Option.Option<string>

type EffectStringNumberBoolean = HKT.Kind<
  EffectTypeLambda,
  never,
  number,
  boolean,
  string
>
// Result: Effect.Effect<string, number, boolean>

// TypeLambdas enable generic programming over type constructors
type StringType<F extends HKT.TypeLambda> = HKT.Kind<
  F,
  never,
  never,
  never,
  string
>

const witness: OptionString = Option.some("ok")
```
