# EffectScript patterns

Each example is complete EffectScript that compiles. The names it uses (`Effect`, `Schema`,
`Layer`, the builtins such as `retry` or `provide`) are imported automatically from `effect`.

## Services and layers

A `service` declares an interface and its layers. Members marked `effect` are effectful
operations. `layer` is the live implementation and `layer test` a test one. Code reaches a service
through `await`.

```efx
export error UserNotFound { id: string }

export schema User {
  id: string
  name: string
}

export service Users {
  effect find(id: string): User throws UserNotFound
  effect list(): ReadonlyArray<User>

  // the live implementation: an `effect` block can acquire resources and use other services
  layer = effect {
    const store = new Map<string, User>([["1", new User({ id: "1", name: "Ada" })]])
    return {
      effect find(id: string) {
        return store.get(id) ?? throw new UserNotFound({ id })
      },
      list: effect () => [...store.values()]
    }
  }

  layer test = {
    find: effect (id: string) => new User({ id, name: "Test" }),
    list: effect () => []
  }
}

// `needs` names the services the function uses; the type checker requires it in the signature
export effect userName(id: string): string throws UserNotFound needs Users {
  const user = await Users.find(id)
  return user.name
}
```

Combine layers with `&`, and provide what a layer needs with `|> provide(…)`:

```efx
export service Clock2 {
  effect now(): number
  layer = { now: effect () => 0 }
}

export service Audit {
  effect record(event: string): void
  layer = { record: effect (event: string) => console.log(event) }
}

export layer AppLive = Clock2.layer & Audit.layer
```

A `default` makes a service optional: code that uses it without a layer gets the default, so it is
never in `needs`. A layer still overrides it, in tests or in production.

```efx
export service Greeting {
  effect phrase(name: string): string
  default = { phrase: effect (name: string) => `Hello, ${name}` }
  layer formal = { phrase: effect (name: string) => `Good day, ${name}` }
}

// no `needs Greeting`: the default is there when nothing is provided
export effect introduce(name: string): string {
  return await Greeting.phrase(name)
}
```

## Errors

Declare each failure as an `error`, throw it in `effect` code, and name it in `throws`. The type
checker then tracks exactly which errors a function can fail with.

```efx
export error InvalidAmount { amount: number }
export error InsufficientFunds { balance: number; amount: number }

export effect withdraw(balance: number, amount: number): number throws InvalidAmount | InsufficientFunds {
  if (amount <= 0) throw new InvalidAmount({ amount })
  if (amount > balance) throw new InsufficientFunds({ balance, amount })
  return balance - amount
}

export effect safeWithdraw(balance: number, amount: number): number {
  try {
    return await withdraw(balance, amount)
  } catch (e: InsufficientFunds) {
    console.warn(`only ${e.balance} available`)
    return balance
  } catch (e: InvalidAmount) {
    return balance
  }
}
```

## Schemas

A `schema` is a data type and its runtime schema at once. Field initializers (`=`) refine a
field with checks.

```efx
export schema Email = string & Brand<"Email">

export schema Signup {
  email: Email
  name: string
  age = Int.check(isGreaterThan(17))
  plan: "free" | "pro"
  referrer?: string
}

export schema Shape =
  | Circle { radius: number }
  | Square { side: number }

export effect register(input: unknown) {
  const signup = await Schema.decodeUnknownEffect(Signup)(input)
  return signup.name
}
```

An `effect` method on a schema class returns an effect, with `this` as the instance:

```efx
export error Suspended { name: string }

export schema Account {
  name: string
  suspended: boolean

  effect greet(greeting: string): string throws Suspended {
    if (this.suspended) throw new Suspended({ name: this.name })
    return `${greeting}, ${this.name}`
  }
}

export effect welcome(account: Account) {
  return await account.greet("Hello")
}
```

## Configuration

```efx
export config AppConfig {
  port: Port = 3000
  databaseUrl: Redacted
  logLevel: LogLevel = "Info"
  workers: Int = 4
}

export effect describeConfig() {
  const config = await AppConfig
  return `port ${config.port}, ${config.workers} workers`
}
```

## The entry point

`main` runs the program with the platform runtime, and its pipeline provides the layers.

```efx
service Greeter {
  effect greet(name: string): string
  layer = { greet: effect (name: string) => `Hello, ${name}` }
}

main {
  const greeting = await Greeter.greet("Ada")
  console.log(greeting)
} |> provide(Greeter.layer)
```

## Testing

`describe` and `test` run on `@effect/vitest`. Each test body is `effect` code, and a pipeline
provides layers to the test.

```efx
service Users {
  effect find(id: string): string
  layer test = { find: effect (id: string) => `user-${id}` }
}

describe "Users" {
  test "finds a user" {
    const user = await Users.find("1")
    expect(user).toBe("user-1")
  } |> provide(Users.layerTest)
}

describe "with a shared layer" with Users.layerTest {
  test "provides it to every test" {
    expect(await Users.find("2")).toBe("user-2")
  }
}
```

Test bodies run like `it.effect` from `@effect/vitest`. They get a test clock and a test console:

- `await sleep(…)` waits on the test clock. Advance it with `TestClock.adjust`, from
  `effect/testing`.
- `console.log` output goes to the test console. Use `test.live "…" { … }` for the real clock and
  console.

```efx
import { TestClock } from "effect/testing"

describe "timeouts" {
  test "fires after a minute of test time" {
    const fiber = await forkChild(sleep("1 minute") |> as("done"))
    await TestClock.adjust("1 minute")
    expect(await Fiber.join(fiber)).toBe("done")
  }

  test.live "uses the real clock" {
    expect(Date.now()).toBeGreaterThan(0)
  }
}
```

## HTTP APIs

`group` declares endpoints, `api` collects groups, and `impl` implements a group with typed
handlers.

```efx
export schema Todo {
  id: string
  title: string
}

// the status the API answers with when a handler fails with it
export error TodoNotFound status 404 { id: string }

export group TodosApi {
  get list "/": Todo[]
  get byId "/:id" (params: { id: string }): Todo throws TodoNotFound
}

export api Api { TodosApi }

export const TodosHandlers = impl Api.todos {
  return {
    list: () => succeed([new Todo({ id: "1", title: "Write docs" })]),
    effect byId({ params }) {
      if (params.id !== "1") throw new TodoNotFound({ id: params.id })
      return new Todo({ id: "1", title: "Write docs" })
    }
  }
}
```

Serve it by turning the API into routes and the routes into a server:

```efx
import { NodeHttpServer } from "@effect/platform-node"
import { createServer } from "node:http"

export schema Todo {
  id: string
  title: string
}

export group TodosApi {
  get list "/": Todo[]
}

export api Api { TodosApi }

export const TodosHandlers = impl Api.todos {
  return { list: () => succeed([new Todo({ id: "1", title: "Write docs" })]) }
}

export layer ApiRoutes = HttpApiBuilder.layer(Api) |> provide(TodosHandlers)

export layer ServerLive = HttpRouter.serve(ApiRoutes) |> provide(NodeHttpServer.layer(createServer, { port: 3000 }))

main {
  await Layer.launch(ServerLive)
}
```

## SQL

`effect/sql` gives a `SqlClient` service with a `sql` template tag: interpolated values become
parameters, never text. `SqlSchema` decodes the rows into a `schema`, so a query's result is
typed. A driver package provides the client: `SqliteClient.layer({ filename })` from
`@effect/sql-sqlite-node`, or `PgClient.layer(…)` from `@effect/sql-pg`.

```efx
import { SqlClient, SqlSchema } from "effect/sql"

export schema Todo {
  id: number
  title: string
}

export effect todosTitled(title: string) {
  const sql = await SqlClient.SqlClient
  const find = SqlSchema.findAll({
    Request: Schema.String,
    Result: Todo,
    execute: (title) => sql`SELECT id, title FROM todos WHERE title = ${title}`
  })
  return await find(title)
}

// statements in a transaction commit together, or roll back on the first failure
export effect rename(id: number, title: string) {
  const sql = await SqlClient.SqlClient
  await sql.withTransaction(effect {
    await sql`UPDATE todos SET title = ${title} WHERE id = ${id}`
    await sql`INSERT INTO audit (event) VALUES (${`renamed ${id}`})`
  })
}
```

## CLIs

A `command` declares its arguments and flags in the signature. Doc comments become the help text.

```efx
/** Greet someone */
export command greet(
  /** Who to greet */ name: string,
  /** Shout it @alias s */ --shout: boolean = false,
) {
  const text = `Hello, ${name}`
  console.log(shout ? text.toUpperCase() : text)
}
```

Run it from `main`. Inside `effect` code `console.log` is Effect logging, which adds a timestamp
and a level, so a CLI that prints to stdout opts out with `// @efx no-ambient` and writes plain
output:

```efx
// @efx no-ambient

/** Say hello */
export command hello(
  /** Who to greet */ name: string,
) {
  process.stdout.write(`Hello, ${name}\n`)
}

main {
  await Command.runWith(hello, { version: "1.0.0" })(process.argv.slice(2))
}
```

## Resources

`defer` registers cleanup that runs when the `effect` exits, on success, failure or interruption,
in reverse order. `using x = await acquire` binds a scoped resource.

```efx
declare const openConnection: Effect<{ readonly query: (sql: string) => Effect<number>; readonly close: Effect<void> }>

export effect countUsers() {
  const connection = await openConnection
  defer connection.close
  return await connection.query("select count(*) from users")
}
```

## Concurrency

```efx
declare const loadUser: (id: string) => Effect<string>
declare const loadPosts: (id: string) => Effect<ReadonlyArray<string>>

export effect profile(id: string) {
  // both run at the same time
  const [user, posts] = await [loadUser(id), loadPosts(id)]
  const { first, second } = await { first: loadUser("1"), second: loadUser("2") }
  return { user, posts, first, second }
}

export effect everyone(ids: ReadonlyArray<string>) {
  return await forEach(ids, loadUser, { concurrency: 4 })
}
```

## Retries, timeouts and schedules

```efx
declare const callApi: (path: string) => Effect<string, Error>

export const resilient = callApi("/health")
  |> retry({ times: 3, schedule: Schedule.exponential("100 millis") })
  |> timeout("2 seconds")
  |> orElseSucceed(() => "unavailable")
```

## Streams

An `effect*` function produces a stream: `yield` emits an element, `await` runs an effect, and
`throw` fails the stream. The return type names the element type. The stream pulls one element at
a time and stops the body when the consumer stops.

```efx
export error Exhausted { after: number }

export effect* countdown(from: number): number throws Exhausted {
  defer { console.log("countdown closed") }
  for (let i = from; i > 0; i--) {
    yield i
    await sleep("10 millis")
  }
  if (from > 100) throw new Exhausted({ after: from })
}
```

`for await` consumes one:

```efx
export effect total(numbers: Stream<number>) {
  let sum = 0
  for await (const n of numbers) {
    if (n < 0) continue
    sum += n
  }
  return sum
}
```

## Promises at the boundary

Wrap Promise-returning APIs once, in a service implementation, and give them a typed error.

```efx
export error FetchFailed { url: string; cause: unknown }

export service Http {
  effect getText(url: string): string throws FetchFailed
  layer = {
    getText: effect (url: string) =>
      await tryPromise({
        try: () => fetch(url).then((response) => response.text()),
        catch: (cause) => new FetchFailed({ url, cause })
      })
  }
}
```

## Names the constructs generate

| You write                                        | You use                                                         |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `group TodosApi { … }` in `api Api { TodosApi }` | `impl Api.todos { … }` (the group name, camelCase, minus `Api`) |
| `layer test = …` in `service Users`              | `Users.layerTest` (`layer = …` is `Users.layer`)                |
| `config AppConfig { databaseUrl: Redacted }`     | the environment variable `DATABASE_URL`                         |
| `command greet(--dryRun: boolean)`               | the flag `--dry-run`                                            |
| `effect find(…)` in `service Users`              | the span `"Users.find"`                                         |
