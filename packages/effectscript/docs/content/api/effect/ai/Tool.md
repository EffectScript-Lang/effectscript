# effect/ai/Tool

The examples in the JSDoc of `packages/effect/src/ai/Tool.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Tool

**Defining a weather lookup tool**

```efx
import { Schema } from "effect"
import { Tool } from "effect/ai"

// Create a weather lookup tool
const GetWeather = Tool.make("GetWeather", {
  description: "Get current weather for a location",
  parameters: Schema.Struct({
    location: Schema.String,
    units: Schema.Literals(["celsius", "fahrenheit"])
  }),
  success: Schema.Struct({
    temperature: Schema.Number,
    condition: Schema.String,
    humidity: Schema.Number
  })
})
const result = [GetWeather.name, GetWeather.failureMode] // => ["GetWeather", "error"]
```

## ProviderDefined

**Defining a provider-defined web search tool**

```efx
import { Schema } from "effect"
import { Tool } from "effect/ai"

// Define a web search tool provided by OpenAI
const WebSearch = Tool.providerDefined({
  id: "openai.web_search",
  customName: "OpenAiWebSearch",
  providerName: "web_search",
  args: Schema.Struct({
    query: Schema.String
  }),
  success: Schema.Struct({
    results: Schema.Array(Schema.Struct({
      title: Schema.String,
      url: Schema.String,
      snippet: Schema.String
    }))
  })
})({ query: "Effect" })
const result = [WebSearch.name, WebSearch.providerName] // => ["OpenAiWebSearch", "web_search"]
```

## Dynamic

**Defining dynamic tools**

```efx
import { Schema } from "effect"
import { Tool } from "effect/ai"

// Dynamic tool with Effect Schema (typed)
const Calculator = Tool.dynamic("Calculator", {
  parameters: Schema.Struct({
    operation: Schema.Literals(["add", "subtract"]),
    a: Schema.Number,
    b: Schema.Number
  }),
  success: Schema.Number
})

// Dynamic tool with JSON Schema (untyped parameters)
const McpTool = Tool.dynamic("McpTool", {
  description: "Tool from MCP server",
  parameters: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"]
  }
})

const result = [Calculator.name, McpTool.name] // => ["Calculator", "McpTool"]
```

## isUserDefined

**Checking for user-defined tools**

```efx
import { Schema } from "effect"
import { Tool } from "effect/ai"

const UserDefinedTool = Tool.make("Calculator", {
  description: "Performs basic arithmetic operations",
  parameters: Schema.Struct({
    operation: Schema.Literals(["add", "subtract", "multiply", "divide"]),
    a: Schema.Number,
    b: Schema.Number
  }),
  success: Schema.Number
})

const ProviderDefinedTool = Tool.providerDefined({
  id: "openai.web_search",
  customName: "OpenAiWebSearch",
  providerName: "web_search",
  args: Schema.Struct({
    query: Schema.String
  }),
  success: Schema.Struct({
    results: Schema.Array(Schema.Struct({
      title: Schema.String,
      url: Schema.String,
      snippet: Schema.String
    }))
  })
})

const result = [Tool.isUserDefined(UserDefinedTool), Tool.isUserDefined(ProviderDefinedTool)] // => [true, false]
```

## isProviderDefined

**Checking for provider-defined tools**

```efx
import { Schema } from "effect"
import { Tool } from "effect/ai"

const UserDefinedTool = Tool.make("Calculator", {
  description: "Performs basic arithmetic operations",
  parameters: Schema.Struct({
    operation: Schema.Literals(["add", "subtract", "multiply", "divide"]),
    a: Schema.Number,
    b: Schema.Number
  }),
  success: Schema.Number
})

const ProviderDefinedTool = Tool.providerDefined({
  id: "openai.web_search",
  customName: "OpenAiWebSearch",
  providerName: "web_search",
  args: Schema.Struct({
    query: Schema.String
  }),
  success: Schema.Struct({
    results: Schema.Array(Schema.Struct({
      title: Schema.String,
      url: Schema.String,
      snippet: Schema.String
    }))
  })
})

const result = [Tool.isProviderDefined(UserDefinedTool), Tool.isProviderDefined(ProviderDefinedTool)] // => [false, false]
```

## isDynamic

**Checking for dynamic tools**

```efx
import { Schema } from "effect"
import { Tool } from "effect/ai"

const DynamicTool = Tool.dynamic("DynamicTool", {
  parameters: { type: "object", properties: {} }
})

const UserDefinedTool = Tool.make("Calculator", {
  parameters: Schema.Struct({ a: Schema.Number, b: Schema.Number }),
  success: Schema.Number
})

const result = [Tool.isDynamic(DynamicTool), Tool.isDynamic(UserDefinedTool)] // => [true, false]
```

## make

**Creating a tool without parameters**

```efx
import { Schema } from "effect"
import { Tool } from "effect/ai"

// Simple tool with no parameters
const GetCurrentTime = Tool.make("GetCurrentTime", {
  description: "Returns the current timestamp",
  success: Schema.Number
})
GetCurrentTime.name // => "GetCurrentTime"
```

## dynamic

**Creating a dynamic tool**

```efx
import { Schema } from "effect"
import { Tool } from "effect/ai"

// With Effect Schema (typed parameters)
const Calculator = Tool.dynamic("Calculator", {
  parameters: Schema.Struct({
    operation: Schema.Literals(["add", "subtract"]),
    a: Schema.Number,
    b: Schema.Number
  }),
  success: Schema.Number
})

// With JSON Schema (untyped parameters)
const McpTool = Tool.dynamic("McpTool", {
  description: "Tool from MCP server",
  parameters: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"]
  }
})

const result = [Calculator.name, McpTool.name] // => ["Calculator", "McpTool"]
```

## providerDefined

**Creating a provider-defined tool**

```efx
import { Schema } from "effect"
import { Tool } from "effect/ai"

// Web search tool provided by OpenAI
const WebSearch = Tool.providerDefined({
  id: "openai.web_search",
  customName: "OpenAiWebSearch",
  providerName: "web_search",
  args: Schema.Struct({
    query: Schema.String
  }),
  success: Schema.Struct({
    results: Schema.Array(Schema.Struct({
      title: Schema.String,
      url: Schema.String,
      content: Schema.String
    }))
  })
})({ query: "Effect" })
const result = [WebSearch.name, WebSearch.providerName] // => ["OpenAiWebSearch", "web_search"]
```

## getDescription

**Reading a tool description**

```efx
import { Tool } from "effect/ai"

const myTool = Tool.make("example", {
  description: "This is an example tool"
})

const description = Tool.getDescription(myTool)
description // => "This is an example tool"
```

## getJsonSchema

**Generating a tool JSON schema**

```efx
import { Schema } from "effect"
import { Tool } from "effect/ai"

const weatherTool = Tool.make("get_weather", {
  parameters: Schema.Struct({
    location: Schema.String,
    units: Schema.Literals(["celsius", "fahrenheit"])
  })
})

const jsonSchema = Tool.getJsonSchema(weatherTool)
jsonSchema.type // => "object"
if (typeof jsonSchema.properties === "object" && jsonSchema.properties !== null) {
  Object.keys(jsonSchema.properties) // => ["location", "units"]
}
```

## Title

**Annotating a tool title**

```efx
import { Context } from "effect"
import { Tool } from "effect/ai"

const myTool = Tool.make("calculate_tip")
  .annotate(Tool.Title, "Tip Calculator")
Context.getUnsafe(myTool.annotations, Tool.Title) // => "Tip Calculator"
```

## Meta

**Annotating MCP metadata**

```efx
import { Context } from "effect"
import { Tool } from "effect/ai"

const myCalculatorUi = Tool.make("calculator_ui", {})
  .annotate(Tool.Meta, { ui: { resourceUri: "ui://example/calculator-ui" } })
"ui" in Context.getUnsafe(myCalculatorUi.annotations, Tool.Meta) // => true
```

## Readonly

**Marking a tool as read-only**

```efx
import { Context } from "effect"
import { Tool } from "effect/ai"

const readOnlyTool = Tool.make("get_user_info")
  .annotate(Tool.Readonly, true)
Context.get(readOnlyTool.annotations, Tool.Readonly) // => true
```

## Destructive

**Marking a tool as non-destructive**

```efx
import { Context } from "effect"
import { Tool } from "effect/ai"

const safeTool = Tool.make("search_database")
  .annotate(Tool.Destructive, false)
Context.get(safeTool.annotations, Tool.Destructive) // => false
```

## Idempotent

**Marking a tool as idempotent**

```efx
import { Context } from "effect"
import { Tool } from "effect/ai"

const idempotentTool = Tool.make("get_current_time")
  .annotate(Tool.Idempotent, true)
Context.get(idempotentTool.annotations, Tool.Idempotent) // => true
```

## OpenWorld

**Disabling open-world access**

```efx
import { Context } from "effect"
import { Tool } from "effect/ai"

const restrictedTool = Tool.make("internal_operation")
  .annotate(Tool.OpenWorld, false)
Context.get(restrictedTool.annotations, Tool.OpenWorld) // => false
```

## Strict

**Disabling strict JSON schema mode**

```efx
import { Tool } from "effect/ai"

const flexibleTool = Tool.make("search")
  .annotate(Tool.Strict, false)
Tool.getStrictMode(flexibleTool) // => false
```
