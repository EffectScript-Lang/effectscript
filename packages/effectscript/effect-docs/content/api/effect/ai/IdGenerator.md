# effect/ai/IdGenerator

The examples in the JSDoc of `packages/effect/src/ai/IdGenerator.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## IdGenerator

**Accessing the ID generator service**

```efx
const useIdGenerator = effect {
  const idGenerator = await IdGenerator.IdGenerator
  const newId = await idGenerator.generateId()
  return newId
}

const program = useIdGenerator
  |> provideService(IdGenerator.IdGenerator, {
    generateId: () => succeed("id-1")
  })
await runPromise(program) // => "id-1"
```

## Service

**Implementing a custom ID generator**

```efx
import type { IdGenerator } from "effect/ai"

// Custom deterministic implementation
let nextId = 0
const customService: IdGenerator.Service = {
  generateId: () => sync(() => `custom_${++nextId}`)
}

const program = customService.generateId()

await runPromise(program) // => "custom_1"
```

## MakeOptions

**Configuring generated IDs**

```efx
import type { IdGenerator } from "effect/ai"

// Configuration for tool call IDs
const toolCallOptions: IdGenerator.MakeOptions = {
  alphabet: "0123456789ABCDEF",
  prefix: "tool",
  separator: "_",
  size: 8
}

// This will generate IDs like: "tool_A1B2C3D4"
const result = [toolCallOptions.prefix, toolCallOptions.size] // => ["tool", 8]
```

## defaultIdGenerator

**Generating default IDs**

```efx
const program = effect {
  const id = await IdGenerator.defaultIdGenerator.generateId()
  return id
}

// Or provide it as a service
const withDefault = program
  |> provideService(
    IdGenerator.IdGenerator,
    IdGenerator.defaultIdGenerator
  )

const id = await runPromise(withDefault)
const result = [id.startsWith("id_"), id.length] // => [true, 19]
```

## make

**Creating a custom generator**

```efx
const program = effect {
  // Create a generator for AI assistant message IDs
  const messageIdGen = await IdGenerator.make({
    alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    prefix: "msg",
    separator: "-",
    size: 10
  })

  return await messageIdGen.generateId()
}

const messageId = await runPromise(program)
const result = [messageId.startsWith("msg-"), messageId.length] // => [true, 14]
```

**Handling invalid generator options**

```efx
// This will fail with IllegalArgumentError
const invalidConfig = IdGenerator.make({
  alphabet: "ABC123",
  prefix: "test",
  separator: "A", // Error: separator is part of alphabet
  size: 8
})

const error = await runPromise(flip(invalidConfig))
error.message // => 'The separator "A" must not be part of the alphabet "ABC123".'
```

## layer

**Providing an ID generator layer**

```efx
// Create a layer for generating AI tool call IDs
const toolCallIdLayer = IdGenerator.layer({
  alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  prefix: "tool_call",
  separator: "_",
  size: 12
})

const program = effect {
  const idGen = await IdGenerator.IdGenerator
  return await idGen.generateId()
} |> provide(toolCallIdLayer)

const toolCallId = await runPromise(program)
const result = [toolCallId.startsWith("tool_call_"), toolCallId.length] // => [true, 22]
```
