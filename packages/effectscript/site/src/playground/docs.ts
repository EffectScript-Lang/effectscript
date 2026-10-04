/**
 * The playground's hover docs (ADR-0088): what each EffectScript construct means, written from the
 * syntax reference and the guides, with a link to its reference page; the names a file declares,
 * with their declaration; and Effect's own JSDoc for the builtins and namespaces
 * (`src/lib/effectDocs.ts`).
 */

export interface Construct {
  /** What it is, in a few words. */
  readonly what: string
  /** One to three sentences, Markdown. */
  readonly body: string
  /** The reference page under `/docs/reference`, or an ADR for syntax that isn't built. */
  readonly page?: string
  readonly adr?: string
  /** For syntax that isn't built yet. */
  readonly status?: string
}

const adr = (n: string, slug: string) =>
  `https://github.com/EffectScript-Lang/effectscript/blob/effectscript/docs/adr/${n}-${slug}.md`

/** EffectScript's own words, by keyword. */
export const constructs: Readonly<Record<string, Construct>> = {
  effect: {
    what: "effectful code",
    body:
      "Declares an effect function or block. `effect f(…) { … }` compiles to `Effect.fn(\"f\")(function*(…) { … })`, a named, traced span, and `effect { … }` to `Effect.gen`. Inside, `await` runs an effect, `throw` fails with a typed error, and `console.log` logs through Effect.",
    page: "effect"
  },
  "effect*": {
    what: "a stream",
    body:
      "An `effect*` function produces a `Stream`: `yield` emits an element, `await` runs an effect, and the return type names the element. The stream pulls one element at a time and stops the body when the consumer stops.",
    page: "effect"
  },
  await: {
    what: "runs an effect",
    body:
      "Runs an effect here and short-circuits on failure: it becomes `yield*`. `await [a, b]`, an array literal, runs both at once with `Effect.all`. Awaiting a Promise is an error (EFX8111): wrap it with `tryPromise`.",
    page: "effect"
  },
  throw: {
    what: "fails with a typed error",
    body:
      "Inside `effect` code, `throw e` fails with `e` in the typed error channel: `return yield* e`. Declare the failure with `error` and name it in `throws`. As an expression, `x ?? throw new NotFound()` works too. Outside `effect` code it is JavaScript's own `throw`.",
    page: "effect"
  },
  throws: {
    what: "how it can fail",
    body:
      "The errors the function can fail with: the `E` of `Effect<A, E, R>`. Without `throws` it can't fail, and the type checker holds the function to its list.",
    page: "effect"
  },
  needs: {
    what: "the services it uses",
    body:
      "The services the function uses: the `R` of `Effect<A, E, R>`. Without `needs` it may use none, and the type checker holds it to the list. `main` or a test provides them with `|> provide(…)`.",
    page: "effect"
  },
  yield: {
    what: "emits an element",
    body: "Inside `effect*`, `yield x` emits one element of the stream. Inside `effect` code, write `await` instead.",
    page: "effect"
  },
  schema: {
    what: "data and its schema",
    body:
      "A data type and its runtime schema at once. `schema User { … }` is a `Schema.Class`, `schema Point = { … }` a `Schema.Struct`, and a union of variants a `Schema.TaggedClass` per variant joined in a `Schema.Union`. Decode with `Schema.decodeUnknownEffect(User)(input)`.",
    page: "schema"
  },
  brand: {
    what: "a branded type",
    body:
      "`brand Name = Type` is a type the checker tells apart from its base type, keyed by its name: `const Name = <schema>.pipe(Schema.brand(\"Name\"))` and `type Name`. `where` adds checks, which `Name.make(value)` runs.",
    adr: adr("0077", "brand-declarations-and-where-checks"),
    status: "Accepted in ADR-0077, not built yet"
  },
  where: {
    what: "checks on a type",
    body:
      "Ends a field's or a brand's type with checks: `age: Int where isGreaterThan(0)` is `Schema.Int.check(Schema.isGreaterThan(0))`. Checks run when decoding and in `make`, reach JSON Schema, and shape generated test data.",
    adr: adr("0077", "brand-declarations-and-where-checks"),
    status: "Accepted in ADR-0077, not built yet"
  },
  error: {
    what: "a typed failure",
    body:
      "A `Schema.TaggedError` class whose fields are a schema. Throw it in `effect` code, name it in `throws`, and catch it by tag with `catch (e: Name)`. `error X status 404 { … }` sets the HTTP status an API answers with.",
    page: "error"
  },
  status: {
    what: "an HTTP status",
    body:
      "Between an error's name and its body: the status `HttpApi` answers with when a handler fails with this error (`{ httpApiStatus: 404 }`).",
    page: "error"
  },
  service: {
    what: "a dependency",
    body:
      "An interface and its layers, as a `Context.Service` tag with an accessor per method, so `await Users.find(id)` works wherever the service is provided. `layer = …` is `Users.layer`, `layer test = …` is `Users.layerTest`, and `default = …` makes the service optional.",
    page: "service"
  },
  layer: {
    what: "wiring",
    body:
      "In a `service`, `layer = …` builds the implementation (`Layer.succeed`, or `Layer.effect` for an `effect` block). At the top level, `layer App = A.layer & B.layer` merges layers, and `|> provide(L)` gives a layer what it needs.",
    page: "layer"
  },
  config: {
    what: "typed configuration",
    body:
      "Configuration from the environment: each field reads the variable named after it (`databaseUrl` reads `DATABASE_URL`), typed by its schema, with `= value` as a default. Compiles to `Config.all`; `await AppConfig` reads it.",
    page: "config"
  },
  main: {
    what: "the entry point",
    body:
      "The program's one entry point, run with the platform runtime (`NodeRuntime.runMain`). `|> provide(…)` gives it its layers. Run effects only here, never inside other effects (EFX8003).",
    page: "main"
  },
  match: {
    what: "branches on a value",
    body:
      "A `when` per case, checked for exhaustiveness. Tag arms alone compile to `Match.valueTags`; literals, guards and object patterns to `Match.value(x).pipe(…)`. Inside `effect` code an arm can `await`.",
    page: "match"
  },
  when: {
    what: "one case of a match",
    body:
      "`when Circle({ radius }): …` matches a tag and destructures its fields; `when \"active\":` a literal; `when { status: 404 }:` an object pattern. An `if` after the pattern is a guard, which never counts as handling the case.",
    page: "match"
  },
  "|>": {
    what: "the pipeline",
    body:
      "`x |> f` is `f(x)`, written as `.pipe(f)` or `pipe(x, f)`. Effect's combinators are builtins when the name is free: `|> retry({ times: 3 }) |> timeout(\"5 seconds\")`. After an `effect` declaration, each step wraps the whole function.",
    page: "pipeline"
  },
  "%": {
    what: "the topic",
    body: "In a pipeline step, `%` is the value flowing in: `getUser(id) |> Effect.map(%, (u) => u.name)`.",
    page: "pipeline"
  },
  defer: {
    what: "cleanup at exit",
    body:
      "Registers cleanup that runs when the `effect` exits, on success, failure or interruption, in reverse order (Go's `defer`): `Effect.addFinalizer`, with the function made `Effect.scoped`.",
    page: "resources"
  },
  using: {
    what: "a scoped resource",
    body: "`using x = await acquire` binds a resource that lives until the `effect` exits, then is released.",
    page: "resources"
  },
  try: {
    what: "typed error handling",
    body:
      "Inside `effect` code, `try` is Effect error handling: `catch (e: NotFound)` catches by tag, a final untyped `catch` also catches defects, and `finally` runs on every exit. Interruption is never caught.",
    page: "try"
  },
  api: {
    what: "an HTTP API",
    body: "`api Api { UsersApi, … }` collects groups into an `HttpApi`, which serves them and derives a typed client.",
    page: "http"
  },
  group: {
    what: "HTTP endpoints",
    body:
      "Endpoints as signatures: `get byId \"/:id\" (params: { id: string }): Todo throws TodoNotFound`. Compiles to `HttpApiGroup.make(…).add(HttpApiEndpoint.get(…))`; `impl Api.todos { … }` implements it.",
    page: "http"
  },
  impl: {
    what: "handlers as a layer",
    body:
      "Builds the handlers of an HTTP group (`impl Api.todos`, as `HttpApiBuilder.group`), an RPC group, a toolkit or an entity. The body runs once, so its locals are shared; it returns a handler per endpoint.",
    page: "http"
  },
  command: {
    what: "a CLI command",
    body:
      "Parameters are arguments, `--flag` parameters are flags, defaults are defaults, and doc comments become the help text. Compiles to `Command.make` on `effect/cli`.",
    page: "cli"
  },
  rpc: {
    what: "an RPC group",
    body:
      "Procedures as signatures: the parameters are the payload, `throws` the failures, and a `Stream<A>` return type a streaming procedure. Compiles to `RpcGroup.make(Rpc.make(…))`.",
    page: "rpc"
  },
  tool: {
    what: "a tool a model can call",
    body:
      "The doc comment is the description the model reads, the parameters its input schema, the return type its success. Compiles to `Tool.make` on `effect/ai`.",
    page: "ai"
  },
  toolkit: {
    what: "tools for a model",
    body: "Groups tools: `Toolkit.make(…)`. `impl Assistant { … }` gives each one a handler.",
    page: "ai"
  },
  entity: {
    what: "a cluster entity",
    body:
      "Addressed by id and spread across runners: `Entity.make` on `effect/cluster`. Its `impl` body runs once per entity, so its locals are that entity's state.",
    page: "cluster"
  },
  workflow: {
    what: "a durable workflow",
    body:
      "Survives restarts: `key` names an execution, and each `activity` is a step whose result is recorded. Compiles to `Workflow.make` on `effect/workflow`.",
    page: "workflow"
  },
  activity: {
    what: "a recorded step",
    body:
      "A workflow step whose result is recorded by its name, so it doesn't run twice. In a loop, `activity send(id)` records each run apart.",
    page: "workflow"
  },
  key: {
    what: "a workflow's identity",
    body:
      "After a workflow's signature, `key email` names an execution: running it again with the same key resumes it.",
    page: "workflow"
  },
  atom: {
    what: "reactive state",
    body:
      "`atom count = 0` is `Atom.make(0)`. An atom of a function derives from others, and an atom of an `effect` runs it. React reads them with `@effect/atom-react`.",
    page: "atom"
  },
  test: {
    what: "a test",
    body:
      "A test on `@effect/vitest`: the body is `effect` code with a test clock and console, and `|> provide(L)` gives it layers. `test.live` uses the real clock.",
    page: "test"
  },
  describe: {
    what: "a test suite",
    body: "A suite on `@effect/vitest`. `describe \"…\" with L` provides a layer to every test in it.",
    page: "test"
  },
  console: {
    what: "logging, through Effect",
    body:
      "Inside `effect` code, `console.log` is `Effect.log`, with the span and fiber in context; `info`, `warn`, `error` and `debug` keep their levels. Outside `effect` code it is the browser's or Node's.",
    page: "ambient"
  },
  Date: {
    what: "the clock, through Effect",
    body: "Inside `effect` code, `Date.now()` reads Effect's `Clock`, so a test's `TestClock` controls it.",
    page: "ambient"
  },
  Math: {
    what: "randomness, through Effect",
    body: "Inside `effect` code, `Math.random()` reads Effect's `Random`, so tests can seed it.",
    page: "ambient"
  },
  process: {
    what: "configuration, through Effect",
    body:
      "Inside `effect` code, `process.env.NAME` reads `Config`, so a test's `ConfigProvider` supplies it. It stays `string | undefined`.",
    page: "ambient"
  },
  do: {
    what: "a block as a value",
    body: "`do { … }` is an expression: its last expression is its value. Inside `effect` code it can `await`.",
    page: "proposals"
  },
  law: {
    what: "a rule the program keeps",
    body:
      "Its parameters are generated from their schemas, and the body returns a boolean. It runs as a property test, and it is the statement a Bend2 proof proves (ADR-0074).",
    adr: adr("0075", "law-declarations"),
    status: "Proposed in ADR-0075, not built yet"
  },
  requires: {
    what: "a law's precondition",
    body: "Inputs that don't meet it are discarded, not counted as passes; too many discards fail the law.",
    adr: adr("0075", "law-declarations"),
    status: "Proposed in ADR-0075, not built yet"
  },
  laws: {
    what: "runs a module's laws",
    body: "In a test file, `laws \"./bank.efx\"` runs every law in that module as a property test.",
    adr: adr("0075", "law-declarations"),
    status: "Proposed in ADR-0075, not built yet"
  },
  resource: {
    what: "a cloud resource",
    body:
      "`resource Uploads = Cloudflare.R2.Bucket()` is an Alchemy resource named after its declaration. Awaiting it in a worker's code binds it.",
    adr: adr("0086", "the-infra-extension-sketched-on-alchemy"),
    status: "A proposed sketch (ADR-0086), not built"
  },
  worker: {
    what: "a Cloudflare Worker",
    body:
      "`worker Site serves Api with Handlers` deploys a Worker that serves an `api`: responses come from its schemas and statuses, and the handlers' resources are bound to it.",
    adr: adr("0086", "the-infra-extension-sketched-on-alchemy"),
    status: "A proposed sketch (ADR-0086), not built"
  },
  stack: {
    what: "what Alchemy deploys",
    body: "`stack App { Site }` is the deployment: its workers, with the providers the file's header names.",
    adr: adr("0086", "the-infra-extension-sketched-on-alchemy"),
    status: "A proposed sketch (ADR-0086), not built"
  }
}

/** Endpoint lines in a `group`: `get name "/path" …`. */
const endpoint = /^\s*(get|post|put|patch|del)\s+[A-Za-z_$][\w$]*\s+"/

const endpointDoc: Construct = {
  what: "an HTTP endpoint",
  body:
    "Method, name and path, then the sections it reads (`params`, `query`, `headers`, `payload`), its success type, and the errors it can fail with after `throws`.",
  page: "http"
}

/** A declaration in the source: its keyword and the lines it spans. */
export interface Declaration {
  readonly kind: string
  readonly name: string
  readonly start: number
  readonly end: number
}

const declarationLine =
  /^[ \t]*(?:export[ \t]+(?:default[ \t]+)?)?(schema|brand|error|service|config|layer|api|group|rpc|tool|toolkit|entity|workflow|command|atom|resource|worker|stack|law|effect\*?)[ \t]+([A-Za-z_$][\w$]*)/gm

/** The names a file declares with EffectScript's constructs, with each declaration's text range. */
export const declarations = (text: string): Map<string, Declaration> => {
  const out = new Map<string, Declaration>()
  for (const match of text.matchAll(declarationLine)) {
    const start = match.index
    // to the end of the block that opens on its first line, or the line itself
    let end = text.indexOf("\n", start)
    if (end === -1) end = text.length
    const open = text.slice(start, end).lastIndexOf("{")
    if (open !== -1 && !text.slice(start + open, end).includes("}")) {
      let depth = 0
      for (let i = start + open; i < text.length; i++) {
        if (text[i] === "{") depth++
        else if (text[i] === "}" && --depth === 0) {
          end = i + 1
          break
        }
      }
    } else if (/=\s*$/.test(text.slice(start, end))) {
      // an ADT: the variants on the lines below
      const rest = /^(?:\n[ \t]*\|[^\n]*)+/.exec(text.slice(end))
      if (rest !== null) end += rest[0].length
    }
    if (!out.has(match[2]!)) out.set(match[2]!, { kind: match[1]!, name: match[2]!, start, end })
  }
  return out
}

/** The word, `|>` or `effect*` at an offset, with its range and the namespace before a dot. */
export const wordAt = (
  text: string,
  offset: number
): { readonly word: string; readonly start: number; readonly end: number; readonly qualifier?: string } | undefined => {
  if (text.slice(offset - 1, offset + 1) === "|>" || text.slice(offset, offset + 2) === "|>") {
    const start = text.slice(offset, offset + 2) === "|>" ? offset : offset - 1
    return { word: "|>", start, end: start + 2 }
  }
  let start = offset
  let end = offset
  while (start > 0 && /[\w$]/.test(text[start - 1]!)) start--
  while (end < text.length && /[\w$]/.test(text[end]!)) end++
  if (start === end || /^\d/.test(text.slice(start, end))) return undefined
  let word = text.slice(start, end)
  if (word === "effect" && text[end] === "*") {
    word = "effect*"
    end++
  }
  if ((word === "yield" || word === "function") && text[end] === "*") end++
  const qualifier = /([A-Za-z_$][\w$]*)\.$/.exec(text.slice(Math.max(0, start - 64), start))?.[1]
  return qualifier === undefined ? { word, start, end } : { word, start, end, qualifier }
}

/** One Effect export's docs, as `src/lib/effectDocs.ts` writes them. */
export interface EffectDoc {
  readonly summary: string
  readonly when?: string
  readonly category?: string
  readonly examples?: string
}

/** Effect's docs, fetched a namespace at a time and kept. */
export interface DocsSource {
  readonly bare: () => Promise<Readonly<Record<string, string>>>
  readonly namespace: (name: string) => Promise<Readonly<Record<string, EffectDoc>> | undefined>
}

/** The docs index the site writes: the bare builtins, and the namespaces that have a file. */
export interface DocsIndex {
  readonly bare: Readonly<Record<string, string>>
  readonly namespaces: ReadonlyArray<string>
}

/** Effect's docs from `base`: the index once, then each namespace's file the first time it's asked. */
export const fetchDocs = (base: string): DocsSource => {
  const cache = new Map<string, Promise<unknown>>()
  const get = <A>(file: string): Promise<A | undefined> => {
    let found = cache.get(file)
    if (found === undefined) {
      found = fetch(`${base}/${file}.json`).then((r) => (r.ok ? r.json() : undefined), () => undefined)
      cache.set(file, found)
    }
    return found as Promise<A | undefined>
  }
  const index = () => get<DocsIndex>("index")
  return {
    bare: () => index().then((i) => i?.bare ?? {}),
    namespace: async (name) =>
      (await index())?.namespaces.includes(name) === true ? get<Record<string, EffectDoc>>(name) : undefined
  }
}

export interface Hover {
  readonly start: number
  readonly end: number
  readonly markdown: string
}

const constructMarkdown = (word: string, c: Construct, origin: string) =>
  [
    `**${word}** · ${c.what}`,
    c.status === undefined ? "" : `▲ ${c.status}`,
    c.body,
    c.page !== undefined
      ? `[Reference: ${c.page}](${origin}/docs/reference/${c.page})`
      : c.adr === undefined
      ? ""
      : `[Read the ADR](${c.adr})`
  ].filter((part) => part !== "").join("\n\n")

const effectMarkdown = (qualified: string, doc: EffectDoc, origin: string) =>
  [
    `**${qualified}**${doc.category === undefined ? "" : ` · ${doc.category}`}`,
    doc.summary,
    doc.when === undefined ? "" : `*When to use:* ${doc.when.replace(/^Use (when|to) /, (_, w: string) => `${w} `)}`,
    doc.examples === undefined ? "" : `[Examples in EffectScript](${origin}${doc.examples})`
  ].filter((part) => part !== "").join("\n\n")

const kinds: Readonly<Record<string, string>> = {
  schema: "data, with its schema",
  brand: "a branded type",
  error: "a typed error",
  service: "a service",
  config: "configuration",
  layer: "a layer",
  api: "an HTTP API",
  group: "HTTP endpoints",
  rpc: "an RPC group",
  tool: "a tool",
  toolkit: "a toolkit",
  entity: "a cluster entity",
  workflow: "a durable workflow",
  command: "a CLI command",
  atom: "an atom",
  resource: "a resource",
  worker: "a worker",
  stack: "a stack",
  law: "a law",
  effect: "an effect function",
  "effect*": "a stream function"
}

const clipLines = (text: string, max: number) => {
  const lines = text.split("\n")
  return lines.length <= max ? text : `${lines.slice(0, max).join("\n")}\n  …`
}

/**
 * The hover for `text` at `offset`: a declared name's declaration, an EffectScript construct, or
 * an Effect export's docs. `source` is the EffectScript the names are declared in.
 */
export const hoverAt = async (
  text: string,
  offset: number,
  language: "efx" | "ts",
  source: string,
  docs: DocsSource,
  origin: string
): Promise<Hover | undefined> => {
  const at = wordAt(text, offset)
  if (at === undefined) return undefined
  const { end, qualifier, start, word } = at
  const range = { start, end }
  // a name this file declares, unless it is the member of something else
  const declared = qualifier === undefined ? declarations(source).get(word) : undefined
  if (declared !== undefined) {
    const head = `**${declared.name}** · ${kinds[declared.kind] ?? declared.kind}`
    const from = language === "ts" ? "Declared in the EffectScript:" : ""
    return {
      ...range,
      markdown: [head, from, "```efx\n" + clipLines(source.slice(declared.start, declared.end), 10) + "\n```"]
        .filter((p) => p !== "").join("\n\n")
    }
  }
  if (language === "efx" && qualifier === undefined) {
    const line = text.slice(
      text.lastIndexOf("\n", start - 1) + 1,
      text.indexOf("\n", start) === -1 ? text.length : text.indexOf("\n", start)
    )
    if (endpoint.test(line) && line.trimStart().startsWith(word)) {
      return { ...range, markdown: constructMarkdown(word, endpointDoc, origin) }
    }
    const construct = constructs[word === "catch" || word === "finally" ? "try" : word]
    if (construct !== undefined) return { ...range, markdown: constructMarkdown(word, construct, origin) }
  }
  if (language === "ts" && (word === "yield" || word === "function") && text[end - 1] === "*") {
    const c = word === "yield"
      ? {
        what: "what `await` became",
        body:
          "Runs an effect inside the generator `Effect.fn` and `Effect.gen` take: EffectScript writes it as `await`.",
        page: "effect"
      }
      : {
        what: "the body of an effect",
        body: "`Effect.fn` and `Effect.gen` take a generator; EffectScript writes it as an `effect` function or block.",
        page: "effect"
      }
    return { ...range, markdown: constructMarkdown(`${word}*`, c, origin) }
  }
  // Effect's own docs: a qualified export, or a free name the prelude imports
  const qualified = qualifier !== undefined ? `${qualifier}.${word}` : (await docs.bare())[word]
  if (qualified === undefined) {
    const namespace = await docs.namespace(word)
    return namespace === undefined
      ? undefined
      : {
        ...range,
        markdown:
          `**${word}** · Effect's \`${word}\` module\n\n[Examples in EffectScript](${origin}/docs/effect/api/effect/${word.toLowerCase()})`
      }
  }
  const [ns, member] = qualified.split(".") as [string, string]
  const doc = (await docs.namespace(ns))?.[member]
  return doc === undefined ? undefined : { ...range, markdown: effectMarkdown(qualified, doc, origin) }
}
