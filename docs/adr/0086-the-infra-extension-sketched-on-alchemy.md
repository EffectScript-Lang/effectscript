# ADR-0086: The infra extension, sketched: resources, workers that serve an `api`, and stacks on Alchemy v2

- **Status:** Proposed (the syntax waits for the user's review); the playground shows it as a
  proposal, and its examples follow the docs
- **Date:** 2026-10-05
- **Deciders:** the user, in conversation, on the playground's examples: "please read all our docs
  etc when writing the samples for example the brand etc, or the 'command' for clis"; and on
  Alchemy: "imagine how the alchemy would look. you would not need to include Alchemy. just
  Cloudflare right. also no need to include the HttpServerResponse perhaps. think." Agent proposal
  for the syntax.
- **Related:** ADR-0083 (extensions; this fills in the infra candidate), ADR-0085 (partly
  superseded: its rule that extension examples use today's syntax), ADR-0077 (names from
  declarations), ADR-0064 (`error … status`), ADR-0075 (`law`), spec §4.14 (`api`/`group`/`impl`),
  §4.18 (Foldkit's model), §14 (roadmap)

## Context

ADR-0085 wrote the extension examples in today's EffectScript, so the Alchemy one imported
`alchemy`, wrapped the file in `Alchemy.Stack`, provided a binding layer by hand and answered with
`HttpServerResponse`. The user wants to see what the extension would make of it.

Alchemy v2's own guide for an Effect HTTP API on a Worker (alchemy.run, "Effect HTTP API") shows
the target. It needs these steps:

- **The bucket:** `Cloudflare.R2.Bucket("Tasks")`, with its name written twice.
- **The Worker:** `Cloudflare.Worker("Worker", { main: import.meta.url }, …)`. A Worker is the
  default export of its own file.
- **Binding:** `yield* Cloudflare.R2.ReadWriteBucket(Tasks)` inside the Worker's constructor, plus
  `Effect.provide(Cloudflare.R2.ReadWriteBucketBinding)`.
- **The handlers:** `HttpApiBuilder.group(…)`.
- **Serving:** `fetch: yield* HttpRouter.toHttpEffect(HttpApiBuilder.layer(Api).pipe(…))`, with
  `Etag`, `Path` and a stub `HttpPlatform`.
- **The stack:** a separate `alchemy.run.ts` with
  `Alchemy.Stack(name, { providers, state }, …)`.

EffectScript already writes the `api`, its groups and their handlers (`impl`) as declarations. It
already takes identifiers from declaration names: `schema`, `error`, `service`, `brand`.

Alchemy's R2 calls fail with `R2Error`, a `Data.TaggedError` rather than a Schema. An HTTP endpoint
can't declare it as an error, so a handler turns it into a defect or into a declared error.

## Decision (proposed)

### Switching it on

- The sketch writes `// @efx infra cloudflare`, next to the existing `// @efx` headers: the
  extension, then the providers the file uses. How a project switches extensions on is still
  ADR-0083's open question.
- The extension's prelude brings in each named provider's namespace (`Cloudflare` from
  `alchemy/Cloudflare`) when it is a free name, as the core prelude does for `effect`. No file
  imports `alchemy`.

### `resource`

- **Form:** `[export] resource Name = Provider.Kind(props?)`.
- **Output:** `const Name = Provider.Kind("Name", props?)`. The resource's ID is the declared name.

### Binding

- **`await R`**, in `effect` code where `R` is a resource, binds it. The compiler writes the
  kind's read-write binding: `yield* Cloudflare.R2.ReadWriteBucket(R)` for an R2 bucket.
- **The binding layer:** the enclosing `impl`, `layer` or `effect` gets the kind's native Worker
  binding layer (`Layer.provide(Cloudflare.R2.ReadWriteBucketBinding)`), so nothing upstream
  provides it by hand.
- **A table** maps each kind to Alchemy's names, like the prelude's table.

### `worker`

- **Form:** `[export default] worker Name serves Api with Handlers`.
- **Output:** `Cloudflare.Worker("Name", { main: import.meta.url }, …)`, whose constructor returns
  `{ fetch }` from `HttpRouter.toHttpEffect`. That effect serves `HttpApiBuilder.layer(Api)`, with
  the handler layers and the platform layers Alchemy's guide provides.
- **`with`** keeps its core meaning, providing a layer (as in `describe … with`), so it claims
  nothing new (ADR-0083).
- **Responses are the API's:** the success schemas encode the body, and `error … status` sets the
  status. No handler builds an `HttpServerResponse`.
- **One worker per module:** Alchemy loads a Worker from its file's default export.

### `stack`

- **Form:** `stack App { Site, … }`, in `alchemy.run.efx`.
- **Output:** `export default Alchemy.Stack("App", { providers, state }, …)`, returning each
  worker's URL.
- **Providers:** the header's providers (`Cloudflare.providers()`, merged with others). The state
  store is the first one's (`Cloudflare.state()`). The stack file doesn't see its workers'
  resources, so the header names them (revised while the sketch was under review, when the
  playground gained its `alchemy.run.efx`, ADR-0088).

### Keywords

`resource`, `worker`, `stack` and `serves`. The landing page's extension list says so, and its
test keeps them apart from the core's and the other extensions'.

### The playground's examples follow the docs

Every example uses the forms the syntax reference, the spec and the ADRs teach:

- **Brands:** `brand` and `where` (ADR-0077).
- **Laws:** the proofs spec's own bank example (§2.1) and its lowering (§2.2).
- **The Elm Architecture:** spec §4.18. Messages are a `schema` union, the update is a `match`,
  commands are effects, the state is an `atom` and the view is JSX with `@effect/atom-react`.
  Nothing imports `foldkit`.
- **Infra:** this sketch.

Syntax that isn't built shows the lowering its ADR specifies, labelled. The parts today's compiler
already writes (the API, the code before a law, the code after the brands) are tested against its
output.

## Consequences

- **Size:** a Worker with storage and a typed HTTP API is about thirty lines of declarations. The
  output is the roughly seventy lines of Alchemy's guide, and the source names no Alchemy, binding
  layer or response type.
- **Cross-module binding:** `await R` needs to know `R`'s kind. A resource declared in the same
  module is enough for the example. For an imported resource, the compiler would have to read the
  imported `.efx` module's declarations, which the per-file compiler doesn't do today. The fallback
  is the explicit binding call, which is valid code anyway.
- **Unverified against Alchemy:** Alchemy v2 is in beta. The lowering follows its guide, but nothing
  here has run against it. The `HttpPlatform` stub is copied from that guide and may move into
  Alchemy.
- **Storage failures:** `R2Error` can't be an endpoint error, so handlers write `|> orDie` on
  storage calls (a 500), as the guide does. A typed `error … status 503` is the alternative when a
  client should see the cause.
- **Roadmap wording changes:** the landing page and the spec's §14 named `infra` and `resource`. The
  sketch replaces `infra` with `worker` and `stack`. If the user prefers an enclosing `infra` block,
  that is a later ADR.

## Alternatives considered

- **Keep today's syntax (ADR-0085):** honest, but it shows exactly the ceremony an extension exists
  to remove, and the user asked to see the extension.
- **A `fetch` handler that returns strings or `Response`s:** no typed API, no statuses from errors,
  and `HttpServerResponse` or `Response` comes back.
- **One `infra App { resource …; worker … }` block per stack:** reads as one unit, but Alchemy loads
  each Worker from its own module's default export, and resources are shared across modules.
  Module-level declarations fit that.
- **Explicit binding calls only** (`await Cloudflare.R2.ReadWriteBucket(Uploads)`): no new meaning
  for `await`, but the binding layer still has to be provided by hand. That layer is the ceremony
  the extension removes.
- **Infer the stack from every worker in the project, with no `stack` declaration:** needs a
  whole-project view, like the roadmap's automatic layer wiring. One explicit line is enough for
  now.
- **Import `Cloudflare` explicitly:** works, but free names already come from the prelude in
  EffectScript. An extension's provider namespaces are its vocabulary.
