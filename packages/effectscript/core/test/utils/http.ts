/** Services `HttpApiTest` needs, as source text prepended to compiled test modules. */
export const httpTestPrelude = `
  import { Effect, FileSystem, Layer, Path } from "effect"
  import { Etag, HttpPlatform } from "effect/http"
  import { HttpApiBuilder, HttpApiTest } from "effect/http-api"
  const TestServices = Layer.mergeAll(Path.layer, Etag.layerWeak, HttpPlatform.layer).pipe(
    Layer.provideMerge(FileSystem.layerNoop({}))
  )
`
