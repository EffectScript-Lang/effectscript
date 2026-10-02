# effect/ai/Response

The examples in the JSDoc of `packages/effect/src/ai/Response.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## AllParts

**Building a response parts schema**

```efx
import { Schema } from "effect"
import { Response, Tool, Toolkit } from "effect/ai"

const myToolkit = Toolkit.make(
  Tool.make("GetWeather", {
    parameters: Schema.Struct({ city: Schema.String }),
    success: Schema.Struct({ temperature: Schema.Number })
  })
)

const allPartsSchema = Response.AllParts(myToolkit)
Schema.isSchema(allPartsSchema) // => true
```

## makePart

**Creating response content parts**

```efx
import { Response } from "effect/ai"

const textPart = Response.makePart("text", {
  text: "Hello, world!"
})

const toolCallPart = Response.makePart("tool-call", {
  id: "call_123",
  name: "get_weather",
  params: { city: "San Francisco" },
  providerExecuted: false
})

const result = [textPart.type, toolCallPart.name] // => ["text", "get_weather"]
```

## TextPart

**Creating a text part**

```efx
import { Response } from "effect/ai"

const textPart: Response.TextPart = Response.makePart("text", {
  text: "The answer to your question is 42."
})
textPart.text // => "The answer to your question is 42."
```

## ReasoningPart

**Creating a reasoning part**

```efx
import { Response } from "effect/ai"

const reasoningPart: Response.ReasoningPart = Response.makePart("reasoning", {
  text:
    "Let me think step by step: First I need to analyze the user's question..."
})
reasoningPart.type // => "reasoning"
```

## ToolCallPart

**Creating a tool call part**

```efx
import { Schema } from "effect"
import { Response } from "effect/ai"

const weatherParams = Schema.Struct({
  city: Schema.String,
  units: Schema.optional(Schema.Literals(["celsius", "fahrenheit"]))
})

const toolCallPart: Response.ToolCallPart<
  "get_weather",
  {
    readonly city: string
    readonly units?: "celsius" | "fahrenheit"
  }
> = Response.makePart("tool-call", {
  id: "call_123",
  name: "get_weather",
  params: { city: "San Francisco", units: "celsius" },
  providerExecuted: false
})
const result = [toolCallPart.name, toolCallPart.params.city] // => ["get_weather", "San Francisco"]
```

## ToolResultPart

**Creating a tool result part**

```efx
import { Response } from "effect/ai"

interface WeatherData {
  temperature: number
  condition: string
  humidity: number
}

const toolResultPart: Response.ToolResultPart<
  "get_weather",
  WeatherData,
  never
> = Response.toolResultPart({
  id: "call_123",
  name: "get_weather",
  isFailure: false,
  result: {
    temperature: 22,
    condition: "sunny",
    humidity: 65
  },
  encodedResult: {
    temperature: 22,
    condition: "sunny",
    humidity: 65
  },
  providerExecuted: false,
  preliminary: false
})
const result = [toolResultPart.name, toolResultPart.result.temperature] // => ["get_weather", 22]
```

## ToolApprovalRequestPart

**Creating an approval request part**

```efx
import { Response } from "effect/ai"

const approvalRequest: Response.ToolApprovalRequestPart = Response.makePart(
  "tool-approval-request",
  {
    approvalId: "approval_123",
    toolCallId: "call_456"
  }
)
const result = [approvalRequest.approvalId, approvalRequest.toolCallId] // => ["approval_123", "call_456"]
```

## FilePart

**Creating a file part**

```efx
import { Response } from "effect/ai"

const imagePart: Response.FilePart = Response.makePart("file", {
  mediaType: "image/jpeg",
  data: new Uint8Array([1, 2, 3])
})
const result = [imagePart.mediaType, imagePart.data] // => ["image/jpeg", new Uint8Array([1, 2, 3])]
```

## ResponseMetadataPart

**Creating a metadata part**

```efx
import { DateTime } from "effect"
import { Response } from "effect/ai"

const metadataPart: Response.ResponseMetadataPart = Response.makePart(
  "response-metadata",
  {
    id: "resp_123",
    modelId: "gpt-4",
    timestamp: DateTime.makeUnsafe("2024-01-01T00:00:00Z"),
    request: undefined
  }
)
const result = [metadataPart.id, metadataPart.modelId] // => ["resp_123", "gpt-4"]
```

## FinishPart

**Creating a finish part**

```efx
import { Response } from "effect/ai"

const finishPart: Response.FinishPart = Response.makePart("finish", {
  reason: "stop",
  usage: new Response.Usage({
    inputTokens: {
      uncached: undefined,
      total: 50,
      cacheRead: undefined,
      cacheWrite: undefined
    },
    outputTokens: {
      total: 25,
      text: undefined,
      reasoning: undefined
    }
  }),
  response: undefined
})
const result = [finishPart.reason, finishPart.usage.inputTokens.total] // => ["stop", 50]
```

## ErrorPart

**Creating an error part**

```efx
import { Response } from "effect/ai"

const errorPart: Response.ErrorPart = Response.makePart("error", {
  error: new Error("boom")
})
const result = [errorPart.type, errorPart.error instanceof Error] // => ["error", true]
```
