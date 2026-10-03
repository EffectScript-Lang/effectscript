# EffectScript Plan 23: Library constructs: `rpc`, `tool`/`toolkit`, `entity`, `workflow` (phase 17)

> **For agentic workers:** execute task by task with TDD. Decisions are recorded in `docs/adr/`.
> Commit with explicit, gated paths (another session shares the branch).

**Goal:** the four library constructs on the spec §14 roadmap compile to Effect v4's own modules,
the way `group`/`api`/`impl` compile to `effect/http-api`: a declaration for the shape, and an
`impl` for the handlers.

**Architecture:** one shared parser for signature lines (`name(field: T, …): A throws E`), used by
`rpc`, `entity` and `tool`; one generic `impl X { … }` that compiles to `X.toLayer(Effect.gen(…
return X.of({ … })))` for every module whose value has `toLayer` and `of` (`RpcGroup`, `Toolkit`,
`Entity`); a `workflow` declaration with its body, and an `activity` expression inside it. Each
construct is a fixture first, then parser, transform, reverse compiler, tree-sitter.

**Tech stack:** acorn plugin, MagicString, `effect/rpc`, `effect/ai`, `effect/cluster`,
`effect/workflow` (all in the `effect` package).

**Spec:** `docs/superpowers/specs/2026-10-02-effectscript-design.md` §4.14, §14.

## Global Constraints

- Output is plain Effect: `Rpc.make`, `RpcGroup.make`, `Tool.make`, `Toolkit.make`,
  `Entity.make`, `Workflow.make`, `Activity.make`. No runtime of EffectScript's own.
- Every keyword (`rpc`, `tool`, `toolkit`, `entity`, `workflow`, `activity`, `key`) is contextual:
  valid TypeScript keeps its meaning.
- Every runtime test runs in memory: `RpcTest.makeClient`, a fake `LanguageModel`,
  `Entity.makeTestClient`, `WorkflowEngine.layerMemory`.
- Nothing is published. Brand files are never edited.

## Review Focus

1. **Payload shapes:** `Rpc.make`/`Workflow.make` take struct fields, `Tool.make` takes a schema
   (`Schema.Struct`); optional fields (`x?: T`) and schema-typed fields work in each. *(Tasks 1–4)*
2. **Handler arguments differ:** RPC handlers get `(payload)`, tool handlers `(params)`, entity
   handlers `(envelope)` with `envelope.payload`; `impl` must not hide that. *(Tasks 1–3)*
3. **Streaming RPCs:** a `Stream<A>` (or `Stream<A, E>`) return type is a streaming RPC whose
   handler returns a stream. *(Task 1)*
4. **Names stay names:** `const rpc = 1`, `tool.name`, `workflow()`, a field named `key`, an
   `impl` that is a variable. *(Tasks 1–4)*
5. **Round trips:** each output shape converts back; a hand-written `RpcGroup.make` with options
   EffectScript can't express stays TypeScript. *(Tasks 1–4)*

---

### Task 1: `rpc` groups and the generic `impl` (ADR-0069)

```efx
export rpc UsersRpc {
  getUser(id: string): User throws UserNotFound
  rename(id: string, name: string): User throws UserNotFound | Forbidden
  watch(id: string): Stream<UserEvent>
}

export const UsersLive = impl UsersRpc {
  const db = await Db
  return {
    getUser: effect ({ id }) => await db.find(id),
    …
  }
}
```

→ `export const UsersRpc = RpcGroup.make(Rpc.make("getUser", { payload: { id: Schema.String },
success: User, error: UserNotFound }), …, Rpc.make("watch", { payload: { … }, success: UserEvent,
stream: true }))` and `UsersRpc.toLayer(Effect.gen(function*() { … return UsersRpc.of({ … }) }))`.

- A line's fields are the payload's struct fields; no fields → no `payload`; `throws A | B` →
  `error: Schema.Union([A, B])`; no return type → `Schema.Void`.
- `impl X { … }` (one identifier) works for any value with `toLayer` and `of`; `impl Api.group`
  keeps its HttpApi meaning. Pipes after it apply to the layer.
- **Tests:** fixture `rpc/users.efx`; a runtime test through `RpcTest.makeClient` (success, typed
  failure, a stream); `const rpc = 1`; reverse golden; tree-sitter corpus.

### Task 2: `tool` and `toolkit` (ADR-0070)

```efx
/** Looks up the forecast for a city. */
export tool GetForecast(city: string, days?: number): Forecast throws WeatherError
export toolkit Assistant { GetForecast, GetTime }
export const AssistantLive = impl Assistant { return { GetForecast: effect ({ city }) => … } }
```

→ `Tool.make("GetForecast", { description: "Looks up the forecast for a city.", parameters:
Schema.Struct({ … }), success: Forecast, failure: WeatherError })` and `Toolkit.make(…)`.

- The doc comment is the description the model reads (as `command` help text is, §4.14).
- **Tests:** fixture `ai/tools.efx`; a runtime test with a fake `LanguageModel` that calls the tool
  and gets the handler's result; reverse golden; corpus.

### Task 3: `entity` (ADR-0071)

```efx
export entity Counter {
  increment(by: number): number
  current(): number
}
export const CounterLive = impl Counter { … return { increment: effect ({ payload }) => … } }
```

→ `Entity.make("Counter", [Rpc.make("increment", { payload: { by: Schema.Number }, success:
Schema.Number }), …])`; `impl` as in Task 1 (handlers get the envelope).

- **Tests:** fixture `cluster/counter.efx`; a runtime test through `Entity.makeTestClient`;
  reverse golden; corpus.

### Task 4: `workflow` and `activity` (ADR-0072)

```efx
export workflow SendWelcome(email: string): void throws EmailFailed key email {
  const id = await activity render(): string { return `welcome:${email}` }
  await activity send(): void throws EmailFailed { … }
}
```

→ a `Workflow.make("SendWelcome", { payload: { email: Schema.String }, success: Schema.Void,
error: EmailFailed, idempotencyKey: ({ email }) => email })` whose body is its `toLayer`, kept on
the workflow (`SendWelcome.layer`) the way a service keeps its layers; `activity name(): A throws
E { … }` → `Activity.make({ name: "name", success: A, error: E, execute: Effect.gen(…) })`.

- **Tests:** fixture `workflow/welcome.efx`; a runtime test on `WorkflowEngine.layerMemory`
  (`execute`, a typed failure, an activity's result); reverse golden; corpus.

### Task 5: Documentation

- The spec gets the four constructs in §4.14 and §14 drops them; the skill gets a pattern for
  each, type-checked; the generated reference picks up the fixtures.
