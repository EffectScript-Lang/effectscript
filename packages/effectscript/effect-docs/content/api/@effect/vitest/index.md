# @effect/vitest/index

The examples in the JSDoc of `packages/vitest/src/index.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## layer

```efx
import { Effect, Layer } from "effect"

class Foo extends Context.Service<Foo, "foo">()("Foo") {
  static layer = Layer.succeed(Foo, "foo")
}

class Bar extends Context.Service<Bar, "bar">()("Bar") {
  static layer = Layer.effect(
    Bar,
    map(Foo, () => "bar" as const)
  )
}

describe "layer" with Foo.layer {
  test "adds context" {
      const foo = await Foo
      assert.strictEqual(foo, "foo")
    }

  describe "nested" with Bar.layer {
    test "adds context" {
        const foo = await Foo
        const bar = await Bar
        assert.strictEqual(foo, "foo")
        assert.strictEqual(bar, "bar")
      }
  }
}
```

## makeMethods

**Using a Vitest fixture in an Effect test**

```efx
import { assert, makeMethods, test } from "@effect/vitest"
import { Effect } from "effect"

const it = makeMethods(
  test.extend("config", { scope: "file" }, () => ({ port: 3000 }))
)

it.effect("reads the config fixture", ({ config }) =>
  sync(() => {
    assert.strictEqual(config.port, 3000)
  }))
```
