# effect/ai/Prompt

The examples in the JSDoc of `packages/effect/src/ai/Prompt.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## makePart

**Creating content parts**

```efx
import { Prompt } from "effect/ai"

const textPart = Prompt.makePart("text", {
  text: "Hello, world!"
})

const filePart = Prompt.makePart("file", {
  mediaType: "image/png",
  fileName: "screenshot.png",
  data: new Uint8Array([1, 2, 3])
})

const result = [textPart.type, filePart.type] // => ["text", "file"]
```

## TextPart

**Creating text parts**

```efx
import { Prompt } from "effect/ai"

const textPart: Prompt.TextPart = Prompt.makePart("text", {
  text: "Hello, how can I help you today?"
})
textPart.text // => "Hello, how can I help you today?"
```

## ReasoningPart

**Creating reasoning parts**

```efx
import { Prompt } from "effect/ai"

const reasoningPart: Prompt.ReasoningPart = Prompt.makePart("reasoning", {
  text:
    "Summary: the response compares the requested options by price and availability."
})
reasoningPart.type // => "reasoning"
```

## FilePart

**Creating file parts**

```efx
import { Prompt } from "effect/ai"

const imagePart: Prompt.FilePart = Prompt.makePart("file", {
  mediaType: "image/jpeg",
  fileName: "photo.jpg",
  data: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ..."
})

const documentPart: Prompt.FilePart = Prompt.makePart("file", {
  mediaType: "application/pdf",
  fileName: "report.pdf",
  data: new Uint8Array([1, 2, 3])
})

const result = [imagePart.mediaType, documentPart.fileName] // => ["image/jpeg", "report.pdf"]
```

## ToolCallPart

**Creating tool call parts**

```efx
import { Prompt } from "effect/ai"

const toolCallPart: Prompt.ToolCallPart = Prompt.makePart("tool-call", {
  id: "call_123",
  name: "get_weather",
  params: { city: "San Francisco", units: "celsius" },
  providerExecuted: false
})
toolCallPart.name // => "get_weather"
```

## ToolResultPart

**Creating tool result parts**

```efx
import { Prompt } from "effect/ai"

const toolResultPart: Prompt.ToolResultPart = Prompt.makePart("tool-result", {
  id: "call_123",
  name: "get_weather",
  isFailure: false,
  result: {
    temperature: 22,
    condition: "sunny",
    humidity: 65
  },
  providerExecuted: false
})
const result = [toolResultPart.name, toolResultPart.isFailure] // => ["get_weather", false]
```

## ToolApprovalResponsePart

**Creating tool approval responses**

```efx
import { Prompt } from "effect/ai"

const approvalResponse: Prompt.ToolApprovalResponsePart = Prompt.makePart(
  "tool-approval-response",
  {
    approvalId: "approval_123",
    approved: true
  }
)

const denialResponse: Prompt.ToolApprovalResponsePart = Prompt.makePart(
  "tool-approval-response",
  {
    approvalId: "approval_456",
    approved: false,
    reason: "Operation not allowed"
  }
)

const result = [approvalResponse.approved, denialResponse.approved] // => [true, false]
```

## ToolApprovalRequestPart

**Creating tool approval requests**

```efx
import { Prompt } from "effect/ai"

const approvalRequest: Prompt.ToolApprovalRequestPart = Prompt.makePart(
  "tool-approval-request",
  {
    approvalId: "approval_123",
    toolCallId: "call_456"
  }
)
const result = [approvalRequest.approvalId, approvalRequest.toolCallId] // => ["approval_123", "call_456"]
```

## makeMessage

**Creating messages**

```efx
import { Prompt } from "effect/ai"

const textPart = Prompt.makePart("text", {
  text: "Hello, world!"
})

const userMessage = Prompt.makeMessage("user", {
  content: [textPart]
})
const result = [userMessage.role, userMessage.content.length] // => ["user", 1]
```

## SystemMessage

**Creating system messages**

```efx
import { Prompt } from "effect/ai"

const systemMessage: Prompt.SystemMessage = Prompt.makeMessage("system", {
  content: "You are a helpful assistant specialized in mathematics. " +
    "Always show your work step by step."
})
systemMessage.role // => "system"
```

## UserMessage

**Creating user messages**

```efx
import { Prompt } from "effect/ai"

const textUserMessage: Prompt.UserMessage = Prompt.makeMessage("user", {
  content: [
    Prompt.makePart("text", {
      text: "Can you analyze this image for me?"
    })
  ]
})

const multimodalUserMessage: Prompt.UserMessage = Prompt.makeMessage("user", {
  content: [
    Prompt.makePart("text", {
      text: "What do you see in this image?"
    }),
    Prompt.makePart("file", {
      mediaType: "image/jpeg",
      fileName: "vacation.jpg",
      data: "data:image/jpeg;base64,..."
    })
  ]
})

const result = [textUserMessage.content.length, multimodalUserMessage.content.length] // => [1, 2]
```

## AssistantMessage

**Creating assistant messages**

```efx
import { Prompt } from "effect/ai"

const assistantMessage: Prompt.AssistantMessage = Prompt.makeMessage(
  "assistant",
  {
    content: [
      Prompt.makePart("text", {
        text:
          "I can check the current weather for San Francisco."
      }),
      Prompt.makePart("tool-call", {
        id: "call_123",
        name: "get_weather",
        params: { city: "San Francisco" },
        providerExecuted: false
      }),
      Prompt.makePart("tool-result", {
        id: "call_123",
        name: "get_weather",
        isFailure: false,
        result: {
          temperature: 72,
          condition: "sunny"
        },
        providerExecuted: true
      }),
      Prompt.makePart("text", {
        text: "The weather in San Francisco is currently 72°F and sunny."
      })
    ]
  }
)
assistantMessage.content.map((part) => part.type) // => ["text", "tool-call", "tool-result", "text"]
```

## ToolMessage

**Creating tool messages**

```efx
import { Prompt } from "effect/ai"

const toolMessage: Prompt.ToolMessage = Prompt.makeMessage("tool", {
  content: [
    Prompt.makePart("tool-result", {
      id: "call_123",
      name: "search_web",
      isFailure: false,
      result: {
        query: "TypeScript best practices",
        results: [
          { title: "TypeScript Handbook", url: "https://..." },
          { title: "Effective TypeScript", url: "https://..." }
        ]
      },
      providerExecuted: false
    })
  ]
})
const result = [toolMessage.role, toolMessage.content[0].type] // => ["tool", "tool-result"]
```

## RawInput

**Accepting raw prompt input**

```efx
import { Prompt } from "effect/ai"

// String input - creates a user message
const stringInput: Prompt.RawInput = "Hello, world!"

// Message array input
const messagesInput: Prompt.RawInput = [
  { role: "system", content: "You are helpful." },
  { role: "user", content: [{ type: "text", text: "Hi!" }] }
]

const promptInput: Prompt.RawInput = Prompt.empty

const result = [typeof stringInput, Array.isArray(messagesInput), promptInput.content.length] // => ["string", true, 0]
```

## empty

**Creating an empty prompt**

```efx
import { Prompt } from "effect/ai"

const emptyPrompt = Prompt.empty
emptyPrompt.content // => []
```

## make

**Creating prompts from inputs**

```efx
import { Prompt } from "effect/ai"

// From string - creates a user message
const textPrompt = Prompt.make("Hello, how are you?")

// From messages array
const structuredPrompt = Prompt.make([
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: [{ type: "text", text: "Hi!" }] }
])

const copiedPrompt = Prompt.make(Prompt.empty)

const result = [textPrompt.content[0].role, structuredPrompt.content.length, copiedPrompt.content.length] // => ["user", 2, 0]
```

## fromMessages

**Creating prompts from messages**

```efx
import { Prompt } from "effect/ai"

const messages: ReadonlyArray<Prompt.Message> = [
  Prompt.makeMessage("system", {
    content: "You are a coding assistant."
  }),
  Prompt.makeMessage("user", {
    content: [Prompt.makePart("text", { text: "Help me with TypeScript" })]
  })
]

const prompt = Prompt.fromMessages(messages)
prompt.content.length // => 2
```

## fromResponseParts

**Creating prompts from response parts**

```efx
import { Prompt, Response } from "effect/ai"

const responseParts: ReadonlyArray<Response.AnyPart> = [
  Response.makePart("text", {
    text: "Hello there!"
  }),
  Response.makePart("tool-call", {
    id: "call_1",
    name: "get_time",
    params: {},
    providerExecuted: false
  }),
  Response.makePart("tool-result", {
    id: "call_1",
    name: "get_time",
    isFailure: false,
    result: "10:30 AM",
    encodedResult: "10:30 AM",
    providerExecuted: false,
    preliminary: false
  })
]

const prompt = Prompt.fromResponseParts(responseParts)
// Creates an assistant message with the response content
prompt.content.map((message) => message.role) // => ["assistant", "tool"]
```

## concat

**Concatenating prompts**

```efx
import { Prompt } from "effect/ai"

const systemPrompt = Prompt.make([{
  role: "system",
  content: "You are a helpful assistant."
}])

const merged = Prompt.concat(systemPrompt, "Hello, world!")
merged.content.map((message) => message.role) // => ["system", "user"]
```

## setSystem

**Replacing system instructions**

```efx
import { Prompt } from "effect/ai"

const systemPrompt = Prompt.make([{
  role: "system",
  content: "You are a helpful assistant."
}])

const userPrompt = Prompt.make("Hello, world!")

const prompt = Prompt.concat(systemPrompt, userPrompt)

const replaced = Prompt.setSystem(
  prompt,
  "You are an expert in programming"
)
replaced.content[0].content // => "You are an expert in programming"
```

## prependSystem

**Prepending system instructions**

```efx
import { Prompt } from "effect/ai"

const systemPrompt = Prompt.make([{
  role: "system",
  content: "You are an expert in programming."
}])

const userPrompt = Prompt.make("Hello, world!")

const prompt = Prompt.concat(systemPrompt, userPrompt)

const replaced = Prompt.prependSystem(
  prompt,
  "You are a helpful assistant. "
)
// result content: "You are a helpful assistant. You are an expert in programming."
replaced.content[0].content // => "You are a helpful assistant. You are an expert in programming."
```

## appendSystem

**Appending system instructions**

```efx
import { Prompt } from "effect/ai"

const systemPrompt = Prompt.make([{
  role: "system",
  content: "You are an expert in programming."
}])

const userPrompt = Prompt.make("Hello, world!")

const prompt = Prompt.concat(systemPrompt, userPrompt)

const replaced = Prompt.appendSystem(
  prompt,
  " You are a helpful assistant."
)
// result content: "You are an expert in programming. You are a helpful assistant."
replaced.content[0].content // => "You are an expert in programming. You are a helpful assistant."
```
