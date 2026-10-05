/**
 * The landing page's standard-library bento (ADR-0082): what Effect gives TypeScript, each in a
 * few lines of EffectScript. Every snippet compiles (a test); the line above it draws the ideas
 * (ADR-0091).
 */
export interface Tile {
  readonly id: string
  readonly name: string
  readonly code: string
  /** Grid columns out of 12 at desktop width. */
  readonly span: 3 | 4 | 5 | 6 | 7
}

export const tiles: ReadonlyArray<Tile> = [
  {
    id: "errors",
    name: "Typed errors",
    code:
      "export error UserNotFound { id: string }\n\nexport effect getUser(id: string): User throws UserNotFound {\n  return users.get(id) ?? throw new UserNotFound({ id })\n}",
    span: 7
  },
  {
    id: "retry",
    name: "Retries and timeouts",
    code:
      "effect load(id: string) {\n  return await getUser(id)\n    |> retry({ times: 3 })\n    |> timeout(\"5 seconds\")\n}",
    span: 5
  },
  {
    id: "fibers",
    name: "Structured concurrency",
    code:
      "effect profile(id: string) {\n  const [user, posts] = await [loadUser(id), loadPosts(id)]\n  return { user, posts }\n}",
    span: 5
  },
  {
    id: "services",
    name: "Services and layers",
    code:
      "export service Users {\n  effect find(id: string): User throws UserNotFound\n}\n\nexport effect greet(id: string): string needs Users {\n  const user = await Users.find(id)\n  return `Hello, ${user.name}`\n}",
    span: 7
  },
  {
    id: "schemas",
    name: "Schemas",
    code: "export schema Signup {\n  email: Email\n  name: string\n  plan: \"free\" | \"pro\"\n}",
    span: 4
  },
  {
    id: "resources",
    name: "Resources",
    code:
      "effect upload(path: string, url: string) {\n  const file = await openFile(path)\n  defer file.close\n  const socket = await connect(url)\n  defer socket.close\n  await socket.send(await file.read)\n}",
    span: 4
  },
  {
    id: "match",
    name: "Pattern matching",
    code:
      "const area = (shape: Shape) =>\n  match (shape) {\n    when Circle({ radius }): Math.PI * radius ** 2\n    when Square({ side }): side ** 2\n  }",
    span: 4
  },
  {
    id: "streams",
    name: "Streams",
    code:
      "export effect* countdown(from: number): number {\n  for (let i = from; i > 0; i--) {\n    yield i\n    await sleep(\"1 second\")\n  }\n}",
    span: 6
  },
  {
    id: "main",
    name: "Observability",
    code: "main {\n  const greeting = await greet(\"Ada\")\n  console.log(greeting)\n} |> provide(AppLive)",
    span: 6
  }
]

/** The rest of Effect's libraries, one declaration each. */
export const libraries: ReadonlyArray<{ readonly name: string; readonly code: string }> = [
  { name: "config", code: "export config AppConfig {\n  port: Port = 3000\n  databaseUrl: Redacted\n}" },
  {
    name: "test",
    code:
      "describe \"Users\" with Users.layerTest {\n  test \"finds a user\" {\n    expect(await Users.find(\"1\")).toBe(\"user-1\")\n  }\n}"
  },
  {
    name: "api",
    code: "export group TodosApi {\n  get byId \"/todos/:id\" (params: { id: string }): Todo throws TodoNotFound\n}"
  },
  {
    name: "command",
    code:
      "/** Create a task */\nexport command create(title: string, --priority: \"low\" | \"high\" = \"low\") {\n  console.log(title)\n}"
  },
  {
    name: "rpc",
    code:
      "export rpc UsersRpc {\n  getUser(id: string): User throws UserNotFound\n  watch(id: string): Stream<string>\n}"
  },
  {
    name: "tool",
    code: "/** Looks up the forecast for a city. */\nexport tool GetForecast(city: string): Forecast throws UnknownCity"
  },
  { name: "entity", code: "export entity Counter {\n  increment(by: number): number\n  current(): number\n}" },
  {
    name: "workflow",
    code:
      "export workflow SendWelcome(email: string): string key email {\n  return await activity render(): string {\n    return `Welcome, ${email}`\n  }\n}"
  }
]

/** `async` TypeScript, the EffectScript for it, and what Effect gives you (the skill's table). */
export const translation: ReadonlyArray<readonly [async: string, efx: string, effect: string]> = [
  ["async function f() {}", "effect f() {}", "a named, traced Effect.fn"],
  ["await promise", "await effect", "yield*, with the error typed"],
  ["throw new Error(\"x\")", "throw new NotFound({ id })", "a failure in the signature"],
  ["try { } catch (e) { }", "catch (e: NotFound) { }", "errors caught by tag"],
  ["Promise.all([a, b])", "await [a, b]", "Effect.all, concurrent"],
  ["for await (const x of it)", "for await (const x of stream)", "a Stream"],
  ["try { } finally { close() }", "defer close", "a finalizer, on every exit"]
]

/** The language's keywords today, and the ones each roadmap extension would add (ADR-0081). */
export const keywords = {
  core: [
    "effect",
    "await",
    "throw",
    "throws",
    "needs",
    "schema",
    "error",
    "service",
    "layer",
    "config",
    "main",
    "match",
    "when",
    "defer",
    "test",
    "describe",
    "api",
    "group",
    "impl",
    "command",
    "rpc",
    "tool",
    "toolkit",
    "entity",
    "workflow",
    "activity",
    "atom"
  ],
  extensions: [
    {
      id: "proofs",
      name: "Proofs",
      on: "Bend2",
      adds: ["law", "requires"],
      what:
        "law declarations run as property tests today; efx verify asks Bend2 for a proof that each one holds for every input."
    },
    {
      id: "infra",
      name: "Infrastructure",
      on: "Alchemy",
      adds: ["resource", "worker", "stack", "serves"],
      what:
        "resource, worker and stack declarations compile to Alchemy's Effect-based resources: a worker serves an api and binds what its handlers use, so the deployment is .efx too."
    },
    {
      id: "app",
      name: "Apps",
      on: "Foldkit's model",
      adds: ["app"],
      what:
        "A Foldkit-style app: model, messages, update and view, with effects for everything that talks to the world."
    }
  ]
} as const
