# ADR-0071: `entity` declares a cluster entity whose `impl` holds its state

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** agent ruling for Plan 23 (phase 17), from the spec §14 roadmap
- **Related:** spec §4.14; ADR-0069 (signature lines and `impl`)

## Context

`effect/cluster` declares an entity type with `Entity.make(type, [Rpc.make(…), …])`: a protocol of
RPCs, addressed by entity id and distributed across runners. `entity.toLayer(build)` runs `build`
once per entity instance, so locals in it are that instance's state, and each handler receives the
message's envelope (`envelope.payload`), not the bare payload as `RpcGroup` handlers do.

## Decision

- **`entity Name { lines }`**, with signature lines as for `rpc` (ADR-0069), compiles to `const Name
  = Entity.make("Name", [Rpc.make(…), …])`. The entity type is the declaration's name.
- Handlers are written with `impl Name { … }` (ADR-0069). The body's locals are the entity's state;
  handlers take the envelope (`({ payload }) => …`), exactly as Effect passes it, rather than
  having EffectScript unwrap it.
- The reverse compiler gives `entity` back from `Entity.make("Name", [Rpc.make(…), …])` when the
  type equals the binding's name.

## Consequences

- An entity reads like an RPC group, and its implementation like a service layer with state.
- Handlers see the envelope's other fields (the entity address, the request id) when they need them.
- Entity options (`maxIdleTime`, `concurrency`, mailbox capacity), `toLayerQueue`, persisted RPC
  annotations and `Entity.fromRpcGroup` stay TypeScript.
- **Cost if wrong:** if people find `{ payload }` noisy, a later ADR could unwrap it in `impl`; that
  would change handler code, so it is better decided before a release.

## Alternatives considered

- **Unwrapping the payload in `impl`:** handlers would read like RPC handlers, but the envelope's
  other fields would need a second syntax, and the output would no longer be the handler Effect
  documents.
- **`entity Name = rpcGroup`:** reusing an `rpc` group as a protocol; possible later with
  `Entity.fromRpcGroup`.
