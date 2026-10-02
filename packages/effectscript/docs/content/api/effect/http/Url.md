# effect/http/Url

The examples in the JSDoc of `packages/effect/src/http/Url.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## fromString

**Parsing absolute and relative URLs**

```efx
import { Result } from "effect"
import { Url } from "effect/http"

// Parse an absolute URL
//
//      ┌─── Result<URL, IllegalArgumentError>
//      ▼
const parsed = Url.fromString("https://example.com/path")

Result.map(parsed, (url) => url.toString()) // => Result.succeed("https://example.com/path")

// Parse a relative URL with a base
const relativeParsed = Url.fromString("/relative-path", "https://example.com")

Result.map(relativeParsed, (url) => url.toString()) // => Result.succeed("https://example.com/relative-path")
```

## mutate

**Mutating URL credentials**

```efx
import { Url } from "effect/http"

const myUrl = new URL("https://example.com")

const mutatedUrl = Url.mutate(myUrl, (url) => {
  url.username = "user"
  url.password = "pass"
})

mutatedUrl.toString() // => "https://user:pass@example.com/"
```

## setUrlParams

**Replacing query parameters**

```efx
import { Url, UrlParams } from "effect/http"

const myUrl = new URL("https://example.com?foo=bar")

// Write parameters
const updatedUrl = Url.setUrlParams(
  myUrl,
  UrlParams.fromInput([["key", "value"]])
)

updatedUrl.toString() // => "https://example.com/?key=value"
```

## urlParams

**Reading query parameters**

```efx
import { Url, UrlParams } from "effect/http"

const myUrl = new URL("https://example.com?foo=bar")

// Read parameters
const params = Url.urlParams(myUrl)

UrlParams.toString(params) // => "foo=bar"
```

## modifyUrlParams

**Modifying query parameters**

```efx
import { Url, UrlParams } from "effect/http"

const myUrl = new URL("https://example.com?foo=bar")

const changedUrl = Url.modifyUrlParams(myUrl, UrlParams.append("key", "value"))

changedUrl.toString() // => "https://example.com/?foo=bar&key=value"
```
