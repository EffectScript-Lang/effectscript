# effect/schema/Model

The examples in the JSDoc of `packages/effect/src/schema/Model.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Module

**Defining a variant model class**

```efx
import { Schema } from "effect"
import { Model } from "effect/schema"

export const GroupId = Schema.Number.pipe(Schema.brand("GroupId"))

export class Group extends Model.Class<Group>("Group")({
  id: Model.GeneratedByDb(GroupId),
  name: Schema.String,
  createdAt: Model.DateTimeInsertFromDate,
  updatedAt: Model.DateTimeUpdateFromDate
}) {}

// schema used for selects
Group

// schema used for inserts
Group.insert

// schema used for updates
Group.update

// schema used for json api
Group.json
Group.jsonCreate
Group.jsonUpdate

// you can also turn them into classes
class GroupJson extends Schema.Class<GroupJson>("GroupJson")(Group.json) {
  get upperName() {
    return this.name.toUpperCase()
  }
}

[Schema.isSchema(Group), Schema.isSchema(Group.insert), Schema.isSchema(Group.json)] // => [true, true, true]
```
