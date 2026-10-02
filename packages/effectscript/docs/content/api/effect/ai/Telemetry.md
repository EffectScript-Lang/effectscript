# effect/ai/Telemetry

The examples in the JSDoc of `packages/effect/src/ai/Telemetry.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## AttributesWithPrefix

**Prefixing telemetry attributes**

```efx
import type { Telemetry } from "effect/ai"

type RequestAttrs = {
  modelName: string
  maxTokens: number
}

type PrefixedAttrs = Telemetry.AttributesWithPrefix<
  RequestAttrs,
  "gen_ai.request"
>
// Results in: {
//   "gen_ai.request.model_name": string
//   "gen_ai.request.max_tokens": number
// }
const attributes: PrefixedAttrs = {
  "gen_ai.request.model_name": "gpt-4",
  "gen_ai.request.max_tokens": 1000
}
Object.keys(attributes) // => ["gen_ai.request.model_name", "gen_ai.request.max_tokens"]
```

## FormatAttributeName

**Formatting attribute names**

```efx
import type { Telemetry } from "effect/ai"

type Formatted1 = Telemetry.FormatAttributeName<"modelName"> // "model_name"
type Formatted2 = Telemetry.FormatAttributeName<"maxTokens"> // "max_tokens"
type Formatted3 = Telemetry.FormatAttributeName<"temperature"> // "temperature"

const formatted: [Formatted1, Formatted2, Formatted3] = [
  "model_name",
  "max_tokens",
  "temperature"
]
formatted // => ["model_name", "max_tokens", "temperature"]
```

## addSpanAttributes

**Adding prefixed span attributes**

```efx
import { Context, Option, String, Tracer } from "effect"
import { Telemetry } from "effect/ai"

const addCustomAttributes = Telemetry.addSpanAttributes(
  "custom.ai",
  String.camelToSnake
)

const span = new Tracer.NativeSpan({
  name: "request",
  parent: Option.none(),
  annotations: Context.empty(),
  links: [],
  startTime: 0n,
  kind: "internal",
  sampled: true
})

addCustomAttributes(span, {
  modelName: "gpt-4",
  maxTokens: 1000
})

Array.from(span.attributes.keys()) // => ["custom.ai.model_name", "custom.ai.max_tokens"]
```

## GenAITelemetryAttributeOptions

**Configuring GenAI telemetry attributes**

```efx
import type { Telemetry } from "effect/ai"

const telemetryOptions: Telemetry.GenAITelemetryAttributeOptions = {
  system: "openai",
  operation: {
    name: "chat"
  },
  request: {
    model: "gpt-4-turbo",
    temperature: 0.7,
    maxTokens: 2000
  },
  response: {
    id: "chatcmpl-123",
    model: "gpt-4-turbo-2024-04-09",
    finishReasons: ["stop"]
  },
  usage: {
    inputTokens: 50,
    outputTokens: 25
  }
}

const result = [telemetryOptions.system, telemetryOptions.usage?.inputTokens] // => ["openai", 50]
```

## addGenAIAnnotations

**Adding GenAI telemetry annotations**

```efx

const directUsage = effect {
  const span = await currentSpan

  Telemetry.addGenAIAnnotations(span, {
    system: "openai",
    request: { model: "gpt-4", temperature: 0.7 },
    usage: { inputTokens: 100, outputTokens: 50 }
  })
  return (span as { attributes: ReadonlyMap<string, unknown> }).attributes.size
}

await runPromise(withSpan(directUsage, "example")) // => 5
```

## SpanTransformer

**Transforming AI spans**

```efx
import type { Telemetry } from "effect/ai"

const customTransformer: Telemetry.SpanTransformer = ({ response, span }) => {
  // Add custom attributes based on the response
  const textParts = response.filter((part) => part.type === "text")
  const totalTextLength = textParts.reduce(
    (sum, part) => sum + (part.type === "text" ? part.text.length : 0),
    0
  )
  span.attribute("total_text_length", totalTextLength)
}

typeof customTransformer // => "function"
```
