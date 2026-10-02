# effect/ai/Tokenizer

The examples in the JSDoc of `packages/effect/src/ai/Tokenizer.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Tokenizer

**Accessing the Tokenizer service**

```efx

const useTokenizer = effect {
  const tokenizer = await Tokenizer.Tokenizer
  const tokens = await tokenizer.tokenize("Hello, world!")
  return tokens.length
}

const tokenizer = Tokenizer.make({
  tokenize: (prompt) => succeed(prompt.content.map((_, index) => index))
})
const result = useTokenizer |> provideService(Tokenizer.Tokenizer, tokenizer)
await runPromise(result) // => 1
```

## Service

**Implementing a custom tokenizer**

```efx
import type { Tokenizer } from "effect/ai"

const customTokenizer: Tokenizer.Service = {
  tokenize: (input) =>
    succeed(input.toString().split(" ").map((_, i) => i)),
  truncate: (input, maxTokens) =>
    succeed(Prompt.make(input.toString().slice(0, maxTokens * 5)))
}

const tokenCount = (await runPromise(customTokenizer.tokenize("one two three"))).length // => 3
const messageCount = (await runPromise(customTokenizer.truncate("hello world", 1))).content.length // => 1
```

## make

**Creating a word tokenizer**

```efx

// Simple word-based tokenizer
const wordTokenizer = Tokenizer.make({
  tokenize: (prompt) =>
    succeed(
      prompt.content
        .flatMap((msg) =>
          typeof msg.content === "string"
            ? msg.content.split(" ")
            : msg.content.flatMap((part) =>
              part.type === "text" ? part.text.split(" ") : []
            )
        )
        .map((_, index) => index)
    )
})

await runPromise(wordTokenizer.tokenize("hello effect world")) // => [0, 1, 2]
```
