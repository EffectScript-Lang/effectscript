# effect/ai/AiError

The examples in the JSDoc of `packages/effect/src/ai/AiError.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## HttpRequestDetails

**Describing an HTTP request**

```efx
import type { AiError } from "effect/ai"

const requestDetails: typeof AiError.HttpRequestDetails.Type = {
  method: "POST",
  url: "https://api.openai.com/v1/responses",
  urlParams: [],
  hash: undefined,
  headers: { "Content-Type": "application/json" }
}
const result = [requestDetails.method, requestDetails.urlParams] // => ["POST", []]
```

## HttpResponseDetails

**Describing an HTTP response**

```efx
import type { AiError } from "effect/ai"

const responseDetails: typeof AiError.HttpResponseDetails.Type = {
  status: 200,
  headers: {
    "Content-Type": "application/json",
    "X-Request-Id": "req_abc123"
  }
}
const result = [responseDetails.status, responseDetails.headers["X-Request-Id"]] // => [200, "req_abc123"]
```

## NetworkError

**Creating a network error**

```efx
import { AiError } from "effect/ai"

const error = new AiError.NetworkError({
  reason: "TransportError",
  request: {
    method: "POST",
    url: "https://api.openai.com/v1/completions",
    urlParams: [],
    hash: undefined,
    headers: { "Content-Type": "application/json" }
  },
  description: "Connection timeout after 30 seconds"
})

const result = [error.reason, error.isRetryable] // => ["TransportError", true]
```

## NetworkError.fromRequestError

**Creating a network error from a request error**

```efx
import { AiError } from "effect/ai"
import { HttpClientError, HttpClientRequest } from "effect/http"

const platformError = new HttpClientError.TransportError({
  request: HttpClientRequest.get("https://example.com/models"),
  description: "Connection refused"
})

const aiError = AiError.NetworkError.fromRequestError(platformError)
aiError.reason // => "TransportError"
```

## ProviderMetadata

**Inspecting metadata shape**

```efx
const metadata = {
  openai: {
    errorCode: "rate_limit_exceeded",
    requestId: "req_123"
  },
  anthropic: null
}

Array.of(metadata.openai.errorCode, metadata.anthropic) // => ["rate_limit_exceeded", null]
```

## RateLimitError

**Creating a rate limit error**

```efx
import { Duration } from "effect"
import { AiError } from "effect/ai"

const rateLimitError = new AiError.RateLimitError({
  retryAfter: Duration.seconds(60)
})

const result = [rateLimitError._tag, rateLimitError.isRetryable] // => ["RateLimitError", true]
```

## QuotaExhaustedError

**Creating a quota exhausted error**

```efx
import { AiError } from "effect/ai"

const quotaError = new AiError.QuotaExhaustedError({})

const result = [quotaError._tag, quotaError.isRetryable] // => ["QuotaExhaustedError", false]
```

## AuthenticationError

**Creating an authentication error**

```efx
import { AiError } from "effect/ai"

const authError = new AiError.AuthenticationError({
  kind: "InvalidKey"
})

const result = [authError.kind, authError.isRetryable] // => ["InvalidKey", false]

const detailed = new AiError.AuthenticationError({
  kind: "InsufficientPermissions",
  description: "Token expired"
})

detailed.message // => "InsufficientPermissions: Your API key lacks required permissions. Token expired"
```

## ContentPolicyError

**Creating a content policy error**

```efx
import { AiError } from "effect/ai"

const policyError = new AiError.ContentPolicyError({
  description: "Input contains prohibited content"
})

const result = [policyError.description, policyError.isRetryable] // => ["Input contains prohibited content", false]
```

## InvalidRequestError

**Creating an invalid request error**

```efx
import { AiError } from "effect/ai"

const invalidRequestError = new AiError.InvalidRequestError({
  parameter: "temperature",
  constraint: "must be between 0 and 2",
  description: "Temperature value 5 is out of range"
})

const result = [invalidRequestError.parameter, invalidRequestError.isRetryable] // => ["temperature", false]
```

## InternalProviderError

**Creating an internal provider error**

```efx
import { AiError } from "effect/ai"

const providerError = new AiError.InternalProviderError({
  description: "Server encountered an unexpected error"
})

const result = [providerError.description, providerError.isRetryable] // => ["Server encountered an unexpected error", true]
```

## InvalidOutputError

**Creating an invalid output error**

```efx
import { AiError } from "effect/ai"

const parseError = new AiError.InvalidOutputError({
  description: "Expected a string but received a number"
})

const result = [parseError.description, parseError.isRetryable] // => ["Expected a string but received a number", true]
```

## InvalidOutputError.fromSchemaError

**Creating an invalid output error from a schema error**

```efx
const schemaError = await runPromise(
  Schema.decodeUnknownEffect(Schema.Number)("not a number").pipe(flip)
)
const parseError = AiError.InvalidOutputError.fromSchemaError(schemaError)
parseError.description // => "Expected number"
```

## StructuredOutputError

**Creating a structured output error**

```efx
import { AiError } from "effect/ai"

const error = new AiError.StructuredOutputError({
  description: "Expected a valid JSON object",
  responseText: "{\"foo\":}"
})

const result = [error.description, error.responseText, error.isRetryable] // => ["Expected a valid JSON object", '{"foo":}', true]
```

## StructuredOutputError.fromSchemaError

**Creating a structured output error from a schema error**

```efx
const schemaError = await runPromise(
  Schema.decodeUnknownEffect(Schema.Struct({ name: Schema.String }))({}).pipe(flip)
)
const parseError = AiError.StructuredOutputError.fromSchemaError(schemaError, "{}")
parseError.responseText // => "{}"
```

## UnsupportedSchemaError

**Creating an unsupported schema error**

```efx
import { AiError } from "effect/ai"

const error = new AiError.UnsupportedSchemaError({
  description: "Unions are not supported in Anthropic structured output"
})

const result = [error.description, error.isRetryable] // => ["Unions are not supported in Anthropic structured output", false]
```

## UnknownError

**Creating an unknown error**

```efx
import { AiError } from "effect/ai"

const unknownError = new AiError.UnknownError({
  description: "An unexpected error occurred"
})

const result = [unknownError.description, unknownError.isRetryable] // => ["An unexpected error occurred", false]
```

## ToolNotFoundError

**Creating a tool not found error**

```efx
import { AiError } from "effect/ai"

const error = new AiError.ToolNotFoundError({
  toolName: "unknownTool",
  availableTools: ["GetWeather", "GetTime"]
})

const result = [error.toolName, error.availableTools, error.isRetryable] // => ["unknownTool", ["GetWeather", "GetTime"], true]
```

## ToolParameterValidationError

**Creating a tool parameter validation error**

```efx
import { AiError } from "effect/ai"

const error = new AiError.ToolParameterValidationError({
  toolName: "GetWeather",
  description: "Expected string, got number"
})

const result = [error.toolName, error.description, error.isRetryable] // => ["GetWeather", "Expected string, got number", true]
```

## InvalidToolResultError

**Creating an invalid tool result error**

```efx
import { AiError } from "effect/ai"

const error = new AiError.InvalidToolResultError({
  toolName: "GetWeather",
  description: "Tool handler returned invalid result: missing 'temperature' field"
})

const result = [error.toolName, error.isRetryable] // => ["GetWeather", false]
```

## ToolResultEncodingError

**Creating a tool result encoding error**

```efx
import { AiError } from "effect/ai"

const error = new AiError.ToolResultEncodingError({
  toolName: "GetWeather",
  toolResult: { temperature: 72n },
  description: "Cannot encode bigint values as JSON"
})

const result = [error.toolName, error.description, error.isRetryable] // => ["GetWeather", "Cannot encode bigint values as JSON", false]
```

## ToolConfigurationError

**Creating a tool configuration error**

```efx
import { AiError } from "effect/ai"

const error = new AiError.ToolConfigurationError({
  toolName: "OpenAiCodeInterpreter",
  description: "Invalid container ID format"
})

const result = [error.toolName, error.description, error.isRetryable] // => ["OpenAiCodeInterpreter", "Invalid container ID format", false]
```

## ToolkitRequiredError

**Creating a toolkit required error**

```efx
import { AiError } from "effect/ai"

const error = new AiError.ToolkitRequiredError({
  pendingApprovals: ["GetWeather", "SendEmail"]
})

const result = [error.pendingApprovals, error.isRetryable] // => [["GetWeather", "SendEmail"], false]
```

## InvalidUserInputError

**Creating an invalid user input error**

```efx
import { AiError } from "effect/ai"

const error = new AiError.InvalidUserInputError({
  description: "Unsupported media type 'video/mp4'. Supported types include images, application/pdf, text/plain"
})

const result = [error._tag, error.isRetryable] // => ["InvalidUserInputError", false]
```

## AiError

**Handling an AI error by tag**

```efx
const aiOperation = fail(new AiError.AiError({
  module: "OpenAI",
  method: "generateText",
  reason: new AiError.RateLimitError({ retryAfter: Duration.seconds(30) })
}))

// Handle specific reason types
const handled = aiOperation.pipe(
  catchTag("AiError", (error) => {
    if (error.reason._tag === "RateLimitError") {
      return succeed(`Retry after ${error.retryAfter}`)
    }
    return fail(error)
  })
)

await runPromise(handled) // => "Retry after 30000 millis"
```

## isAiError

**Checking for an AI error**

```efx
import { AiError } from "effect/ai"

const someError = new Error("generic error")
const aiError = AiError.make({
  module: "Test",
  method: "example",
  reason: new AiError.RateLimitError({})
})

const result = [AiError.isAiError(someError), AiError.isAiError(aiError)] // => [false, true]
```

## isAiErrorReason

**Checking for an AI error reason**

```efx
import { AiError } from "effect/ai"

const rateLimitError = new AiError.RateLimitError({})
const genericError = new Error("generic error")

const result = [AiError.isAiErrorReason(rateLimitError), AiError.isAiErrorReason(genericError)] // => [true, false]
```

## make

**Creating an AI error**

```efx
import { Duration } from "effect"
import { AiError } from "effect/ai"

const error = AiError.make({
  module: "OpenAI",
  method: "completion",
  reason: new AiError.RateLimitError({
    retryAfter: Duration.seconds(60)
  })
})

const result = [error.module, error.method, error.reason._tag] // => ["OpenAI", "completion", "RateLimitError"]
```

## reasonFromHttpStatus

**Mapping an HTTP status to a reason**

```efx
import { AiError } from "effect/ai"

const reason = AiError.reasonFromHttpStatus({
  status: 429,
  body: { error: "Rate limit exceeded" }
})

reason._tag // => "RateLimitError"
```
