# EffectScript syntax, construct by construct

Generated from the compiler's test fixtures (`pnpm codegen`). Each example shows the
EffectScript and the TypeScript it compiles to, which the golden tests check. Read the
EffectScript to learn the form; read the TypeScript to see exactly what it means.

## `effect` functions, blocks, `await` and `throw`

<!-- fixtures/effect -->

### Await precedence

```efx
declare const a: Effect.Effect<number>
declare const b: Effect.Effect<boolean>
declare const s: Effect.Effect<{ readonly length: number }>
declare const maybe: number | undefined

effect precedence() {
  const sum = await a + 1
  const not = !await b
  const cast = await a as number
  const member = (await s).length
  const call = String(await a)
  const nullish = maybe ?? await a
  const cond = await b ? 1 : 2
  return [sum, not, cast, member, call, nullish, cond]
}
```

Compiles to:

```ts
import { Effect } from "effect"
declare const a: Effect.Effect<number>
declare const b: Effect.Effect<boolean>
declare const s: Effect.Effect<{ readonly length: number }>
declare const maybe: number | undefined

const precedence = Effect.fn("precedence")(function*() {
  const sum = (yield* a) + 1
  const not = !(yield* b)
  const cast = (yield* a) as number
  const member = (yield* s).length
  const call = String(yield* a)
  const nullish = maybe ?? (yield* a)
  const cond = (yield* b) ? 1 : 2
  return [sum, not, cast, member, call, nullish, cond]
})
```

### Blocks

```efx
declare const task: Effect.Effect<number>

export const program = effect {
  const n = await task
  return n + 1
}

class Counter {
  count = 0
  readonly increment = effect {
    this.count++
    return this.count
  }
}

export const add = effect (n: number) => (await task) + n
export const addAll = effect (xs: ReadonlyArray<number>): number => {
  let total = 0
  for (const x of xs) total += x + (await task)
  return total
}
export const typed = effect (s: string): string throws never => s.trim()

export const api = {
  effect fetch(id: string) {
    return id.length + (await task)
  },
  plain() {
    return 1
  }
}
```

Compiles to:

```ts
import { Effect } from "effect"
declare const task: Effect.Effect<number>

export const program = Effect.gen(function*() {
  const n = yield* task
  return n + 1
})

class Counter {
  count = 0
  readonly increment = Effect.gen({ self: this }, function*() {
    this.count++
    return this.count
  })
}

export const add = Effect.fnUntraced(function*(n: number) {
  return (yield* task) + n
})
export const addAll = Effect.fnUntraced(function*(xs: ReadonlyArray<number>): Effect.fn.Return<number> {
  let total = 0
  for (const x of xs) total += x + (yield* task)
  return total
})
export const typed = Effect.fnUntraced(function*(s: string): Effect.fn.Return<string, never> {
  return s.trim()
})

export const api = {
  fetch: Effect.fn("fetch")(function*(id: string) {
    return id.length + (yield* task)
  }),
  plain() {
    return 1
  }
}
```

### Boundaries

```efx
effect outer() {
  const plain = [1, 2].map((n) => n + 1)
  const promise = async () => {
    await Promise.resolve(1)
  }
  function named() {
    throw new Error("still JS")
  }
  return { plain, promise, named }
}

const notEffect = async () => await Promise.resolve(2)
```

Compiles to:

```ts
import { Effect } from "effect"
const outer = Effect.fn("outer")(function*() {
  const plain = [1, 2].map((n) => n + 1)
  const promise = async () => {
    await Promise.resolve(1)
  }
  function named() {
    throw new Error("still JS")
  }
  return { plain, promise, named }
})

const notEffect = async () => await Promise.resolve(2)
```

### Class methods

```efx
export class Counter {
  #count = 0

  effect bump(by: number): number {
    this.#count += by
    console.log(`count is ${this.#count}`)
    return this.#count
  }

  effect reset() {
    await sleep("1 millis")
  }
}
```

Compiles to:

```ts
import { Effect } from "effect"
export class Counter {
  #count = 0

  bump(by: number): Effect.Effect<number> {
    return Effect.gen({ self: this }, function*() {
      this.#count += by
      yield* Effect.log(`count is ${this.#count}`)
      return this.#count
    }).pipe(Effect.withSpan("Counter.bump"))
  }

  reset() {
    return Effect.gen(function*() {
      yield* Effect.sleep("1 millis")
    }).pipe(Effect.withSpan("Counter.reset"))
  }
}
```

### Comments

```efx
declare const task: Effect.Effect<number>

/** Doubles the task result. */
export effect /* inline */ doubled(): number {
  // leading comment
  const n = await /* why */ task
  return n * 2 // trailing
}
```

Compiles to:

```ts
import { Effect } from "effect"
declare const task: Effect.Effect<number>

/** Doubles the task result. */
export const doubled = Effect.fn("doubled")(function*/* inline */ (): Effect.fn.Return<number> {
  // leading comment
  const n = yield* /* why */ task
  return n * 2 // trailing
})
```

### Concurrency

```efx
declare const a: Effect.Effect<number>
declare const b: Effect.Effect<string>

effect both() {
  const [n, s] = await [a, b]
  const { x, y } = await { x: a, y: b }
  return `${n}${s}${x}${y}`
}
```

Compiles to:

```ts
import { Effect } from "effect"
declare const a: Effect.Effect<number>
declare const b: Effect.Effect<string>

const both = Effect.fn("both")(function*() {
  const [n, s] = yield* Effect.all([a, b], { concurrency: "unbounded" })
  const { x, y } = yield* Effect.all({ x: a, y: b }, { concurrency: "unbounded" })
  return `${n}${s}${x}${y}`
})
```

### Declaration

```efx
import { Data } from "effect"

class NotFound extends Data.TaggedError("NotFound")<{ readonly id: string }> {}

declare const lookup: (id: string) => Effect.Effect<string, NotFound>

export effect getName(id: string): string throws NotFound {
  const name = await lookup(id)
  return name.toUpperCase()
}

effect helper(n: number) {
  return n * 2
}
```

Compiles to:

```ts
import { Data, Effect } from "effect"

class NotFound extends Data.TaggedError("NotFound")<{ readonly id: string }> {}

declare const lookup: (id: string) => Effect.Effect<string, NotFound>

export const getName = Effect.fn("getName")(function*(id: string): Effect.fn.Return<string, NotFound> {
  const name = yield* lookup(id)
  return name.toUpperCase()
})

const helper = Effect.fn("helper")(function*(n: number) {
  return n * 2
})
```

### Export default

```efx
declare const task: Effect.Effect<number>

export default effect main() {
  return await task
}
```

Compiles to:

```ts
import { Effect } from "effect"
declare const task: Effect.Effect<number>

const main = Effect.fn("main")(function*() {
  return yield* task
})
export default main
```

### Pipes

```efx
declare const task: Effect.Effect<number, string>

export effect resilient() {
  return await task
} |> Effect.retry({ times: 2 })
  |> Effect.orElseSucceed(() => 0)
```

Compiles to:

```ts
import { Effect } from "effect"
declare const task: Effect.Effect<number, string>

export const resilient = Effect.fn("resilient")(
  function*() {
    return yield* task
  },
  Effect.retry({ times: 2 }),
  Effect.orElseSucceed(() => 0)
)
```

### Streams

```efx
error Exhausted { after: number }

export effect* countdown(from: number): number {
  for (let i = from; i > 0; i--) {
    yield i
    await sleep("10 millis")
  }
}

effect* naturals(limit: number): number throws Exhausted {
  let n = 0
  while (true) {
    if (n === limit) throw new Exhausted({ after: n })
    yield n++
  }
}

// a plain generator is still JavaScript's
function* letters() {
  yield "a"
}
```

Compiles to:

```ts
import { Effect, Queue, Schema, Stream } from "effect"
class Exhausted extends Schema.TaggedError<Exhausted>()("Exhausted", { after: Schema.Number }) {}

export const countdown = (from: number): Stream.Stream<number> =>
  Stream.callback((queue) =>
    Effect.gen(function*() {
      for (let i = from; i > 0; i--) {
        yield* Queue.offer(queue, i)
        yield* Effect.sleep("10 millis")
      }
    }).pipe(Queue.into(queue)), { bufferSize: 1 })

const naturals = (limit: number): Stream.Stream<number, Exhausted> =>
  Stream.callback((queue) =>
    Effect.gen(function*() {
      let n = 0
      while (true) {
        if (n === limit) return yield* new Exhausted({ after: n })
        yield* Queue.offer(queue, n++)
      }
    }).pipe(Queue.into(queue)), { bufferSize: 1 })

// a plain generator is still JavaScript's
function* letters() {
  yield "a"
}
```

### Throw

```efx
import { Data } from "effect"

class Invalid extends Data.TaggedError("Invalid")<{}> {}
class Zero extends Data.TaggedError("Zero")<{}> {}

effect check(n: number): number throws Invalid | Zero {
  if (n < 0) throw new Invalid()
  if (n === 0) {
    throw new Zero()
  }
  const parse = (s: string) => {
    if (s === "") throw new Error("plain JS throw")
    return Number(s)
  }
  return parse(String(n))
}
```

Compiles to:

```ts
import { Data, Effect } from "effect"

class Invalid extends Data.TaggedError("Invalid")<{}> {}
class Zero extends Data.TaggedError("Zero")<{}> {}

const check = Effect.fn("check")(function*(n: number): Effect.fn.Return<number, Invalid | Zero> {
  if (n < 0) return yield* Effect.fail(new Invalid())
  if (n === 0) {
    return yield* Effect.fail(new Zero())
  }
  const parse = (s: string) => {
    if (s === "") throw new Error("plain JS throw")
    return Number(s)
  }
  return parse(String(n))
})
```

## Resources: `defer`, `using … await`, `for await`

<!-- fixtures/resources -->

### Defer

```efx
import { Console, Scope, Stream } from "effect"

declare const acquire: Effect.Effect<{ readonly close: Effect.Effect<void> }, never, Scope.Scope>

export effect useResource() {
  using handle = await acquire
  defer handle.close
  defer {
    globalThis.console.info("sync cleanup")
  }
  return 1
}

export effect sum(numbers: Stream.Stream<number>) {
  let total = 0
  for await (const n of numbers) {
    if (n < 0) continue
    total += n
  }
  return total
}

export const block = effect {
  defer Console.log("bye")
  return 2
}
```

Compiles to:

```ts
import { Console, Effect, Scope, Stream } from "effect"

declare const acquire: Effect.Effect<{ readonly close: Effect.Effect<void> }, never, Scope.Scope>

export const useResource = Effect.fn("useResource")(function*() {
  const handle = yield* acquire
  yield* Effect.addFinalizer(() => handle.close)
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      globalThis.console.info("sync cleanup")
    })
  )
  return 1
}, Effect.scoped)

export const sum = Effect.fn("sum")(function*(numbers: Stream.Stream<number>) {
  let total = 0
  yield* Stream.runForEach(numbers, (n) =>
    Effect.gen(function*() {
      if (n < 0) return
      total += n
    }))
  return total
})

export const block = Effect.scoped(Effect.gen(function*() {
  yield* Effect.addFinalizer(() => Console.log("bye"))
  return 2
}))
```

## `try` / `catch` / `finally` inside `effect`

<!-- fixtures/try -->

### Catch

```efx
import { Data } from "effect"

class NotFound extends Data.TaggedError("NotFound")<{}> {}
class Timeout extends Data.TaggedError("Timeout")<{}> {}

declare const load: (id: string) => Effect.Effect<string, NotFound | Timeout | Error>

effect withFallback(id: string) {
  try {
    return await load(id)
  } catch (e: NotFound) {
    return "missing"
  } catch (e: Timeout) {
    return "slow"
  } catch (e) {
    return `failed: ${String(e)}`
  }
}

effect logged(id: string) {
  let result = "none"
  try {
    result = await load(id)
  } catch (e: NotFound | Timeout) {
    result = e._tag
  } finally {
    await Effect.log("done")
  }
  return result
}

effect plain(json: string) {
  try {
    return JSON.parse(json) as unknown
  } catch {
    return null
  }
}
```

Compiles to:

```ts
import { Cause, Data, Effect } from "effect"

class NotFound extends Data.TaggedError("NotFound")<{}> {}
class Timeout extends Data.TaggedError("Timeout")<{}> {}

declare const load: (id: string) => Effect.Effect<string, NotFound | Timeout | Error>

const withFallback = Effect.fn("withFallback")(function*(id: string) {
  return yield* Effect.gen(function*() {
    return yield* load(id)
  }).pipe(
    Effect.catchDefect((defect) => Effect.fail(new Cause.UnknownError(defect))),
    Effect.catchTags({
      NotFound: (e) =>
        Effect.gen(function*() {
          return "missing"
        }),
      Timeout: (e) =>
        Effect.gen(function*() {
          return "slow"
        })
    }, (e) =>
      Effect.gen(function*() {
        return `failed: ${String(e)}`
      }))
  )
})

const logged = Effect.fn("logged")(function*(id: string) {
  let result = "none"
  yield* Effect.gen(function*() {
    result = yield* load(id)
  }).pipe(
    Effect.catchTag(["NotFound", "Timeout"], (e) =>
      Effect.gen(function*() {
        result = e._tag
      })),
    Effect.ensuring(Effect.gen(function*() {
      yield* Effect.log("done")
    }))
  )
  return result
})

const plain = Effect.fn("plain")(function*(json: string) {
  return yield* Effect.gen(function*() {
    return JSON.parse(json) as unknown
  }).pipe(
    Effect.catchDefect((defect) => Effect.fail(new Cause.UnknownError(defect))),
    Effect.catch(() =>
      Effect.gen(function*() {
        return null
      })
    )
  )
})
```

## `schema`: data types that are TypeScript types

<!-- fixtures/schema -->

### Basic

```efx
schema UserId = string & Brand<"UserId">

export schema User {
  id: UserId
  name: string
  email?: string
  tags: ReadonlyArray<string>
  role: "admin" | "member"
  manager: UserId | null
  age = Int.check(isGreaterThan(0))
  get label() {
    return `${this.name} <${this.email ?? "?"}>`
  }
}

export schema Point = { x: number; y: number }

export schema Shape =
  | Circle { radius: number }
  | Square { side: number }

schema Event {
  _tag: "Event"
  at: Date
  payload: Record<string, unknown>
}
```

Compiles to:

```ts
import { Schema } from "effect"
const UserId = Schema.String.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type

export class User extends Schema.Class<User>("User")({
  id: UserId,
  name: Schema.String,
  email: Schema.optionalKey(Schema.String),
  tags: Schema.Array(Schema.String),
  role: Schema.Literals(["admin", "member"]),
  manager: Schema.NullOr(UserId),
  age: Schema.Int.check(Schema.isGreaterThan(0))
}) {
  get label() {
    return `${this.name} <${this.email ?? "?"}>`
  }
}

export const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number })
export type Point = typeof Point.Type

export class Circle extends Schema.TaggedClass<Circle>()("Circle", { radius: Schema.Number }) {}
export class Square extends Schema.TaggedClass<Square>()("Square", { side: Schema.Number }) {}
export const Shape = Schema.Union([Circle, Square])
export type Shape = typeof Shape.Type

class Event extends Schema.TaggedClass<Event>()("Event", {
  at: Schema.Date,
  payload: Schema.Record(Schema.String, Schema.Unknown)
}) {}
```

### Comments

```efx
/** A product. */
export schema Product {
  // the sku
  sku: string
  /** price in cents */
  price: Int
}
```

Compiles to:

```ts
import { Schema } from "effect"
/** A product. */
export class Product extends Schema.Class<Product>("Product")({
  // the sku
  sku: Schema.String,
  /** price in cents */
  price: Schema.Int
}) {}
```

### Methods

```efx
error Banned { name: string }

export schema User {
  name: string
  banned: boolean

  effect greet(greeting: string): string throws Banned {
    if (this.banned) throw new Banned({ name: this.name })
    await sleep("1 millis")
    return `${greeting}, ${this.name}`
  }

  effect shout() { return (await this.greet("hey")).toUpperCase() }
}
```

Compiles to:

```ts
import { Effect, Schema } from "effect"
class Banned extends Schema.TaggedError<Banned>()("Banned", { name: Schema.String }) {}

export class User extends Schema.Class<User>("User")({
  name: Schema.String,
  banned: Schema.Boolean
}) {
  greet(greeting: string): Effect.Effect<string, Banned> {
    return Effect.gen({ self: this }, function*() {
      if (this.banned) return yield* new Banned({ name: this.name })
      yield* Effect.sleep("1 millis")
      return `${greeting}, ${this.name}`
    }).pipe(Effect.withSpan("User.greet"))
  }

  shout() {
    return Effect.gen({ self: this }, function*() {
      return (yield* this.greet("hey")).toUpperCase()
    }).pipe(Effect.withSpan("User.shout"))
  }
}
```

## `error`

<!-- fixtures/error -->

### Errors

```efx
export error UserNotFound { id: string }
error DbError { cause: Defect }
error Timeout {
  _tag: "RequestTimeout"
  ms: number
  get summary() { return `timed out after ${this.ms}ms` }
}

effect find(id: string): string throws UserNotFound | DbError {
  if (id === "") throw new UserNotFound({ id })
  if (id === "db") throw new DbError({ cause: new Error("down") })
  return id
}
```

Compiles to:

```ts
import { Effect, Schema } from "effect"
export class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", { id: Schema.String }) {}
class DbError extends Schema.TaggedError<DbError>()("DbError", { cause: Schema.Defect() }) {}
class Timeout extends Schema.TaggedError<Timeout>()("RequestTimeout", {
  ms: Schema.Number
}) {
  get summary() {
    return `timed out after ${this.ms}ms`
  }
}

const find = Effect.fn("find")(function*(id: string): Effect.fn.Return<string, UserNotFound | DbError> {
  if (id === "") return yield* new UserNotFound({ id })
  if (id === "db") return yield* new DbError({ cause: new Error("down") })
  return id
})
```

### Status

```efx
export error TodoNotFound status 404 { id: string }
export error Unauthorized status 401 {}
error RateLimited status 429 {
  retryAfter: number
  get message() { return `retry after ${this.retryAfter}s` }
}

// `status` is still a name everywhere else
const status = 200
export schema Reply { status: number }
```

Compiles to:

```ts
import { Schema } from "effect"
export class TodoNotFound
  extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", { id: Schema.String }, { httpApiStatus: 404 })
{}
export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}, { httpApiStatus: 401 }) {}
class RateLimited extends Schema.TaggedError<RateLimited>()("RateLimited", {
  retryAfter: Schema.Number
}, { httpApiStatus: 429 }) {
  get message() {
    return `retry after ${this.retryAfter}s`
  }
}

// `status` is still a name everywhere else
const status = 200
export class Reply extends Schema.Class<Reply>("Reply")({ status: Schema.Number }) {}
```

## `service`

<!-- fixtures/service -->

### Basic

```efx
error UserNotFound { id: string }

schema User {
  id: string
  name: string
}

declare const SqlLive: Layer<never>

export service Users {
  effect find(id: string): User throws UserNotFound
  effect list(): ReadonlyArray<User>
  readonly size: number

  layer = effect {
    const cache = new Map<string, User>()
    defer Effect.log("users layer released")
    return {
      size: 0,
      effect find(id: string) {
        return cache.get(id) ?? throw new UserNotFound({ id })
      },
      list: effect () => [...cache.values()]
    }
  } |> provide(SqlLive)

  layer test = {
    size: 1,
    find: effect (id: string) => new User({ id, name: "Test" }),
    list: effect () => []
  }
}

export effect firstName(id: string) {
  const user = await Users.find(id)
  return user.name
}
```

Compiles to:

```ts
import { Context, Effect, Layer, Schema } from "effect"
class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", { id: Schema.String }) {}

class User extends Schema.Class<User>("User")({
  id: Schema.String,
  name: Schema.String
}) {}

declare const SqlLive: Layer.Layer<never>

export class Users extends Context.Service<Users, {
  find(id: string): Effect.Effect<User, UserNotFound>
  list(): Effect.Effect<ReadonlyArray<User>>
  readonly size: number
}>()("fixtures/service/basic/Users") {
  static readonly layer = Layer.effect(
    Users,
    Effect.gen(function*() {
      const cache = new Map<string, User>()
      yield* Effect.addFinalizer(() => Effect.log("users layer released"))
      return Users.of({
        size: 0,
        find: Effect.fn("Users.find")(function*(id: string) {
          return cache.get(id) ?? (yield* new UserNotFound({ id }))
        }),
        list: Effect.fnUntraced(function*() {
          return [...cache.values()]
        })
      })
    })
  ).pipe(Layer.provide(SqlLive))

  static readonly layerTest = Layer.succeed(
    Users,
    Users.of({
      size: 1,
      find: Effect.fnUntraced(function*(id: string) {
        return new User({ id, name: "Test" })
      }),
      list: Effect.fnUntraced(function*() {
        return []
      })
    })
  )
  static readonly find = (id: string) => Users.use((_) => _.find(id))
  static readonly list = () => Users.use((_) => _.list())
}

export const firstName = Effect.fn("firstName")(function*(id: string) {
  const user = yield* Users.find(id)
  return user.name
})
```

### Default

```efx
export service Greeter {
  effect greet(name: string): string
  readonly punctuation: string

  default = {
    punctuation: "!",
    greet: effect (name: string) => `Hello, ${name}!`
  }

  layer test = { punctuation: ".", greet: effect (name: string) => `Hi, ${name}.` }
}

export effect welcome(name: string) {
  const greeting = await Greeter.greet(name)
  return `${greeting} Welcome.`
}
```

Compiles to:

```ts
import { Context, Effect, Layer } from "effect"
export interface Greeter {
  greet(name: string): Effect.Effect<string>
  readonly punctuation: string
}
const GreeterReference = Context.Reference<Greeter>("fixtures/service/default/Greeter", {
  defaultValue: () => ({
    punctuation: "!",
    greet: Effect.fnUntraced(function*(name: string) {
      return `Hello, ${name}!`
    })
  })
})
export const Greeter = Object.assign(GreeterReference, {
  layerTest: Layer.succeed(
    GreeterReference,
    GreeterReference.of({
      punctuation: ".",
      greet: Effect.fnUntraced(function*(name: string) {
        return `Hi, ${name}.`
      })
    })
  ),
  greet: (name: string) => GreeterReference.use((_) => _.greet(name))
})

export const welcome = Effect.fn("welcome")(function*(name: string) {
  const greeting = yield* Greeter.greet(name)
  return `${greeting} Welcome.`
})
```

## Top-level `layer`

<!-- fixtures/layer -->

### App

```efx
export service Users {
  effect list(): Array<string>
  layer = { list: effect () => ["ada"] }
}

export service Posts {
  effect count(): number
  layer = { count: effect () => 1 }
}

export layer AppLive = Users.layer & Posts.layer

export layer Provided = Users.layer & Posts.layer |> provide(Posts.layer)

export layer Worker = effect {
  defer log("worker stopped")
  console.log("worker started")
}
```

Compiles to:

```ts
import { Context, Effect, Layer } from "effect"
export class Users extends Context.Service<Users, {
  list(): Effect.Effect<Array<string>>
}>()("fixtures/layer/app/Users") {
  static readonly layer = Layer.succeed(
    Users,
    Users.of({
      list: Effect.fnUntraced(function*() {
        return ["ada"]
      })
    })
  )
  static readonly list = () => Users.use((_) => _.list())
}

export class Posts extends Context.Service<Posts, {
  count(): Effect.Effect<number>
}>()("fixtures/layer/app/Posts") {
  static readonly layer = Layer.succeed(
    Posts,
    Posts.of({
      count: Effect.fnUntraced(function*() {
        return 1
      })
    })
  )
  static readonly count = () => Posts.use((_) => _.count())
}

export const AppLive = Layer.mergeAll(Users.layer, Posts.layer)

export const Provided = Layer.mergeAll(Users.layer, Posts.layer).pipe(Layer.provide(Posts.layer))

export const Worker = Layer.effectDiscard(Effect.gen(function*() {
  yield* Effect.addFinalizer(() => Effect.log("worker stopped"))
  yield* Effect.log("worker started")
}))
```

## Pipeline `|>`

<!-- fixtures/pipeline -->

### Pipes

```efx
declare const getUserName: (id: string) => Effect.Effect<string, Error>

effect loadUser(id: string) {
  return await getUserName(id)
}

const program = effect {
  return await loadUser("1")
} |> Effect.retry({ times: 3 }) |> Effect.orElseSucceed(() => "anonymous")

const viaLocal = loadUser("2")
  |> Effect.timeout("1 second")
  |> Effect.orDie

const viaPipe = getUserName("3") |> Effect.map((name) => name.length)

const hack = getUserName("4") |> Effect.map(%, (name) => name.trim())

const twice = 21 |> % + %

const mixed = loadUser("5") |> Effect.orDie |> Effect.map(%, (s) => s.length) |> Effect.asVoid

effect awaited() {
  return await loadUser("6") |> Effect.orElseSucceed(() => "none")
}
```

Compiles to:

```ts
import { Effect, pipe } from "effect"
declare const getUserName: (id: string) => Effect.Effect<string, Error>

const loadUser = Effect.fn("loadUser")(function*(id: string) {
  return yield* getUserName(id)
})

const program = Effect.gen(function*() {
  return yield* loadUser("1")
}).pipe(Effect.retry({ times: 3 }), Effect.orElseSucceed(() => "anonymous"))

const viaLocal = loadUser("2").pipe(
  Effect.timeout("1 second"),
  Effect.orDie
)

const viaPipe = pipe(getUserName("3"), Effect.map((name) => name.length))

const hack = Effect.map(getUserName("4"), (name) => name.trim())

const twice = pipe(21, ($) => $ + $)

const mixed = loadUser("5").pipe(Effect.orDie, ($) => Effect.map($, (s) => s.length), Effect.asVoid)

const awaited = Effect.fn("awaited")(function*() {
  return yield* loadUser("6").pipe(Effect.orElseSucceed(() => "none"))
})
```

## `main`

<!-- fixtures/main -->

### Main

```efx
declare const program: Effect<void>
main {
  await program
  globalThis.console.log("done")
} |> provide(Layer.empty)

effect helper() {
  return 1
}
```

Compiles to:

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
declare const program: Effect.Effect<void>

const helper = Effect.fn("helper")(function*() {
  return 1
})
NodeRuntime.runMain(
  Effect.gen(function*() {
    yield* program
    globalThis.console.log("done")
  }).pipe(Effect.provide(Layer.empty), Effect.provide(NodeServices.layer))
)
```

### Otlp

```efx
// @efx observability otlp
main {
  await log("traced")
}
```

Compiles to:

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { Otlp, OtlpSerialization } from "effect/observability"
// @efx observability otlp
NodeRuntime.runMain(
  Effect.gen(function*() {
    yield* Effect.log("traced")
  }).pipe(
    Effect.provide(Otlp.layerFromConfig().pipe(Layer.provide([FetchHttpClient.layer, OtlpSerialization.layerJson]))),
    Effect.provide(NodeServices.layer)
  )
)
```

## `match`

<!-- fixtures/match -->

### Guards

```efx
schema Shape =
  | Circle { radius: number }
  | Square { side: number }

declare const shape: Shape
declare const status: "active" | "banned" | "pending"
declare const strict: boolean

export const size = match (shape) {
  when Circle(c) if c.radius > 10: `big circle ${c.radius}`
  when Circle({ radius }): `circle ${radius}`
  when Square({ side }) if side === 0: "dot"
  when Square: "square"
}

export const label = match (status) {
  when "banned" if strict: "✗"
  default: "?"
}
```

Compiles to:

```ts
import { Match, Predicate, Schema } from "effect"
class Circle extends Schema.TaggedClass<Circle>()("Circle", { radius: Schema.Number }) {}
class Square extends Schema.TaggedClass<Square>()("Square", { side: Schema.Number }) {}
const Shape = Schema.Union([Circle, Square])
type Shape = typeof Shape.Type

declare const shape: Shape
declare const status: "active" | "banned" | "pending"
declare const strict: boolean

export const size = Match.value(shape).pipe(
  Match.when(
    (c): c is Extract<typeof c, { readonly _tag: "Circle" }> & { readonly "~effectscript/guard": true } =>
      Predicate.isTagged(c, "Circle") && c.radius > 10,
    (c) => `big circle ${c.radius}`
  ),
  Match.tag("Circle", ({ radius }) => `circle ${radius}`),
  Match.when(
    (_): _ is Extract<typeof _, { readonly _tag: "Square" }> & { readonly "~effectscript/guard": true } =>
      Predicate.isTagged(_, "Square") && (({ side }) => side === 0)(_),
    ({ side }) => "dot"
  ),
  Match.tag("Square", () => "square"),
  Match.exhaustive
)

export const label = Match.value(status).pipe(
  Match.when((_) => _ === "banned" && strict, () => "✗"),
  Match.orElse(() => "?")
)
```

### Match

```efx
schema Shape =
  | Circle { radius: number }
  | Square { side: number }

declare const shape: Shape
declare const status: "active" | "banned" | "pending"
declare const scale: (n: number) => Effect.Effect<number>

export const area = match (shape) {
  when Circle({ radius }): Math.PI * radius ** 2
  when Square({ side }): side ** 2
}

export const label = match (status) { when "active": "✓"; when "banned": "✗"; default: "?" }

export effect scaled() {
  return match (shape) {
    when Circle(c): await scale(c.radius)
    when Square: 0
  }
}
```

Compiles to:

```ts
import { Effect, Match, Schema } from "effect"
class Circle extends Schema.TaggedClass<Circle>()("Circle", { radius: Schema.Number }) {}
class Square extends Schema.TaggedClass<Square>()("Square", { side: Schema.Number }) {}
const Shape = Schema.Union([Circle, Square])
type Shape = typeof Shape.Type

declare const shape: Shape
declare const status: "active" | "banned" | "pending"
declare const scale: (n: number) => Effect.Effect<number>

export const area = Match.valueTags(shape, {
  Circle: ({ radius }) => Math.PI * radius ** 2,
  Square: ({ side }) => side ** 2
})

export const label = Match.value(status).pipe(
  Match.when("active", () => "✓"),
  Match.when("banned", () => "✗"),
  Match.orElse(() => "?")
)

export const scaled = Effect.fn("scaled")(function*() {
  return (yield* Match.valueTags(shape, {
    Circle: (c) =>
      Effect.gen(function*() {
        return yield* scale(c.radius)
      }),
    Square: () =>
      Effect.gen(function*() {
        return 0
      })
  }))
})
```

### Objects

```efx
declare const res: { status: number; body: string }
type Event = { type: "click"; x: number; y: number } | { type: "key"; key: string }
declare const event: Event

export const message = match (res) {
  when { status: 404 }: "not found"
  when { status: 500, body } if body !== "": `server: ${body}`
  default: "ok"
}

export const describeEvent = match (event) {
  when { type: "click", x, y }: `click at ${x},${y}`
  when { type: "key", key }: `key ${key}`
}
```

Compiles to:

```ts
import { Match, Predicate } from "effect"
declare const res: { status: number; body: string }
type Event = { type: "click"; x: number; y: number } | { type: "key"; key: string }
declare const event: Event

export const message = Match.value(res).pipe(
  Match.when({ status: 404 }, () => "not found"),
  Match.when(
    (_): _ is Match.Types.WhenMatch<typeof _, { readonly status: 500 }> & { readonly "~effectscript/guard": true } =>
      Predicate.hasProperty(_, "status") && _.status === 500 &&
      (({ body }) => body !== "")(_ as Match.Types.WhenMatch<typeof _, { readonly status: 500 }>),
    ({ body }) => `server: ${body}`
  ),
  Match.orElse(() => "ok")
)

export const describeEvent = Match.value(event).pipe(
  Match.when({ type: "click" }, ({ x, y }) => `click at ${x},${y}`),
  Match.when({ type: "key" }, ({ key }) => `key ${key}`),
  Match.exhaustive
)
```

## Other adopted proposals

<!-- fixtures/proposals -->

### Throw do

```efx
import { Data } from "effect"

class Missing extends Data.TaggedError("Missing")<{}> {}

declare const find: (id: string) => Effect.Effect<string | undefined>

effect required(id: string) {
  const value = (await find(id)) ?? throw new Missing()
  return value
}

const port = Number(process.env["PORT"] ?? throw new Error("PORT is required"))

const size = do {
  const n = port * 2
  if (n > 100) {
    "large"
  } else {
    "small"
  }
}

effect describeId(id: string) {
  const label = do {
    const value = await find(id)
    value === undefined ? "none" : value.toUpperCase()
  }
  return label
}
```

Compiles to:

```ts
import { Data, Effect } from "effect"

class Missing extends Data.TaggedError("Missing")<{}> {}

declare const find: (id: string) => Effect.Effect<string | undefined>

const required = Effect.fn("required")(function*(id: string) {
  const value = (yield* find(id)) ?? (yield* Effect.fail(new Missing()))
  return value
})

const port = Number(
  process.env["PORT"] ?? (() => {
    throw new Error("PORT is required")
  })()
)

const size = (() => {
  const n = port * 2
  if (n > 100) {
    return "large"
  } else {
    return "small"
  }
})()

const describeId = Effect.fn("describeId")(function*(id: string) {
  const label = yield* Effect.gen(function*() {
    const value = yield* find(id)
    return value === undefined ? "none" : value.toUpperCase()
  })
  return label
})
```

## Prelude: automatic imports and builtins

<!-- fixtures/prelude -->

### Builtins

```efx
declare const fetchUser: (id: string) => Effect<string, Error>

export effect profile(id: string): string throws Error {
  const name = await fetchUser(id) |> retry({ times: 2 }) |> orElseSucceed(() => "anonymous")
  await sleep("10 millis")
  const [a, b] = await all([succeed(1), succeed(2)])
  return `${name}:${a + b}`
}

export const delays = Schedule.exponential("10 millis")

const local = (retry: number) => retry + 1
const map = new Map<string, number>()

export type User = { readonly id: Option<string> }
export const parsed: Effect<number> = succeed(local(1) + map.size)

export effect readConfig(path: string) {
  const fs = await FileSystem
  return await fs.readFileString(path)
}
```

Compiles to:

```ts
import { Effect, FileSystem, Option, pipe, Schedule } from "effect"
declare const fetchUser: (id: string) => Effect.Effect<string, Error>

export const profile = Effect.fn("profile")(function*(id: string): Effect.fn.Return<string, Error> {
  const name = yield* pipe(fetchUser(id), Effect.retry({ times: 2 }), Effect.orElseSucceed(() => "anonymous"))
  yield* Effect.sleep("10 millis")
  const [a, b] = yield* Effect.all([Effect.succeed(1), Effect.succeed(2)])
  return `${name}:${a + b}`
})

export const delays = Schedule.exponential("10 millis")

const local = (retry: number) => retry + 1
const map = new Map<string, number>()

export type User = { readonly id: Option.Option<string> }
export const parsed: Effect.Effect<number> = Effect.succeed(local(1) + map.size)

export const readConfig = Effect.fn("readConfig")(function*(path: string) {
  const fs = yield* FileSystem.FileSystem
  return yield* fs.readFileString(path)
})
```

## `config`

<!-- fixtures/config -->

### App

```efx
export config AppConfig {
  port: Port = 3000
  databaseUrl: Redacted
  logLevel: LogLevel = "Info"
  region?: "eu" | "us"
  serviceName: string
  workers: Int = 4
}
```

Compiles to:

```ts
import { Config } from "effect"
export const AppConfig = Config.all({
  port: Config.Port("PORT").pipe(Config.withDefault(3000)),
  databaseUrl: Config.Redacted("DATABASE_URL"),
  logLevel: Config.LogLevel("LOG_LEVEL").pipe(Config.withDefault("Info")),
  region: Config.option(Config.Literals(["eu", "us"], "REGION")),
  serviceName: Config.String("SERVICE_NAME"),
  workers: Config.Int("WORKERS").pipe(Config.withDefault(4))
})
```

## `test` / `describe` on `@effect/vitest`

<!-- fixtures/test -->

### Users

```efx
service Users {
  effect find(id: string): string
  layer test = { find: effect (id: string) => `user-${id}` }
}

describe "Users" {
  test "finds a user" {
    const user = await Users.find("1")
    assert.strictEqual(user, "user-1")
  } |> provide(Users.layerTest)

  test "scopes resources to the test" {
    using value = await acquireRelease(succeed(1), () => Effect.void)
    assert.strictEqual(value, 1)
  }

  test.live "runs on the live clock" {
    expect(Date.now()).toBeGreaterThan(0)
  }

  test.skip "is skipped" {
    return await fail("never runs")
  }
}

describe "with a shared layer" with Users.layerTest {
  test "provides the layer to every test" {
    expect(await Users.find("2")).toBe("user-2")
  }
}
```

Compiles to:

```ts
import { assert, describe, expect, it, layer } from "@effect/vitest"
import { Clock, Context, Effect, Layer } from "effect"
class Users extends Context.Service<Users, {
  find(id: string): Effect.Effect<string>
}>()("fixtures/test/Users") {
  static readonly layerTest = Layer.succeed(
    Users,
    Users.of({
      find: Effect.fnUntraced(function*(id: string) {
        return `user-${id}`
      })
    })
  )
  static readonly find = (id: string) => Users.use((_) => _.find(id))
}

describe("Users", () => {
  it.effect("finds a user", () =>
    Effect.gen(function*() {
      const user = yield* Users.find("1")
      assert.strictEqual(user, "user-1")
    }).pipe(Effect.provide(Users.layerTest)))

  it.effect("scopes resources to the test", () =>
    Effect.gen(function*() {
      const value = yield* Effect.acquireRelease(Effect.succeed(1), () => Effect.void)
      assert.strictEqual(value, 1)
    }))

  it.live("runs on the live clock", () =>
    Effect.gen(function*() {
      expect(yield* Clock.currentTimeMillis).toBeGreaterThan(0)
    }))

  it.effect.skip("is skipped", () =>
    Effect.gen(function*() {
      return yield* Effect.fail("never runs")
    }))
})

layer(Users.layerTest)("with a shared layer", (it) => {
  it.effect("provides the layer to every test", () =>
    Effect.gen(function*() {
      expect(yield* Users.find("2")).toBe("user-2")
    }))
})
```

## `api` / `group` / `impl`: HttpApi

<!-- fixtures/http -->

### Api

```efx
export schema User {
  id: string
  name: string
}

export schema NewUser {
  name: string
}

export error UserNotFound { id: string }

export error Forbidden {}

export group UsersApi {
  get list "/" (query: { search?: string }): User[]
  get getById "/:id" (params: { id: string }): User throws UserNotFound | Forbidden
  post create "/" (payload: NewUser): User
  del remove "/:id" (params: { id: string })
}

export group SystemApi "system" {
  get health "/health": string
}

export api Api { UsersApi, SystemApi }

export service Users {
  effect find(id: string): User throws UserNotFound
  layer = {
    find: effect (id: string) => id === "1" ? new User({ id, name: "Ada" }) : throw new UserNotFound({ id })
  }
}

export const UsersHandlers = impl Api.users {
  const users = await Users
  return {
    list: ({ query }) => succeed([new User({ id: "0", name: query.search ?? "all" })]),
    effect getById({ params }) {
      return await users.find(params.id)
    },
    create: ({ payload }) => succeed(new User({ id: "2", name: payload.name })),
    remove: () => Effect.void
  }
} |> provide(Users.layer)
```

Compiles to:

```ts
import { Context, Effect, Layer, Schema } from "effect"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
export class User extends Schema.Class<User>("User")({
  id: Schema.String,
  name: Schema.String
}) {}

export class NewUser extends Schema.Class<NewUser>("NewUser")({
  name: Schema.String
}) {}

export class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", { id: Schema.String }) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", {}) {}

export class UsersApi extends HttpApiGroup.make("users").add(
  HttpApiEndpoint.get("list", "/", {
    query: { search: Schema.optionalKey(Schema.String) },
    success: Schema.Array(User)
  }),
  HttpApiEndpoint.get("getById", "/:id", {
    params: { id: Schema.String },
    success: User,
    error: [UserNotFound, Forbidden]
  }),
  HttpApiEndpoint.post("create", "/", { payload: NewUser, success: User }),
  HttpApiEndpoint.delete("remove", "/:id", { params: { id: Schema.String } })
) {}

export class SystemApi extends HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("health", "/health", { success: Schema.String })
) {}

export class Api extends HttpApi.make("api").add(UsersApi, SystemApi) {}

export class Users extends Context.Service<Users, {
  find(id: string): Effect.Effect<User, UserNotFound>
}>()("fixtures/http/api/Users") {
  static readonly layer = Layer.succeed(
    Users,
    Users.of({
      find: Effect.fnUntraced(function*(id: string) {
        return id === "1" ? new User({ id, name: "Ada" }) : (yield* new UserNotFound({ id }))
      })
    })
  )
  static readonly find = (id: string) => Users.use((_) => _.find(id))
}

export const UsersHandlers = HttpApiBuilder.group(
  Api,
  "users",
  Effect.fn("Api.users")(function*(handlers) {
    const users = yield* Users
    return handlers.handleAll({
      list: ({ query }) => Effect.succeed([new User({ id: "0", name: query.search ?? "all" })]),
      getById: Effect.fn("Api.users.getById")(function*({ params }) {
        return yield* users.find(params.id)
      }),
      create: ({ payload }) => Effect.succeed(new User({ id: "2", name: payload.name })),
      remove: () => Effect.void
    })
  })
).pipe(Layer.provide(Users.layer))
```

## `command`: CLIs on `effect/cli`

<!-- fixtures/cli -->

### Create

```efx
import { Schema } from "effect"

const Email = Schema.String.pipe(Schema.check(Schema.isPattern(/@/)))

/** Create a task */
export command create(
  /** Task title */ title: NonEmptyString,
  /** Priority */ --priority: "low" | "normal" | "high" = "normal",
  /** Assignee email @alias a */ --assignee?: Email,
  --dryRun: boolean = false,
) {
  console.log(`Created "${title}" with ${priority} priority`)
}
```

Compiles to:

```ts
import { Effect, Schema } from "effect"
import { Argument, Command, Flag } from "effect/cli"

const Email = Schema.String.pipe(Schema.check(Schema.isPattern(/@/)))

/** Create a task */
export const create = Command.make(
  "create",
  {
    title: Argument.String("title").pipe(
      Argument.withSchema(Schema.NonEmptyString),
      Argument.withDescription("Task title")
    ),
    priority: Flag.Literals("priority", ["low", "normal", "high"]).pipe(
      Flag.withDefault("normal"),
      Flag.withDescription("Priority")
    ),
    assignee: Flag.String("assignee").pipe(
      Flag.withSchema(Email),
      Flag.optional,
      Flag.withAlias("a"),
      Flag.withDescription("Assignee email")
    ),
    dryRun: Flag.Boolean("dry-run").pipe(Flag.withDefault(false))
  },
  Effect.fn("create")(function*({ title, priority, assignee, dryRun }) {
    yield* Effect.log(`Created "${title}" with ${priority} priority`)
  })
).pipe(Command.withDescription("Create a task"))
```

## `rpc` / `impl`: RPC groups on `effect/rpc`

<!-- fixtures/rpc -->

### Users

```efx
export schema User {
  id: string
  name: string
}

export error UserNotFound { id: string }
export error Forbidden {}

export rpc UsersRpc {
  getUser(id: string): User throws UserNotFound
  rename(id: string, name: string): User throws UserNotFound | Forbidden
  ping()
  watch(id: string, limit?: number): Stream<string>
}

export const UsersLive = impl UsersRpc {
  const users = new Map([["1", new User({ id: "1", name: "Ada" })]])
  return {
    getUser: effect ({ id }) => users.get(id) ?? throw new UserNotFound({ id }),
    effect rename({ id, name }) {
      if (id === "0") throw new Forbidden()
      const user = users.get(id) ?? throw new UserNotFound({ id })
      return new User({ id: user.id, name })
    },
    ping: effect () => {},
    watch: ({ id }) => Stream.make(`${id}:a`, `${id}:b`)
  }
}
```

Compiles to:

```ts
import { Effect, Schema, Stream } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
export class User extends Schema.Class<User>("User")({
  id: Schema.String,
  name: Schema.String
}) {}

export class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", { id: Schema.String }) {}
export class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", {}) {}

export const UsersRpc = RpcGroup.make(
  Rpc.make("getUser", { payload: { id: Schema.String }, success: User, error: UserNotFound }),
  Rpc.make("rename", {
    payload: { id: Schema.String, name: Schema.String },
    success: User,
    error: Schema.Union([UserNotFound, Forbidden])
  }),
  Rpc.make("ping"),
  Rpc.make("watch", {
    payload: { id: Schema.String, limit: Schema.optionalKey(Schema.Number) },
    success: Schema.String,
    stream: true
  })
)

export const UsersLive = UsersRpc.toLayer(Effect.gen(function*() {
  const users = new Map([["1", new User({ id: "1", name: "Ada" })]])
  return UsersRpc.of({
    getUser: Effect.fnUntraced(function*({ id }) {
      return users.get(id) ?? (yield* new UserNotFound({ id }))
    }),
    rename: Effect.fn("UsersRpc.rename")(function*({ id, name }) {
      if (id === "0") return yield* new Forbidden()
      const user = users.get(id) ?? (yield* new UserNotFound({ id }))
      return new User({ id: user.id, name })
    }),
    ping: Effect.fnUntraced(function*() {}),
    watch: ({ id }) => Stream.make(`${id}:a`, `${id}:b`)
  })
}))
```

## `atom`: reactive state

<!-- fixtures/atom -->

### Counter

```efx
export atom count = 0

export atom doubled = (get) => get(count) * 2

export atom session = 1 |> keepAlive

export atom greeting = effect {
  return await succeed("hello")
}
```

Compiles to:

```ts
import { Effect } from "effect"
import { Atom } from "effect/reactivity"
export const count = Atom.make(0)

export const doubled = Atom.make((get) => get(count) * 2)

export const session = Atom.make(1).pipe(Atom.keepAlive)

export const greeting = Atom.make(Effect.gen(function*() {
  return yield* Effect.succeed("hello")
}))
```

## Ambient capture: `console`, `Date`, `Math`, `process.env`

<!-- fixtures/ambient -->

### Capture

```efx
export effect report(name: string) {
  console.log("hello", name)
  console.warn("careful")
  const startedAt = Date.now()
  const jitter = Math.random() * 10
  const region = process.env.REGION ?? "eu"
  return { startedAt, jitter, region, debug: process.env["DEBUG"] }
}

export function plain() {
  console.log("not captured: outside effect code")
  return Date.now()
}
```

Compiles to:

```ts
import { Clock, Config, Effect, Random } from "effect"
export const report = Effect.fn("report")(function*(name: string) {
  yield* Effect.log("hello", name)
  yield* Effect.logWarning("careful")
  const startedAt = yield* Clock.currentTimeMillis
  const jitter = (yield* Random.next) * 10
  const region = (yield* Config.String("REGION").pipe(Config.withDefault(undefined))) ?? "eu"
  return { startedAt, jitter, region, debug: yield* Config.String("DEBUG").pipe(Config.withDefault(undefined)) }
})

export function plain() {
  console.log("not captured: outside effect code")
  return Date.now()
}
```

## Name hygiene: what the compiler generates never clashes with your names

<!-- fixtures/hygiene -->

### Shadowing

```efx
import { Effect as Fx } from "effect"

const Schema = { note: "user value named Schema" }

export schema Point { x: number; y: number }

export effect area(Effect: number) {
  const inner = effect { return Effect * 2 }
  return await inner
}

export const run = Fx.runSync(area(2))
export const note = Schema.note
```

Compiles to:

```ts
import { Effect as Fx, Schema as Schema$ } from "effect"

const Schema = { note: "user value named Schema" }

export class Point extends Schema$.Class<Point>("Point")({ x: Schema$.Number, y: Schema$.Number }) {}

export const area = Fx.fn("area")(function*(Effect: number) {
  const inner = Fx.gen(function*() {
    return Effect * 2
  })
  return yield* inner
})

export const run = Fx.runSync(area(2))
export const note = Schema.note
```
