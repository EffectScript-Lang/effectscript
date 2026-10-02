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

## HTTP APIs

`group` declares endpoints, `api` collects groups, and `impl` implements a group with typed
handlers.

```efx
export schema Todo {
  id: string
  title: string
}

export error TodoNotFound { id: string }

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
