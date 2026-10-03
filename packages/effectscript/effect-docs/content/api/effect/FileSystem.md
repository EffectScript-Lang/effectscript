# effect/FileSystem

The examples in the JSDoc of `packages/effect/src/FileSystem.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## FileSystem

**Accessing file system operations**

```efx
const fileSystem = FileSystem.makeNoop({
  exists: () => succeed(true),
  makeDirectory: () => Effect.void,
  stat: () => succeed({ size: ByteSize.bytes(22) } as FileSystem.File.Info),
  readFileString: () => succeed("{\"env\": \"development\"}")
})

const program = effect {
  const fs = await FileSystem

  // Basic file operations
  const exists = await fs.exists("./config.json")
  if (!exists) {
    await fs.writeFileString("./config.json", "{\"env\": \"development\"}")
  }

  // Directory operations
  await fs.makeDirectory("./logs", { recursive: true })

  // File information
  const stats = await fs.stat("./config.json")
  // Read the file contents
  const content = await fs.readFileString("./config.json")
  return { size: stats.size, content }
}

const result = runSync(provideService(program, FileSystem.FileSystem, fileSystem))
ByteSize.toBigInt(result.size) // => 22n
result.content // => "{\"env\": \"development\"}"
```

**Accessing and providing FileSystem**

```efx
const customFs = FileSystem.makeNoop({
  exists: () => succeed(true),
  readFileString: () => succeed("contents")
})

// Access the FileSystem service
const program = effect {
  const fs = await FileSystem

  const exists = await fs.exists("./data.txt")
  return exists ? await fs.readFileString("./data.txt") : undefined
}

const withCustomFs = provideService(
  program,
  FileSystem.FileSystem,
  customFs
)
runSync(withCustomFs) // => "contents"
```

## OpenFlag

**Opening files with flags**

```efx
import type { FileSystem } from "effect"

const flags: ReadonlyArray<FileSystem.OpenFlag> = ["r", "w", "a", "r+"]
flags // => ["r", "w", "a", "r+"]
```

## makeNoop

**Creating a no-op FileSystem**

```efx
// Create a test filesystem that only allows reading specific files
const testFs = FileSystem.makeNoop({
  readFileString: (path) => {
    if (path === "test-config.json") {
      return succeed("{\"test\": true}")
    }
    return fail(
      PlatformError.systemError({
        _tag: "NotFound",
        module: "FileSystem",
        method: "readFileString",
        description: "File not found",
        pathOrDescriptor: path
      })
    )
  },
  exists: (path) => succeed(path === "test-config.json")
})

// Use in tests
const program = effect {
  const content = await testFs.readFileString("test-config.json")
  return content
}

// Test with the no-op filesystem
const testProgram = provideService(
  program,
  FileSystem.FileSystem,
  testFs
)
runSync(testProgram) // => "{\"test\": true}"
```

## layerNoop

**Providing a no-op FileSystem layer**

```efx
// Create a test layer with specific behaviors
const testLayer = FileSystem.layerNoop({
  readFileString: (path) => succeed("mocked content"),
  exists: () => succeed(true)
})

const program = effect {
  const fs = await FileSystem
  const content = await fs.readFileString("any-file.txt")
  return content
}

// Provide the test layer
const testProgram = provide(program, testLayer)
runSync(testProgram) // => "mocked content"
```

## File

**Working with file handles**

```efx
const file: FileSystem.File = {
  [FileSystem.FileTypeId]: FileSystem.FileTypeId,
  stat: succeed({ size: ByteSize.bytes(5) } as FileSystem.File.Info),
  seek: () => succeed(BigInt(0)),
  sync: Effect.void,
  read: (buffer) => sync(() => {
    buffer.set([1, 2, 3, 4, 5])
    return 5
  }),
  readAlloc: () => succeed(Option.none()),
  truncate: () => Effect.void,
  write: (buffer) => succeed(buffer.length),
  writeAll: () => Effect.void
}

const program = effect {
  const stats = await file.stat
  const buffer = new Uint8Array(5)
  const bytesRead = await file.read(buffer)
  await file.writeAll(new TextEncoder().encode("Hello"))
  await file.sync
  return { size: stats.size, bytesRead, buffer: Array.from(buffer) }
}

const result = runSync(program)
ByteSize.toBigInt(result.size) // => 5n
result.bytesRead // => 5
result.buffer // => [1, 2, 3, 4, 5]
```

## File.Info

**Inspecting file information**

```efx
import { ByteSize, FileSystem, Option } from "effect"

const info: FileSystem.File.Info = {
  type: "File",
  mtime: Option.none(),
  atime: Option.none(),
  birthtime: Option.none(),
  dev: 1,
  ino: Option.none(),
  mode: 0o644,
  nlink: Option.none(),
  uid: Option.none(),
  gid: Option.none(),
  rdev: Option.none(),
  size: ByteSize.bytes(5),
  blksize: Option.none(),
  blocks: Option.none()
}

info.type // => "File"
ByteSize.toBigInt(info.size) // => 5n
info.mode.toString(8) // => "644"

const modified = Option.match(info.mtime, {
  onNone: () => "unavailable",
  onSome: (mtime) => mtime.toISOString()
})
modified // => "unavailable"
info.type === "File" // => true
```

## WatchBackend

**Providing a custom watch backend**

```efx
// Custom watch backend implementation
const customWatchBackend = {
  register: (path: string, stat: FileSystem.File.Info) => {
    // Implementation would depend on platform
    return Option.some(Stream.empty) // Placeholder implementation
  }
}

const program = effect {
  const backend = await FileSystem.WatchBackend
  return Option.isSome(
    backend.register("./directory", { type: "Directory" } as FileSystem.File.Info)
  )
}

const withCustomBackend = provideService(
  program,
  FileSystem.WatchBackend,
  customWatchBackend
)
runSync(withCustomBackend) // => true
```
