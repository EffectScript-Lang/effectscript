# effect/RequestResolver

The examples in the JSDoc of `packages/effect/src/RequestResolver.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## RequestResolver

**Defining a request resolver**

```efx
import { Effect, Exit, Request } from "effect"

interface GetUserRequest extends Request.Request<string, Error> {
  readonly _tag: "GetUserRequest"
  readonly id: number
}
const GetUserRequest = Request.tagged<GetUserRequest>("GetUserRequest")

// In practice, you would typically use RequestResolver.make() instead
const resolver = RequestResolver.make<GetUserRequest>((entries) =>
  sync(() => {
    for (const entry of entries) {
      entry.completeUnsafe(Exit.succeed(`User ${entry.request.id}`))
    }
  })
)

const program = request(GetUserRequest({ id: 1 }), resolver)
await runPromise(program) // => "User 1"
```

## make

**Creating a request resolver**

```efx
import { Effect, Exit, Request } from "effect"

// Define a request type
interface GetUserRequest extends Request.Request<string, Error> {
  readonly _tag: "GetUserRequest"
  readonly id: number
}
const GetUserRequest = Request.tagged<GetUserRequest>("GetUserRequest")

// Create a resolver that handles the requests
const UserResolver = RequestResolver.make<GetUserRequest>((entries) =>
  sync(() => {
    for (const entry of entries) {
      // Complete each request with a result
      entry.completeUnsafe(Exit.succeed(`User ${entry.request.id}`))
    }
  })
)

// Use the resolver to handle requests
const getUserEffect = request(GetUserRequest({ id: 123 }), UserResolver)
await runPromise(getUserEffect) // => "User 123"
```

## makeGrouped

**Grouping requests by key**

```efx
import { Effect, Exit, Request } from "effect"

interface GetUserByRole extends Request.Request<string, Error> {
  readonly _tag: "GetUserByRole"
  readonly role: string
  readonly id: number
}
const GetUserByRole = Request.tagged<GetUserByRole>("GetUserByRole")

const batches: Array<[role: string, size: number]> = []

// Group requests by role for efficient batch processing
const UserByRoleResolver = RequestResolver.makeGrouped<GetUserByRole, string>({
  key: ({ request }) => request.role,
  resolver: (entries, role) =>
    sync(() => {
      batches.push([role, entries.length])
      for (const entry of entries) {
        entry.completeUnsafe(
          Exit.succeed(`User ${entry.request.id} with role ${role}`)
        )
      }
    })
})

const program = all([
  Effect.request<GetUserByRole>(GetUserByRole({ role: "admin", id: 1 }), UserByRoleResolver),
  Effect.request<GetUserByRole>(GetUserByRole({ role: "admin", id: 2 }), UserByRoleResolver)
] as const, { concurrency: "unbounded" })
const result = await runPromise(program)

batches // => [["admin", 2]]
result // => ["User 1 with role admin", "User 2 with role admin"]
```

## fromFunction

**Creating a resolver from a pure function**

```efx
import { Effect, Request } from "effect"

interface GetSquareRequest extends Request.Request<number> {
  readonly _tag: "GetSquareRequest"
  readonly value: number
}
const GetSquareRequest = Request.tagged<GetSquareRequest>("GetSquareRequest")

// Create a resolver from a pure function
const SquareResolver = RequestResolver.fromFunction<GetSquareRequest>(
  (entry) => entry.request.value * entry.request.value
)

// Usage
const getSquareEffect = request(
  GetSquareRequest({ value: 5 }),
  SquareResolver
)
await runPromise(getSquareEffect) // => 25
```

## fromFunctionBatched

**Batching pure request handling**

```efx
import { Effect, Request } from "effect"

interface GetDoubleRequest extends Request.Request<number> {
  readonly _tag: "GetDoubleRequest"
  readonly value: number
}
const GetDoubleRequest = Request.tagged<GetDoubleRequest>("GetDoubleRequest")

// Create a resolver that processes multiple requests in a batch
const DoubleResolver = RequestResolver.fromFunctionBatched<GetDoubleRequest>(
  (entries) => entries.map((entry) => entry.request.value * 2)
)

// Usage with multiple requests
const effects = [1, 2, 3].map((value) =>
  request(GetDoubleRequest({ value }), DoubleResolver)
)
const batchedEffect = all(effects)
await runPromise(batchedEffect) // => [2, 4, 6]
```

## fromEffect

**Creating a resolver from an effectful function**

```efx
import { Effect, Request } from "effect"

interface GetUserFromAPIRequest extends Request.Request<string> {
  readonly _tag: "GetUserFromAPIRequest"
  readonly id: number
}
const GetUserFromAPIRequest = Request.tagged<GetUserFromAPIRequest>(
  "GetUserFromAPIRequest"
)

// Create a resolver that uses effects (like HTTP calls)
const UserAPIResolver = RequestResolver.fromEffect<GetUserFromAPIRequest>(
  (entry) => succeed(`User ${entry.request.id} from API`)
)

// Usage
const getUserEffect = request(
  GetUserFromAPIRequest({ id: 123 }),
  UserAPIResolver
)
await runPromise(getUserEffect) // => "User 123 from API"
```

## fromEffectTagged

**Handling tagged request batches**

```efx
import { Effect, Request } from "effect"

interface GetUser extends Request.Request<string, Error> {
  readonly _tag: "GetUser"
  readonly id: number
}

interface GetPost extends Request.Request<string, Error> {
  readonly _tag: "GetPost"
  readonly id: number
}

type MyRequest = GetUser | GetPost
const GetUser = Request.tagged<GetUser>("GetUser")
const GetPost = Request.tagged<GetPost>("GetPost")

// Create a resolver that handles different request types
const MyResolver = RequestResolver.fromEffectTagged<MyRequest>()({
  GetUser: (requests) =>
    succeed(requests.map((req) => `User ${req.request.id}`)),
  GetPost: (requests) =>
    succeed(requests.map((req) => `Post ${req.request.id}`))
})

const program = all([
  request<GetUser>(GetUser({ id: 1 }), MyResolver),
  request<GetPost>(GetPost({ id: 2 }), MyResolver)
] as const)
await runPromise(program) // => ["User 1", "Post 2"]
```

## setDelayEffect

**Setting an effectful batch delay**

```efx
import { Effect, Exit, Request } from "effect"

interface GetDataRequest extends Request.Request<string> {
  readonly _tag: "GetDataRequest"
}
const GetDataRequest = Request.tagged<GetDataRequest>("GetDataRequest")

const resolver = RequestResolver.make<GetDataRequest>((entries) =>
  sync(() => {
    for (const entry of entries) {
      entry.completeUnsafe(Exit.succeed("data"))
    }
  })
)

let delayRan = false

// Set a custom delay effect
const resolverWithCustomDelay = RequestResolver.setDelayEffect(
  resolver,
  sync(() => {
    delayRan = true
  })
)

await runPromise(resolverWithCustomDelay.delay)
Array.of(delayRan, RequestResolver.isRequestResolver(resolverWithCustomDelay)) // => [true, true]
```

## setDelay

**Setting a batch delay**

```efx
import { Effect, Exit, Request } from "effect"

interface GetDataRequest extends Request.Request<string> {
  readonly _tag: "GetDataRequest"
}
const GetDataRequest = Request.tagged<GetDataRequest>("GetDataRequest")

const resolver = RequestResolver.make<GetDataRequest>((entries) =>
  sync(() => {
    for (const entry of entries) {
      entry.completeUnsafe(Exit.succeed("data"))
    }
  })
)

// Add a 100ms delay to batch requests together
const delayedResolver = RequestResolver.setDelay(resolver, "100 millis")

const program = request(GetDataRequest(), delayedResolver)
await runPromise(program) // => "data"
```

## around

**Running effects around request resolution**

```efx
import { Effect, Exit, Request } from "effect"

interface GetDataRequest extends Request.Request<string> {
  readonly _tag: "GetDataRequest"
}
const GetDataRequest = Request.tagged<GetDataRequest>("GetDataRequest")

const events: Array<string> = []

const resolver = RequestResolver.make<GetDataRequest>((entries) =>
  sync(() => {
    for (const entry of entries) {
      entry.completeUnsafe(Exit.succeed("data"))
    }
  })
)

// Add setup and cleanup around request execution
const resolverWithAround = RequestResolver.around(
  resolver,
  (entries) =>
    effect {
      events.push(`Starting batch of ${entries.length} requests`)
      return entries.length
    },
  (entries, initialSize) =>
    sync(() => {
      events.push(`Batch completed with ${entries.length} requests (started with ${initialSize})`)
    })
)

const program = request(GetDataRequest(), resolverWithAround)
const result = await runPromise(program)

events // => ["Starting batch of 1 requests", "Batch completed with 1 requests (started with 1)"]
result // => "data"
```

## batchN

**Limiting parallel request batches**

```efx
import { Effect, Exit, Request } from "effect"

interface GetDataRequest extends Request.Request<string> {
  readonly _tag: "GetDataRequest"
  readonly id: number
}
const GetDataRequest = Request.tagged<GetDataRequest>("GetDataRequest")

const batchSizes: Array<number> = []

const resolver = RequestResolver.make<GetDataRequest>((entries) =>
  sync(() => {
    batchSizes.push(entries.length)
    for (const entry of entries) {
      entry.completeUnsafe(Exit.succeed(`data-${entry.request.id}`))
    }
  })
)

// Limit batches to maximum 5 requests
const limitedResolver = RequestResolver.batchN(resolver, 5)

// When more than 5 requests are made, they'll be split into multiple batches
const requests = Array.from(
  { length: 12 },
  (_, i) => request(GetDataRequest({ id: i }), limitedResolver)
)

const result = await runPromise(all(requests, { concurrency: "unbounded" }))
batchSizes // => [5, 5, 2]

result.length // => 12

Array.of(result[0], result[11]) // => ["data-0", "data-11"]
```

## grouped

**Grouping resolver requests**

```efx
import { Effect, Exit, Request } from "effect"

interface GetUserRequest extends Request.Request<string> {
  readonly _tag: "GetUserRequest"
  readonly userId: number
  readonly department: string
}
const GetUserRequest = Request.tagged<GetUserRequest>("GetUserRequest")

const batchSizes: Array<number> = []

const resolver = RequestResolver.make<GetUserRequest>((entries) =>
  sync(() => {
    batchSizes.push(entries.length)
    for (const entry of entries) {
      entry.completeUnsafe(Exit.succeed(`User ${entry.request.userId}`))
    }
  })
)

// Group requests by department for more efficient processing
const groupedResolver = RequestResolver.grouped(
  resolver,
  ({ request }) => request.department
)

// Requests for the same department will be batched together
const requests = [
  Effect.request(
    GetUserRequest({ userId: 1, department: "Engineering" }),
    groupedResolver
  ),
  Effect.request(
    GetUserRequest({ userId: 2, department: "Engineering" }),
    groupedResolver
  ),
  Effect.request(
    GetUserRequest({ userId: 3, department: "Marketing" }),
    groupedResolver
  )
]

const result = await runPromise(all(requests, { concurrency: "unbounded" }))
batchSizes.sort()

batchSizes // => [1, 2]

result // => ["User 1", "User 2", "User 3"]
```

## race

**Racing request resolvers**

```efx
import { Effect, Exit, Request } from "effect"

interface GetDataRequest extends Request.Request<string> {
  readonly _tag: "GetDataRequest"
  readonly id: number
}
const GetDataRequest = Request.tagged<GetDataRequest>("GetDataRequest")

// Fast resolver (simulating cache)
const fastResolver = RequestResolver.make<GetDataRequest>((entries) =>
  effect {
    await sleep("10 millis")
    for (const entry of entries) {
      entry.completeUnsafe(Exit.succeed(`fast-${entry.request.id}`))
    }
  }
)

// Slow resolver (simulating database)
const slowResolver = RequestResolver.make<GetDataRequest>((entries) =>
  effect {
    await sleep("100 millis")
    for (const entry of entries) {
      entry.completeUnsafe(Exit.succeed(`slow-${entry.request.id}`))
    }
  }
)

// Race resolvers - will use whichever completes first
const racingResolver = RequestResolver.race(fastResolver, slowResolver)
const program = request(GetDataRequest({ id: 1 }), racingResolver)
await runPromise(program) // => "fast-1"
```

## withSpan

**Adding a tracing span**

```efx
import { Effect, Exit, Request } from "effect"

interface GetDataRequest extends Request.Request<string> {
  readonly _tag: "GetDataRequest"
  readonly id: number
}
const GetDataRequest = Request.tagged<GetDataRequest>("GetDataRequest")

const resolver = RequestResolver.make<GetDataRequest>((entries) =>
  sync(() => {
    for (const entry of entries) {
      entry.completeUnsafe(Exit.succeed(`data-${entry.request.id}`))
    }
  })
)

// Add tracing span with custom name and attributes
const tracedResolver = RequestResolver.withSpan(
  resolver,
  "user-data-resolver",
  {
    attributes: {
      "resolver.type": "user-data",
      "resolver.version": "1.0"
    }
  }
)

// Spans will automatically include batch size and request links
const effect = request(GetDataRequest({ id: 123 }), tracedResolver)
await runPromise(effect) // => "data-123"
```
