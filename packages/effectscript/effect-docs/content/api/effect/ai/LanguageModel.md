# effect/ai/LanguageModel

The examples in the JSDoc of `packages/effect/src/ai/LanguageModel.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## LanguageModel

**Accessing the language model service**

```efx

const FakeLanguageModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () =>
      succeed([{
        type: "text",
        text: "Machine learning finds patterns in data."
      }]),
    streamText: () => Stream.empty
  })
)

const program = effect {
  const model = await LanguageModel
  const response = await model.generateText({
    prompt: "What is machine learning?"
  })
  return response.text
}

await runPromise(program.pipe(provide(FakeLanguageModel))) // => "Machine learning finds patterns in data."
```

## GenerateTextResponse

**Inspecting a text response**

```efx
import { LanguageModel, Response } from "effect/ai"

const response = new LanguageModel.GenerateTextResponse([
  Response.makePart("text", { text: "Plants convert light into energy." })
])

const result = [response.text, response.finishReason] // => ["Plants convert light into energy.", "unknown"]
```

## GenerateObjectResponse

**Inspecting an object response**

```efx
import { LanguageModel, Response } from "effect/ai"

const response = new LanguageModel.GenerateObjectResponse(
  { name: "John Doe", email: "john@example.com" },
  [Response.makePart("text", { text: '{"name":"John Doe","email":"john@example.com"}' })]
)

response.value // => { name: "John Doe", email: "john@example.com" }
response.text // => '{"name":"John Doe","email":"john@example.com"}'
```

## generateText

**Generating text with options**

```efx

const FakeLanguageModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: (options) =>
      succeed([
        {
          type: "text",
          text: options.toolChoice === "none"
            ? "Code flows through types / Errors become values / Programs stay composed"
            : "Unexpected tool choice"
        },
        {
          type: "finish",
          reason: "stop",
          usage: {
            inputTokens: { total: 6 },
            outputTokens: { total: 12 }
          }
        }
      ]),
    streamText: () => Stream.empty
  })
)

const program = LanguageModel.generateText({
  prompt: "Write a haiku about programming",
  toolChoice: "none"
}).pipe(
  map((response) => [response.text, response.usage.inputTokens.total]),
  provide(FakeLanguageModel)
)

await runPromise(program) // => ["Code flows through types / Errors become values / Programs stay composed", 6]
```

## generateObject

**Generating an object**

```efx

const EventSchema = Schema.Struct({
  title: Schema.String,
  date: Schema.String,
  location: Schema.String
})

const FakeLanguageModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () =>
      succeed([{
        type: "text",
        text: '{"title":"Tech Conference","date":"March 15th","location":"San Francisco"}'
      }]),
    streamText: () => Stream.empty
  })
)

const program = LanguageModel.generateObject({
  prompt: "Extract event info: Tech Conference on March 15th in San Francisco",
  schema: EventSchema,
  objectName: "event"
}).pipe(
  map((response) => response.value),
  provide(FakeLanguageModel)
)

await runPromise(program) // => { title: "Tech Conference", date: "March 15th", location: "San Francisco" }
```

## streamText

**Streaming text deltas**

```efx

const FakeLanguageModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => succeed([]),
    streamText: () =>
      Stream.make(
        { type: "text-delta", id: "story", delta: "The explorer reached orbit." },
        { type: "text-delta", id: "story", delta: " Earth glowed below." }
      )
  })
)

const program = LanguageModel.streamText({
  prompt: "Write a story about a space explorer"
}).pipe(
  Stream.runFold(() => "", (text, part) => part.type === "text-delta" ? text + part.delta : text),
  provide(FakeLanguageModel)
)

await runPromise(program) // => "The explorer reached orbit. Earth glowed below."
```
