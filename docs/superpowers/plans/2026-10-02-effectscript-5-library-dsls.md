# EffectScript Plan 5: Library DSLs and Telemetry

> **For agentic workers:** execute task by task with TDD. Decisions are recorded in `docs/adr/`.
> Gate every commit: `pnpm check && pnpm lint && git commit …`.

**Goal:** Add the remaining §4.14 constructs, `atom`, `group`/`api`/`impl` (HttpApi) and `command`
(CLI), plus zero-config OTLP telemetry for `main` (§4.16, ADR-0029).

**Architecture:** Parser productions:
- `AtomDeclaration`;
- `GroupDeclaration` with `EndpointLine`s;
- `ApiDeclaration`;
- `ImplExpression`;
- `CommandDeclaration`, with `--flag` parameters and JSDoc metadata.

Each gets a transform module (`atom.ts`, `httpApi.ts`, `command.ts`), using `ref()` hygiene and
§4.6 type → schema mapping (`typeToSchema`, `optionalField`).

**Spec:** §4.14 (`atom`, `api`/`group`/`impl`, `command`), §4.16. **Decisions:** ADR-0009,
ADR-0013 (optional fields are `optionalKey`), ADR-0029.

## Global Constraints

Plan 2–4 constraints apply. Every construct gets a golden that type-checks, plus behavior
evidence (runtime tests).

## Review Focus

1. Endpoint lines with every section kind, an optional name string, and multi-error
   `throws A | B`.
2. `impl` bodies: nested `effect` methods take span names `Api.group.endpoint`.
3. `command` flags: kebab-case conversion, `?` + default, JSDoc `@alias`, and positional
   arguments.
4. `atom` with `effect { … }`: the atom's value is an `AsyncResult`.
5. OTLP is off by default and leaves `main` output unchanged.

---

### Task 1: `atom`

- `atom name = expr [|> pipes]` → `const name = Atom.make(expr)[.pipe(Atom.<pipes>)]`.
- `effect { … }` initializers are effect blocks.
- Pipes resolve in the `Atom` namespace (`keepAlive`).
- `export atom` is allowed.
- **Test:** an `AtomRegistry` reads a derived atom, and `keepAlive` works.

### Task 2: OTLP for `main` (ADR-0029)

- The option is `observability?: "otlp" | undefined`; the directive is
  `// @efx observability otlp`.
- With it, `main` adds
  `Effect.provide(Otlp.layerFromConfig().pipe(Layer.provide([FetchHttpClient.layer, OtlpSerialization.layerJson])))`.
- **Tests:**
  - The golden type-checks.
  - With no `OTEL_*` configuration, a `main` program still runs.
  - Without the option, output is unchanged.

### Task 3: `group` and `api`

- `group` → `class X extends HttpApiGroup.make("name").add(HttpApiEndpoint.<m>(…), …)[.middleware(M)] {}`.
- `api` → `class X extends HttpApi.make("name").add(G1, G2) {}`.
- **Endpoint lines:** `<get|post|put|patch|del|head|options> <name> "<path>" [(sections)] [: Success] [throws E1 | E2]`.
  - The sections are `params`, `query`, `payload` and `headers`, each typed with §4.6 type literals.
  - A field map becomes `{ field: <schema> }`, with optional fields as `Schema.optionalKey`.
  - `del` → `HttpApiEndpoint.delete`.
  - Several errors → `error: [E1, E2]`.
- **Default identifiers:** strip a trailing `Api`/`Group` from the class name and camelCase the
  rest.
- **Tests:** the golden type-checks, and a client/handler round trip runs through `HttpApiBuilder`
  with an in-memory HTTP test client (see `HttpApiTest`).

### Task 4: `impl`

- `impl Api.group { … } [|> pipes]` →
  `HttpApiBuilder.group(Api, "group", Effect.fn("Api.group")(function*(handlers) { … return handlers.handleAll({ … }) }))[.pipe(Layer.<pipes>)]`.
- Top-level `return { … }` objects are wrapped in `handlers.handleAll(…)`.
- `effect` methods inside get span names `Api.group.method`.
- **Test:** a request through the test client reaches the implemented handler and maps a typed
  error.

### Task 5: `command`

- `command name(params) { … }` → `Command.make("name", { … }, Effect.fn("name")(function*({ … }) { … }))[.pipe(Command.withDescription(…))]`.
- **Parameter kinds:** `--x` is a flag (kebab-case name); a plain parameter is an `Argument`.
- **Type mapping:**
  - `string`, `boolean`, `Int`, `Finite`, `Date` and `Redacted` use the native constructor;
  - a literal union uses `Literals`;
  - any other type is `String` + `withSchema(T)`.
- **Modifiers:** `= d` → `withDefault(d)`, `?` → `optional`.
- **JSDoc:** the text becomes `withDescription`, and `@alias x` becomes `withAlias("x")`.
- `|> withSubcommands([…])` pipes resolve in the `Command` namespace.
- **Test:** `Command.runWith` parses the argv for flags, defaults, an alias and an argument, and the
  handler sees the typed values.

### Task 6: Docs

Update spec §4.14/§4.16 per the decisions above, plus the README and COMPATIBILITY.md.

## Final review

Run a fresh whole-branch review and fix Critical/Important findings with a failing test first.
Record deferred minors here.
