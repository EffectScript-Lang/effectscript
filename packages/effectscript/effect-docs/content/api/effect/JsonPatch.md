# effect/JsonPatch

The examples in the JSDoc of `packages/effect/src/JsonPatch.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## JsonPatchOperation

**Defining all operation types**

```efx
import { JsonPatch } from "effect"

const addOp: JsonPatch.JsonPatchOperation = {
  op: "add",
  path: "/users/-",
  value: { id: 1, name: "Alice" }
}

const removeOp: JsonPatch.JsonPatchOperation = {
  op: "remove",
  path: "/users/0"
}

const replaceOp: JsonPatch.JsonPatchOperation = {
  op: "replace",
  path: "/users/0/name",
  value: "Bob"
}

Array.of(addOp.op, removeOp.op, replaceOp.op) // => ["add", "remove", "replace"]
```

## JsonPatch

**Defining a multi-operation patch**

```efx
import { JsonPatch } from "effect"

const patch: JsonPatch.JsonPatch = [
  { op: "add", path: "/items/-", value: "apple" },
  { op: "replace", path: "/count", value: 5 },
  { op: "remove", path: "/oldField" }
]

JsonPatch.apply(patch, { items: [], count: 3, oldField: "value" }) // => { items: ["apple"], count: 5 }
```

## get

**Computing object diff**

```efx
import { JsonPatch } from "effect"

const oldValue = { users: [{ id: 1, name: "Alice" }], count: 1 }
const newValue = { users: [{ id: 1, name: "Bob" }, { id: 2, name: "Charlie" }], count: 2 }

const patch = JsonPatch.get(oldValue, newValue)
patch[0] // => { op: "replace", path: "/count", value: 2 }
patch[1] // => { op: "replace", path: "/users/0/name", value: "Bob" }
patch[2] // => { op: "add", path: "/users/1", value: { id: 2, name: "Charlie" } }
```

## apply

**Applying a patch**

```efx
import { JsonPatch } from "effect"

const document = { items: [1, 2, 3], total: 6 }
const patch: JsonPatch.JsonPatch = [
  { op: "add", path: "/items/-", value: 4 },
  { op: "replace", path: "/total", value: 10 }
]

JsonPatch.apply(patch, document) // => { items: [1, 2, 3, 4], total: 10 }
```
