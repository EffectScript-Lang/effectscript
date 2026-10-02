# effect/Formatter

The examples in the JSDoc of `packages/effect/src/Formatter.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Formatter

**Defining a custom formatter**

```efx
import type { Formatter } from "effect"

const upper: Formatter.Formatter<string> = (s) => s.toUpperCase()

upper("hello") // => "HELLO"
```

## format

**Formatting compact output**

```efx
import { Formatter } from "effect"

Formatter.format({ a: 1, b: [2, 3] }) // => "{\"a\":1,\"b\":[2,3]}"
```

**Pretty-printed output**

```efx
import { Formatter } from "effect"

const output = Formatter.format({ a: 1, b: [2, 3] }, { space: 2 })
output // => "{\n  \"a\": 1,\n  \"b\": [\n    2,\n    3\n  ]\n}"
```

**Handling circular references**

```efx
import { Formatter } from "effect"

const obj: any = { name: "loop" }
obj.self = obj
Formatter.format(obj) // => "{\"name\":\"loop\",\"self\":[Circular]}"
```

## formatJson

**Formatting compact JSON**

```efx
import { Formatter } from "effect"

Formatter.formatJson({ name: "Alice", age: 30 }) // => "{\"name\":\"Alice\",\"age\":30}"
```

**Handling circular references**

```efx
import { Formatter } from "effect"

const obj: any = { name: "test" }
obj.self = obj
Formatter.formatJson(obj) // => "{\"name\":\"test\"}"
```

**Pretty-printed JSON**

```efx
import { Formatter } from "effect"

const output = Formatter.formatJson({ name: "Alice", age: 30 }, { space: 2 })
output // => "{\n  \"name\": \"Alice\",\n  \"age\": 30\n}"
```
