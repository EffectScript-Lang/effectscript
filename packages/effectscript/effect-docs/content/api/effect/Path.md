# effect/Path

The examples in the JSDoc of `packages/effect/src/Path.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Path

**Using path operations**

```efx

const program = effect {
  const path = await Path

  return {
    joined: path.join("home", "user", "documents"),
    normalized: path.normalize("./path/../to/file.txt"),
    basename: path.basename("/path/to/file.txt"),
    dirname: path.dirname("/path/to/file.txt"),
    extname: path.extname("file.txt"),
    isAbsolute: path.isAbsolute("/absolute/path"),
    name: path.parse("/path/to/file.txt").name,
    relative: path.relative("/from/path", "/to/path"),
    resolved: path.resolve("/base", "relative", "path")
  }
}

const result = runSync(provide(program, Path.layer))
result.joined // => "home/user/documents"
result.normalized // => "to/file.txt"
result.basename // => "file.txt"
result.dirname // => "/path/to"
result.extname // => ".txt"
result.isAbsolute // => true
result.name // => "file"
result.relative // => "../../to/path"
result.resolved // => "/base/relative/path"
```

**Working with parsed paths**

```efx

// Access types and utilities in the Path namespace
const program = effect {
  const path = await Path

  // Parse a path and get a Path.Parsed object
  const parsed = path.parse("/home/user/file.txt")

  // The parsed object conforms to the Path.Parsed interface
  const exampleParsed = {
    root: "/",
    dir: "/home/user",
    base: "file.txt",
    ext: ".txt",
    name: "file"
  }

  return [parsed.base, exampleParsed.base]
}

runSync(provide(program, Path.layer)) // => ["file.txt", "file.txt"]
```

## Path.Parsed

**Parsing and formatting paths**

```efx

const program = effect {
  const path = await Path

  // Parse a path into its components
  const parsed = path.parse("/home/user/documents/file.txt")
  // Format a path from its components
  const formatted = path.format({
    dir: "/home/user",
    name: "newfile",
    ext: ".ts"
  })
  return { dir: parsed.dir, base: parsed.base, formatted }
}

const result = runSync(provide(program, Path.layer))
result.dir // => "/home/user/documents"
result.base // => "file.txt"
result.formatted // => "/home/user/newfile.ts"
```

## Path

**Providing a custom Path service**

```efx

// Create a custom path implementation
const customPath: Path = {
  [Path.TypeId]: Path.TypeId,
  sep: "/",
  basename: (path: string, suffix?: string) => {
    const base = path.split("/").pop() || ""
    return suffix && base.endsWith(suffix)
      ? base.slice(0, -suffix.length)
      : base
  },
  dirname: (path: string) => path.split("/").slice(0, -1).join("/") || "/",
  extname: (path: string) => {
    const match = path.match(/\.[^.]*$/)
    return match ? match[0] : ""
  },
  format: (pathObject) => {
    const dir = pathObject.dir || ""
    const name = pathObject.name || ""
    const ext = pathObject.ext || ""
    return dir ? `${dir}/${name}${ext}` : `${name}${ext}`
  },
  fromFileUrl: (url: URL) => succeed(url.pathname),
  isAbsolute: (path: string) => path.startsWith("/"),
  join: (...paths: ReadonlyArray<string>) => paths.join("/"),
  normalize: (path: string) => path.replace(/\/+/g, "/"),
  parse: (path: string) => ({
    root: path.startsWith("/") ? "/" : "",
    dir: path.split("/").slice(0, -1).join("/") || "/",
    base: path.split("/").pop() || "",
    ext: path.match(/\.[^.]*$/)?.[0] || "",
    name: path.split("/").pop()?.replace(/\.[^.]*$/, "") || ""
  }),
  relative: (from: string, to: string) => to.replace(from, ""),
  resolve: (...pathSegments: ReadonlyArray<string>) => pathSegments.join("/"),
  toFileUrl: (path: string) => succeed(new URL(`file://${path}`)),
  toNamespacedPath: (path: string) => path
}

// Provide the path service
const customPathLayer = Layer.succeed(Path.Path)(customPath)

const program = effect {
  const path = await Path
  return path.join("home", "user", "file.txt")
}

// Run with custom path implementation
runSync(provide(program, customPathLayer)) // => "home/user/file.txt"
```
