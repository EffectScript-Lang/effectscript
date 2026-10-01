# ADR-0029: `main` telemetry uses `Otlp.layerFromConfig`

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** agent ruling for Plan 5
- **Related:** spec §4.16

## Context

Spec §4.16 had `main` emit a hand-written `Layer.unwrap(Effect.gen(…))`. It would read
`OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME` through `Config` and fall back to
`Layer.empty`. Effect v4's `Otlp.layerFromConfig()` (`effect/observability`) already does this, for
logs, metrics and traces. When the SDK is disabled or no endpoint is configured, it installs only a
no-op flusher. It also honors the standard `OTEL_*` variables (service name, headers, timeouts,
batch sizes).

## Decision

With `observability: "otlp"` (option or `// @efx observability otlp`), `main` provides:

```ts
Otlp.layerFromConfig().pipe(Layer.provide([FetchHttpClient.layer, OtlpSerialization.layerJson]))
```

It is provided after the user's pipes, alongside the runtime's services layer. The default is no
telemetry layer, because exporting has a cost and a network side effect.

## Consequences

- One readable line, identical to what an Effect user would write, with the full `OTEL_*` surface
  for free.
- JSON serialization over `fetch` is the fixed choice. Users who need protobuf or another HTTP client
  provide their own layer and leave the option off.

## Alternatives considered

- **The spec's generated `Layer.unwrap`:** more code to read and maintain, and fewer supported
  variables.
