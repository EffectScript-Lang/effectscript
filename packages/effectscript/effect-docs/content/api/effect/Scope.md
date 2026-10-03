# effect/Scope

The examples in the JSDoc of `packages/effect/src/Scope.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Scope

**Managing scoped resources**

```efx
const program = effect {
  const scope = await Scope.make("sequential")

  const initial = [scope.strategy, scope.state._tag]
  await Scope.close(scope, Exit.void)
  return [initial, scope.state._tag]
}

runSync(program) // => [["sequential", "Empty"], "Closed"]
```

**Accessing the scope service**

```efx
const cleanups: Array<string> = []
const program = effect {
  const scope = await Scope
  await Scope.addFinalizer(scope, sync(() => cleanups.push("Cleanup")))
}

runSync(scoped(program))
cleanups // => ["Cleanup"]
```

## Closeable

**Closing a scope**

```efx
const cleanups: Array<string> = []
const program = effect {
  const scope = await Scope.make()
  await Scope.addFinalizer(scope, sync(() => cleanups.push("Cleanup!")))
  await Scope.close(scope, Exit.void)
}

runSync(program)
cleanups // => ["Cleanup!"]
```

## State

**Checking scope states**

```efx
const program = effect {
  const scope = await Scope.make()
  const before = scope.state._tag
  await Scope.close(scope, Exit.void)
  return [before, scope.state._tag]
}

runSync(program) // => ["Empty", "Closed"]
```

## State.Empty

**Inspecting an empty scope state**

```efx
import { Scope } from "effect"

const scope = Scope.makeUnsafe()

scope.state._tag // => "Empty"
```

## State.Open

**Inspecting an open scope state**

```efx
const scope = Scope.makeUnsafe()

runSync(Scope.addFinalizer(scope, Effect.void))
const state = scope.state
if (state._tag !== "Open") throw new Error("unexpected state")

state._tag // => "Open"
state.finalizer !== undefined // => true
```

## State.Closed

**Inspecting a closed scope state**

```efx
const program = effect {
  const scope = await Scope.make()

  await Scope.close(scope, Exit.succeed("Done"))
  if (scope.state._tag === "Closed") {
    return scope.state.exit
  }
  return Exit.die("unexpected state")
}

runSync(program) // => Exit.succeed("Done")
```

## make

**Creating a scope**

```efx
const cleanups: Array<string> = []
const program = effect {
  const scope = await Scope.make("sequential")
  await Scope.addFinalizer(scope, sync(() => cleanups.push("Cleanup 1")))
  await Scope.addFinalizer(scope, sync(() => cleanups.push("Cleanup 2")))
  await Scope.close(scope, Exit.void)
}

runSync(program)
cleanups // => ["Cleanup 2", "Cleanup 1"]
```

## makeUnsafe

**Creating a scope synchronously**

```efx
const scope = Scope.makeUnsafe("sequential")
const cleanups: Array<string> = []
const program = effect {
  await Scope.addFinalizer(scope, sync(() => cleanups.push("Cleanup")))
  await Scope.close(scope, Exit.void)
}

runSync(program)
cleanups // => ["Cleanup"]
```

## provide

**Providing a scope**

```efx
const events: Array<string> = []
const program = effect {
  const scope = await Scope
  await Scope.addFinalizer(scope, sync(() => events.push("cleanup")))
  events.push("working")
}

const withScope = effect {
  const scope = await Scope.make()
  await Scope.provide(scope)(program)
  await Scope.close(scope, Exit.void)
}

runSync(withScope)
events // => ["working", "cleanup"]
```

## addFinalizerExit

**Adding an exit-aware finalizer**

```efx
const exits: Array<Exit<unknown, unknown>> = []
const withResource = effect {
  const scope = await Scope.make()
  await Scope.addFinalizerExit(scope, (exit) => sync(() => exits.push(exit)))
  await Scope.close(scope, Exit.void)
}

runSync(withResource)
exits // => [Exit.void]
```

## addFinalizer

**Adding finalizers**

```efx
const events: Array<string> = []
const program = effect {
  const scope = await Scope.make()
  await Scope.addFinalizer(scope, sync(() => events.push("cleanup 1")))
  await Scope.addFinalizer(scope, sync(() => events.push("cleanup 2")))
  await Scope.addFinalizer(scope, sync(() => events.push("cleanup 3")))
  events.push("work")
  await Scope.close(scope, Exit.void)
}

runSync(program)
events // => ["work", "cleanup 3", "cleanup 2", "cleanup 1"]
```

## fork

**Creating a child scope**

```efx
const cleanups: Array<string> = []
const nestedScopes = effect {
  const parentScope = await Scope.make("sequential")
  await Scope.addFinalizer(parentScope, sync(() => cleanups.push("parent")))
  const childScope = await Scope.fork(parentScope, "parallel")
  await Scope.addFinalizer(childScope, sync(() => cleanups.push("child")))
  await Scope.close(childScope, Exit.void)
  await Scope.close(parentScope, Exit.void)
}

runSync(nestedScopes)
cleanups // => ["child", "parent"]
```

## forkUnsafe

**Creating a child scope synchronously**

```efx
const cleanups: Array<string> = []
const program = effect {
  const parentScope = Scope.makeUnsafe("sequential")
  const childScope = Scope.forkUnsafe(parentScope, "parallel")
  await Scope.addFinalizer(parentScope, sync(() => cleanups.push("parent")))
  await Scope.addFinalizer(childScope, sync(() => cleanups.push("child")))
  await Scope.close(childScope, Exit.void)
  await Scope.close(parentScope, Exit.void)
}

runSync(program)
cleanups // => ["child", "parent"]
```

## close

**Running scope finalizers**

```efx
const events: Array<string> = []
const resourceManagement = effect {
  const scope = await Scope.make("sequential")
  await Scope.addFinalizer(scope, sync(() => events.push("database")))
  await Scope.addFinalizer(scope, sync(() => events.push("file")))
  await Scope.addFinalizer(scope, sync(() => events.push("memory")))
  events.push("work")
  await Scope.close(scope, Exit.succeed("Success!"))
}

runSync(resourceManagement)
events // => ["work", "memory", "file", "database"]
```
