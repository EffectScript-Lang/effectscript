# effect/ai/Toolkit

The examples in the JSDoc of `packages/effect/src/ai/Toolkit.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Toolkit

**Defining AI toolkits**

```efx
const SearchDocs = Tool.make("SearchDocs", {
  description: "Search project documentation",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.Array(Schema.String)
})

const SummarizeText = Tool.make("SummarizeText", {
  description: "Summarize text",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.String
})

const AiToolkit = Toolkit.make(SearchDocs, SummarizeText)

const ready = AiToolkit.pipe(provide(AiToolkit.toLayer({
  SearchDocs: ({ query }) => succeed([query]),
  SummarizeText: ({ text }) => succeed(text)
})))

Object.keys((await runPromise(ready)).tools) // => ["SearchDocs", "SummarizeText"]
```

## FailureOrigin

**Reading a handler failure's origin**

```efx
import { Tool } from "effect/ai"

const toolkit = Toolkit.make(Tool.make("Lookup", {
  failure: Schema.String,
  failureMode: "error"
}))

const program = effect {
  const handlers = await toolkit
  await handlers.handle("Lookup", {}).pipe(flatMap(Stream.runDrain))
}
  |> catchCause((cause) =>
    succeed(Context.get(Cause.annotations(cause), Toolkit.FailureOrigin))
  )
  |> provide(toolkit.toLayer({ Lookup: () => fail("Not found") }))

await runPromise(program) // => "handler"
```

## make

**Creating a toolkit**

```efx
const GetCurrentTime = Tool.make("GetCurrentTime", {
  description: "Get the current timestamp",
  success: Schema.Number
})

const GetWeather = Tool.make("get_weather", {
  description: "Get weather information",
  parameters: Schema.Struct({ location: Schema.String }),
  success: Schema.Struct({
    temperature: Schema.Number,
    condition: Schema.String
  })
})

const toolkit = Toolkit.make(GetCurrentTime, GetWeather)
const ready = toolkit.pipe(provide(toolkit.toLayer({
  GetCurrentTime: () => succeed(0),
  get_weather: () => succeed({ temperature: 20, condition: "clear" })
})))

Object.keys((await runPromise(ready)).tools) // => ["GetCurrentTime", "get_weather"]
```

## merge

**Merging toolkits**

```efx
const mathToolkit = Toolkit.make(
  Tool.make("add", { success: Schema.Number }),
  Tool.make("subtract", { success: Schema.Number })
)

const utilityToolkit = Toolkit.make(
  Tool.make("get_time", { success: Schema.Number }),
  Tool.make("get_weather", { success: Schema.String })
)

const combined = Toolkit.merge(mathToolkit, utilityToolkit)
const ready = combined.pipe(provide(combined.toLayer({
  add: () => succeed(1),
  subtract: () => succeed(0),
  get_time: () => succeed(0),
  get_weather: () => succeed("clear")
})))

Object.keys((await runPromise(ready)).tools) // => ["add", "subtract", "get_time", "get_weather"]
```
