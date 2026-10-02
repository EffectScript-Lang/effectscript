# effect/Console

The examples in the JSDoc of `packages/effect/src/Console.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Console

**Accessing the current console**

```efx

const messages: Array<unknown> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  log: (...args: ReadonlyArray<unknown>) => messages.push(...args)
})
const program = Console.consoleWith((console) =>
  sync(() => {
    console.log("Hello from current console!")
  })
)

runSync(provideService(program, Console.Console, testConsole))
messages // => ["Hello from current console!"]
```

## consoleWith

**Accessing the current console service**

```efx

const messages: Array<unknown> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  log: (...args: ReadonlyArray<unknown>) => messages.push(...args),
  error: (...args: ReadonlyArray<unknown>) => messages.push(...args)
})
const program = Console.consoleWith((console) =>
  sync(() => {
    console.log("Hello, world!")
    console.error("This is an error message")
  })
)

runSync(provideService(program, Console.Console, testConsole))
messages // => ["Hello, world!", "This is an error message"]
```

## assert

**Logging failed assertions**

```efx

const errors: Array<unknown> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  assert: (condition: boolean, ...args: ReadonlyArray<unknown>) => {
    if (!condition) errors.push(...args)
  }
})
const program = effect {
  await Console.assert(2 + 2 === 4, "Math is working correctly")
  await Console.assert(2 + 2 === 5, "This will be logged as an error")
}

runSync(provideService(program, Console.Console, testConsole))
errors // => ["This will be logged as an error"]
```

## clear

**Clearing console output**

```efx

const operations: Array<string> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  log: (message: string) => operations.push(`log:${message}`),
  clear: () => operations.push("clear")
})
const program = effect {
  await Console.log("This will be cleared")
  await Console.clear
  await Console.log("This appears after clearing")
}

runSync(provideService(program, Console.Console, testConsole))
operations // => ["log:This will be cleared", "clear", "log:This appears after clearing"]
```

## count

**Counting repeated calls**

```efx

const counters = new Map<string, number>()
const messages: Array<string> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  count: (label = "default") => {
    const count = (counters.get(label) ?? 0) + 1
    counters.set(label, count)
    messages.push(`${label}: ${count}`)
  }
})
const program = effect {
  await Console.count("my-counter")
  await Console.count("my-counter")
  await Console.count()
}

runSync(provideService(program, Console.Console, testConsole))
messages // => ["my-counter: 1", "my-counter: 2", "default: 1"]
```

## countReset

**Resetting a counter**

```efx

const counters = new Map<string, number>()
const messages: Array<string> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  count: (label = "default") => {
    const count = (counters.get(label) ?? 0) + 1
    counters.set(label, count)
    messages.push(`${label}: ${count}`)
  },
  countReset: (label = "default") => counters.set(label, 0)
})
const program = effect {
  await Console.count("my-counter")
  await Console.count("my-counter")
  await Console.countReset("my-counter")
  await Console.count("my-counter")
}

runSync(provideService(program, Console.Console, testConsole))
messages // => ["my-counter: 1", "my-counter: 2", "my-counter: 1"]
```

## debug

**Writing debug messages**

```efx

const messages: Array<ReadonlyArray<unknown>> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  debug: (...args: ReadonlyArray<unknown>) => messages.push(args)
})
const program = effect {
  await Console.debug("Debug info:", { userId: 123, action: "login" })
  await Console.debug("Processing step", 1, "of", 5)
}

runSync(provideService(program, Console.Console, testConsole))
messages // => [["Debug info:", { userId: 123, action: "login" }], ["Processing step", 1, "of", 5]]
```

## dir

**Inspecting an object**

```efx

const inspected: Array<unknown> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  dir: (item: unknown, options?: unknown) => inspected.push([item, options])
})
const program = effect {
  const obj = { name: "John", age: 30, nested: { city: "New York" } }
  await Console.dir(obj)
  await Console.dir(obj, { depth: 2 })
}

runSync(provideService(program, Console.Console, testConsole))
const expected = [
  [{ name: "John", age: 30, nested: { city: "New York" } }, undefined],
  [{ name: "John", age: 30, nested: { city: "New York" } }, { depth: 2 }]
]
inspected // => expected
```

## dirxml

**Inspecting XML-like data**

```efx

const messages: Array<unknown> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  dirxml: (...args: ReadonlyArray<unknown>) => messages.push(...args)
})
const program = effect {
  await Console.dirxml("<user id=\"1\">Ada</user>")
}

runSync(provideService(program, Console.Console, testConsole))
messages // => ["<user id=\"1\">Ada</user>"]
```

## error

**Writing error messages**

```efx

const messages: Array<ReadonlyArray<unknown>> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  error: (...args: ReadonlyArray<unknown>) => messages.push(args)
})
const program = effect {
  await Console.error("Something went wrong!")
  await Console.error("Error details:", {
    code: 500,
    message: "Internal Server Error"
  })
}

runSync(provideService(program, Console.Console, testConsole))
const expected = [
  ["Something went wrong!"],
  ["Error details:", { code: 500, message: "Internal Server Error" }]
]
messages // => expected
```

## group

**Grouping scoped output**

```efx

const operations: Array<string> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  group: (label?: string) => operations.push(`group:${label}`),
  groupEnd: () => operations.push("groupEnd"),
  log: (message: string) => operations.push(`log:${message}`)
})
const program = effect {
  await scoped(
    effect {
      await Console.group({ label: "User Processing" })
      await Console.log("Loading user data...")
      await Console.log("Validating user...")
      await Console.log("User processed successfully")
    }
  )
}

runSync(provideService(program, Console.Console, testConsole))
const expected = [
  "group:User Processing",
  "log:Loading user data...",
  "log:Validating user...",
  "log:User processed successfully",
  "groupEnd"
]
operations // => expected
```

## info

**Writing informational messages**

```efx

const messages: Array<ReadonlyArray<unknown>> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  info: (...args: ReadonlyArray<unknown>) => messages.push(args)
})
const program = effect {
  await Console.info("Application started successfully")
  await Console.info("Server configuration:", {
    port: 3000,
    env: "development"
  })
}

runSync(provideService(program, Console.Console, testConsole))
const expected = [
  ["Application started successfully"],
  ["Server configuration:", { port: 3000, env: "development" }]
]
messages // => expected
```

## log

**Writing log messages**

```efx

const messages: Array<ReadonlyArray<unknown>> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  log: (...args: ReadonlyArray<unknown>) => messages.push(args)
})
const program = effect {
  await Console.log("Hello, world!")
  await Console.log("User data:", { name: "John", age: 30 })
  await Console.log("Processing", 42, "items")
}

runSync(provideService(program, Console.Console, testConsole))
const expected = [
  ["Hello, world!"],
  ["User data:", { name: "John", age: 30 }],
  ["Processing", 42, "items"]
]
messages // => expected
```

## table

**Displaying tabular data**

```efx

const calls: Array<unknown> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  table: (data: ReadonlyArray<unknown>, properties?: ReadonlyArray<string>) => {
    calls.push({ rows: data.length, properties })
  }
})

const program = effect {
  const users = [
    { name: "John", age: 30, city: "New York" },
    { name: "Jane", age: 25, city: "London" },
    { name: "Bob", age: 35, city: "Paris" }
  ]
  await Console.table(users)
  await Console.table(users, ["name", "age"]) // Only show specific columns
}

runSync(provideService(program, Console.Console, testConsole))
calls // => [{ rows: 3, properties: undefined }, { rows: 3, properties: ["name", "age"] }]
```

## time

**Timing scoped work**

```efx

const operations: Array<string> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  time: (label?: string) => operations.push(`start:${label}`),
  timeEnd: (label?: string) => operations.push(`end:${label}`),
  log: (message: string) => operations.push(`log:${message}`)
})

const program = effect {
  await scoped(
    effect {
      await Console.time("operation-timer")
      await Console.log("Operation completed")
      // Timer ends automatically when scope closes
    }
  )
}

runSync(provideService(program, Console.Console, testConsole))
operations // => ["start:operation-timer", "log:Operation completed", "end:operation-timer"]
```

## timeLog

**Logging timer progress**

```efx

const operations: Array<unknown> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  time: (label?: string) => operations.push(["start", label]),
  timeLog: (label?: string, ...args: ReadonlyArray<unknown>) => operations.push(["log", label, ...args]),
  timeEnd: (label?: string) => operations.push(["end", label])
})

const program = effect {
  await scoped(
    effect {
      await Console.time("long-operation")
      await Console.timeLog("long-operation", "Halfway done")
      // Timer ends when scope closes
    }
  )
}

runSync(provideService(program, Console.Console, testConsole))
operations // => [["start", "long-operation"], ["log", "long-operation", "Halfway done"], ["end", "long-operation"]]
```

## trace

**Writing stack traces**

```efx

const traces: Array<ReadonlyArray<unknown>> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  trace: (...args: ReadonlyArray<unknown>) => traces.push(args)
})

const program = effect {
  await Console.trace("Debug trace point")
  await Console.trace("Function call:", { functionName: "processData" })
}

runSync(provideService(program, Console.Console, testConsole))
traces // => [["Debug trace point"], ["Function call:", { functionName: "processData" }]]
```

## warn

**Writing warning messages**

```efx

const messages: Array<ReadonlyArray<unknown>> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  warn: (...args: ReadonlyArray<unknown>) => messages.push(args)
})
const program = effect {
  await Console.warn("This feature is deprecated")
  await Console.warn("Performance warning:", {
    slowQuery: "SELECT * FROM large_table"
  })
}

runSync(provideService(program, Console.Console, testConsole))
const expected = [
  ["This feature is deprecated"],
  ["Performance warning:", { slowQuery: "SELECT * FROM large_table" }]
]
messages // => expected
```

## withGroup

**Wrapping an effect in a group**

```efx

const operations: Array<string> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  group: (label?: string) => operations.push(`group:${label}`),
  groupEnd: () => operations.push("groupEnd"),
  log: (message: string) => operations.push(`log:${message}`)
})
const program = effect {
  await Console.withGroup(
    effect {
      await Console.log("Step 1: Initialize")
      await Console.log("Step 2: Process")
      await Console.log("Step 3: Complete")
    },
    { label: "Processing Steps", collapsed: false }
  )
}

runSync(provideService(program, Console.Console, testConsole))
const expected = [
  "group:Processing Steps",
  "log:Step 1: Initialize",
  "log:Step 2: Process",
  "log:Step 3: Complete",
  "groupEnd"
]
operations // => expected
```

## withTime

**Timing an effect**

```efx

const operations: Array<string> = []
const testConsole: Console.Console = Object.assign(Object.create(console), {
  time: (label?: string) => operations.push(`start:${label}`),
  timeEnd: (label?: string) => operations.push(`end:${label}`),
  log: (message: string) => operations.push(`log:${message}`)
})

const program = effect {
  await Console.withTime(
    effect {
      await Console.log("Operation completed")
    },
    "my-operation"
  )
}

runSync(provideService(program, Console.Console, testConsole))
operations // => ["start:my-operation", "log:Operation completed", "end:my-operation"]
```
