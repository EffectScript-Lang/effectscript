# effect/http/HttpStaticServer

The examples in the JSDoc of `packages/effect/src/http/HttpStaticServer.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## make

**Serving files from a directory**

```efx
const TestFileSystem = FileSystem.layerNoop({
  stat: () =>
    succeed({
      type: "File",
      size: ByteSize.bytes(20)
    } as FileSystem.File.Info)
})
const TestHttpPlatform = Layer.succeed(
  HttpPlatform.HttpPlatform,
  HttpPlatform.HttpPlatform.of({
    platform: "web",
    fileResponse: (path) => succeed(HttpServerResponse.text(`Serving ${path}`)),
    fileWebResponse: () => die("unused")
  })
)
layer TestServices = Path.layer & TestFileSystem & TestHttpPlatform

const program = effect {
  const app = await HttpStaticServer.make({ root: "/public" })
  const handler = HttpEffect.toWebHandler(app)
  const response = await promise(() => handler(new Request("http://localhost/guide.txt")))
  const body = await promise(() => response.text())
  return body
} |> provide(TestServices)

await runPromise(program) // => "Serving /public/guide.txt"
```

## layer

**Mounting static files on a router**

```efx
const ApiLayer = HttpRouter.add("GET", "/health", HttpServerResponse.text("ok"))

const StaticFilesLayer = HttpStaticServer.layer({
  root: "./public",
  prefix: "/static"
})

layer AppLayer = ApiLayer & StaticFilesLayer
Layer.isLayer(AppLayer) // => true
```
