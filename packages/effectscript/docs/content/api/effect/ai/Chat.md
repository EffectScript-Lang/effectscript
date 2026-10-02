# effect/ai/Chat

The examples in the JSDoc of `packages/effect/src/ai/Chat.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Chat

**Accessing the Chat service**

```efx

const FakeLanguageModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () =>
      succeed([{
        type: "text",
        text: "Quantum computers use quantum states to process information."
      }]),
    streamText: () => Stream.empty
  })
)

const ChatLayer = Layer.effect(Chat.Chat, Chat.empty)

const program = effect {
  const chat = await Chat
  const response = await chat.generateText({
    prompt: "Explain quantum computing in simple terms"
  })
  return response.text
}

await runPromise(
  program.pipe(provide(Layer.merge(ChatLayer, FakeLanguageModel)))
) // => "Quantum computers use quantum states to process information."
```

## Module

**Inspecting chat history**

```efx

const inspectHistory = effect {
  const chat = await Chat.fromPrompt("Hello")
  const currentHistory = await Ref.get(chat.history)
  return currentHistory.content.length
}

await runPromise(inspectHistory) // => 1
```

**Exporting chat history**

```efx

const saveChat = effect {
  const chat = await Chat.fromPrompt("Hello!")
  const exportedData = await chat.export
  return typeof exportedData
}

await runPromise(saveChat) // => "object"
```

**Exporting chat history as JSON**

```efx

const backupChat = effect {
  const chat = await Chat.fromPrompt("Explain photosynthesis")
  const jsonBackup = await chat.exportJson
  return JSON.parse(jsonBackup).content.length
}

await runPromise(backupChat) // => 1
```

**Generating chat responses**

```efx

const FakeLanguageModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: (options) =>
      succeed([{
        type: "text",
        text: options.prompt.content.length === 1
          ? "The capital of France is Paris."
          : "Paris has about 2.1 million residents."
      }]),
    streamText: () => Stream.empty
  })
)

const chatWithAI = effect {
  const chat = await Chat.empty

  const response1 = await chat.generateText({
    prompt: "What is the capital of France?"
  })
  const response2 = await chat.generateText({
    prompt: "What's the population of that city?"
  })
  return [response1.text, response2.text]
}

await runPromise(chatWithAI.pipe(provide(FakeLanguageModel))) // => ["The capital of France is Paris.", "Paris has about 2.1 million residents."]
```

**Streaming chat responses**

```efx

const FakeLanguageModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => succeed([]),
    streamText: () =>
      Stream.make(
        { type: "text-delta", id: "story", delta: "A small probe reached orbit." },
        { type: "text-delta", id: "story", delta: " It sent back a picture of Earth." }
      )
  })
)

const streamingChat = effect {
  const chat = await Chat.empty
  const story = await chat.streamText({
    prompt: "Write a short story about space exploration"
  }).pipe(
    Stream.runFold(() => "", (text, part) =>
      part.type === "text-delta" ? text + part.delta : text)
  )
  return story
}

const story = await runPromise(streamingChat.pipe(provide(FakeLanguageModel)))
story // => "A small probe reached orbit. It sent back a picture of Earth."
```

**Generating structured objects**

```efx

const ContactSchema = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
  phone: Schema.optional(Schema.String)
})

const FakeLanguageModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () =>
      succeed([{
        type: "text",
        text: '{"name":"John Doe","email":"john@example.com","phone":"555-1234"}'
      }]),
    streamText: () => Stream.empty
  })
)

const extractContact = effect {
  const chat = await Chat.empty
  const contact = await chat.generateObject({
    prompt: "Extract contact info: John Doe, john@example.com, 555-1234",
    schema: ContactSchema
  })
  return [contact.value.name, contact.value.email, contact.value.phone]
}

await runPromise(extractContact.pipe(provide(FakeLanguageModel))) // => ["John Doe", "john@example.com", "555-1234"]
```

## empty

**Creating an empty chat**

```efx

const freshChat = effect {
  const chat = await Chat.empty
  const history = await chat.export
  return (history as { content: ReadonlyArray<unknown> }).content.length
}

await runPromise(freshChat) // => 0
```

## fromPrompt

**Creating a chat from a system prompt**

```efx

const chatWithSystemPrompt = effect {
  const chat = await Chat.fromPrompt([{
    role: "system",
    content: "You are a helpful assistant specialized in mathematics."
  }])

  const history = await chat.export
  return (history as { content: ReadonlyArray<unknown> }).content.length
}

await runPromise(chatWithSystemPrompt) // => 1
```

**Restoring chat history from a prompt**

```efx

// Initialize with conversation history
const existingChat = effect {
  const chat = await Chat.fromPrompt([
    {
      role: "user",
      content: [{ type: "text", text: "What's the weather like?" }]
    },
    {
      role: "assistant",
      content: [{ type: "text", text: "I don't have access to weather data." }]
    },
    {
      role: "user",
      content: [{ type: "text", text: "Can you help me with coding?" }]
    }
  ])

  const history = await chat.export
  return (history as { content: ReadonlyArray<unknown> }).content.length
}

await runPromise(existingChat) // => 3
```

## fromExport

**Restoring chat data**

```efx

const restoreChat = effect {
  const originalChat = await Chat.fromPrompt([
    {
      role: "user",
      content: "Which library are we using?"
    },
    {
      role: "assistant",
      content: "The project uses Effect."
    }
  ])

  const exported = await originalChat.export
  const restoredChat = await Chat.fromExport(exported)
  const restoredHistory = await Ref.get(restoredChat.history)

  const restoredResponse = restoredHistory.content[1]
  if (restoredResponse?.role === "assistant") {
    const restoredText = restoredResponse.content[0]
    if (restoredText?.type === "text") {
      return {
        roles: restoredHistory.content.map((message) => message.role),
        text: restoredText.text
      }
    }
  }
  return undefined
}

await runPromise(restoreChat) // => { roles: ["user", "assistant"], text: "The project uses Effect." }
```

## fromJson

**Restoring chat history from JSON**

```efx

const restoreFromJson = effect {
  const original = await Chat.fromPrompt("Hello")
  const jsonData = await original.exportJson
  const restoredChat = await Chat.fromJson(jsonData)
  const history = await Ref.get(restoredChat.history)
  return history.content.length
}

await runPromise(restoreFromJson) // => 1
```
