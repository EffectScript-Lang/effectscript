# ADR-0072: A `workflow` declaration carries its body as its layer; `activity` is an expression

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** agent ruling for Plan 23 (phase 17), from the spec §14 roadmap
- **Related:** spec §4.14; ADR-0069 (signature lines); ADR-0066 (`Object.assign` for a service's
  statics)

## Context

`effect/workflow` declares a durable workflow with `Workflow.make(tag, { payload, success, error,
idempotencyKey })` and gives it a body with `workflow.toLayer((payload, executionId) => effect)`.
Steps that must not repeat after a restart are activities, `Activity.make({ name, success, error,
execute })`, which are effects themselves. Unlike an RPC group, a workflow has exactly one body,
and the body is where the workflow is read.

## Decision

- **`workflow Name(fields): A throws E key <expression> { body }`.** The signature is a line as
  in ADR-0069; `key` is required and is the idempotency key, with the fields in scope; the body is
  `effect` code with the fields in scope.
- **Output:** `const NameWorkflow = Workflow.make("Name", { payload, success, error,
  idempotencyKey: ({ fields }) => key })` and `[export] const Name = Object.assign(NameWorkflow, {
  layer: NameWorkflow.toLayer(Effect.fn("Name")(function*({ fields }) { body })) })`. The body is
  the workflow's layer, kept on it as `Name.layer`, the way a service keeps `Name.layer`; the
  workflow is run with `Name.execute({ … })`.
- The body is indented one step deeper in the output. The engine provides the scope, so `defer`
  needs no `Effect.scoped`.
- **`activity name(): A throws E { body }`** is an expression → `Activity.make({ name: "name",
  success, error, execute: Effect.gen(function*() { body }) })`. It takes no parameters: its body
  reads the workflow's values, and its result is serialized with `A`'s schema.
- `workflow`, `activity` and `key` are contextual keywords.
- The reverse compiler gives the `workflow` back from the exact two statements, and `activity` from
  `Activity.make` with its options in the forward order.

## Consequences

- A workflow reads like an `effect` function with a key, and its durable steps are marked where
  they happen.
- `DurableClock`, `DurableDeferred`, compensation, the execution id argument and workflow options
  (`suspendedRetrySchedule`, annotations) are used as plain Effect calls inside the body.
- **Cost if wrong:** a workflow that needs its execution id gets it from `WorkflowInstance`; if
  that is common, a later ADR could add a binding for it.

## Alternatives considered

- **A separate `impl Name { … }` for the body, as for `rpc`:** a workflow has exactly one body, and
  splitting it from its signature and key hides what the workflow does.
- **Two exports, `Name` and `NameLayer`:** a name the source never writes; `Name.layer` matches
  services.
- **Activities with parameters (`activity send(to: string)`):** an activity is a step at one
  place in the body, not a reusable function; a reusable step is an `effect` function returning an
  activity.
