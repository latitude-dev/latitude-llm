# Telemetry SDKs

Latitude's TypeScript and Python telemetry SDKs expose a class-based bootstrap API for application instrumentation.

## Bootstrap API

- TypeScript uses `new Latitude({ ... })` from `@latitude-data/telemetry`.
- Python uses `Latitude(...)` from `latitude_telemetry`.
- The bootstrap object exposes the OpenTelemetry tracer provider as `provider` and lifecycle methods for flushing and shutdown.
- TypeScript exposes `ready: Promise<void>` as the stable registration boundary; consumers await it before creating instrumented clients or making calls. Python registration is synchronous and does not expose `ready`.
- Both SDKs expose `getTracer(scope, context?)` on the bootstrap instance. The returned tracer is scoped under `so.latitude.<scope>` and, when `context` is provided, stamps every span it starts with the same `latitude.*` attributes that `capture()` would attach.

The bootstrap class is responsible for:

- validating `apiKey` / `api_key` and `project` / `project_slug`
- configuring the Latitude span processor and exporter
- registering the requested LLM instrumentation instances
- installing W3C trace-context and baggage propagation when the SDK owns the provider
- registering graceful shutdown handling

`project` is the preferred option name. `projectSlug` / `project_slug` remain accepted for backwards compatibility; when both are set, `project` wins and a deprecation warning is logged.

TypeScript provider and framework instrumentations are opt-in subpath exports. Each `@latitude-data/telemetry/instrumentations/<name>` entry exports a factory that accepts the consumer's LLM SDK module and returns an OpenTelemetry instrumentation. `LatitudeOptions.instrumentations` is a readonly array of these instances. Provider implementations are package dependencies, but only their dedicated subpath entry points import them, allowing bundlers to exclude unused integrations. The main entry must not import or re-export provider instrumentation implementations.

## Capture

`capture()` is the primary way to attach Latitude context to a unit of work. Both SDKs use the same call-style signature:

```typescript
capture(name, fn, options?)
```

```python
capture(name, fn, options?)
# or as a decorator: @capture("agent-run", {"tags": ["prod"]})
```

`options` (`ContextOptions`) carries:

- `tags` — string tags, merged and deduplicated across nested captures
- `metadata` — shallow-merged JSON metadata
- `sessionId`, `userId`, `userEmail` — last-write-wins across nesting
- `project` — per-capture project override (see project scoping below)

Nested captures merge context rather than replacing it:

- tags accumulate and dedupe
- metadata shallow-merges child over parent
- `sessionId`, `userId`, `userEmail`, and `project` follow last-write-wins
- when a nested capture runs inside an active Latitude context, it reuses the existing trace instead of starting a new capture root span

Each non-nested capture creates a root span named after the capture. Sync functions end the span when the function returns; async functions end it in `finally` and record exceptions on the span before rethrowing.

### Capture lifecycle API

TypeScript also exposes an imperative lifecycle API for frameworks that cannot wrap work in a single callback:

```typescript
const scope = capture.start("agent-run", { sessionId: "sess-1", tags: ["prod"] })
try {
  await runAgent()
} catch (error) {
  capture.end(scope, error) // records the exception and ends the root span
  throw error
}
capture.end(scope)
```

`capture.start()` requires the Node async-hooks OpenTelemetry context manager (`context._asyncLocalStorage.enterWith`). It is not available on runtimes whose AsyncLocalStorage lacks `enterWith()`, such as Cloudflare Workers — use call-style `capture()` or the tracer helpers below on those runtimes.

`capture.end()` accepts either `(scope, error?)` or `(error?)` when ending the active scope.

## Manual instrumentation and AI SDK tracers

For manual spans or framework-owned tracers (for example Vercel AI SDK `experimental_telemetry.tracer`), use the bootstrap `getTracer()` method or the lower-level helpers exported from TypeScript:

- `getLatitudeTracer(scope)` — returns a tracer under `so.latitude.<scope>` that passes the smart export filter
- `latitudeAttributesFromContext(options)` — builds the `latitude.*` attribute map from `ContextOptions`
- `withLatitudeAttributes(tracer, attributes)` — wraps any tracer so every span it starts carries fixed attributes

Python mirrors the same helpers on `latitude_telemetry.sdk.tracer` (`get_latitude_tracer`, `latitude_attributes_from_context`, `with_latitude_attributes`) and exposes `Latitude.get_tracer(scope, context?)` on the bootstrap instance.

Spans carrying `latitude.*` attributes directly are indistinguishable from `capture()`-scoped spans on ingest. This matters on edge runtimes where ambient OTel context cannot be entered across async boundaries.

## Cross-boundary propagation

`injectTraceContext(context?)` and `extractTraceContext()` / `withTraceContext()` carry the active span and Latitude context across a boundary that has no ambient OpenTelemetry context: a Durable Object RPC call, a service binding, a queue message. The carrier is keyed by HTTP header names, so the same object works as an argument and as `fetch` headers. `withParentContext(tracer, context)` is the lower-level piece: it makes a framework-owned tracer attach its first span to a remote parent while leaving its own nesting intact. See [`trace-correlation.md`](trace-correlation.md) for the contract these share with the Hermes and Claude Code emitters.

## Cloudflare helpers

`@latitude-data/telemetry/cloudflare` holds the runtime-specific helpers, which are deliberately absent from the root import:

- `createCodemodeTelemetry()` — nests codemode-internal tool spans under the outer `execute` span.
- `createDurableObjectTelemetry()` — flushing for a runtime that evicts without warning. Exports are serialized and coalesced, a caller arriving mid-export gets a later one, in-flight exports register with `ctx.waitUntil()`, and a failed export is reported rather than thrown into the work being traced. Durable Objects must flush at each unit of work because the batch processor's timer is not a scheduler the runtime keeps alive.
- The propagation helpers above, re-exported for discoverability.

## Project scoping

Project routing uses three layers, highest precedence first:

1. per-span attribute `latitude.project` (set by per-capture `project` or tracer context)
2. OpenTelemetry resource attribute `latitude.project`
3. `X-Latitude-Project` header from the constructor default `project`

When the constructor omits `project`, every `capture()` call must set its own `project` (or rely on a per-span/resource attribute). This supports multi-project processes that emit to different Latitude projects from one service.

## Existing OpenTelemetry providers

The class-based bootstrap should be constructed after any existing OpenTelemetry-compatible observability SDK, such as Sentry, Datadog, New Relic, Honeycomb, or a custom OTel SDK. When a provider is already registered, Latitude attaches its `LatitudeSpanProcessor` to that provider instead of replacing the app's context manager, propagator, sampler, or other processors.

For manual setups, applications can still add `LatitudeSpanProcessor` directly to their own provider and call the instrumentation registration helper.

## Python compatibility

`init_latitude()` remains available in the Python package as a backwards-compatible wrapper. New docs and examples should prefer `Latitude(...)`; legacy code using `init_latitude()` receives the previous dict shape containing `provider`, `flush`, and `shutdown`.
