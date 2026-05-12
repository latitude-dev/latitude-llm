# Telemetry SDKs

Latitude's TypeScript and Python telemetry SDKs expose a class-based bootstrap API for application instrumentation.

## Bootstrap API

- TypeScript uses `new Latitude({ ... })` from `@latitude-data/telemetry`.
- Python uses `Latitude(...)` from `latitude_telemetry`.
- The bootstrap object exposes the OpenTelemetry tracer provider as `provider` and lifecycle methods for flushing and shutdown.
- TypeScript also exposes `ready: Promise<void>` because instrumentation registration is asynchronous; Python registration is synchronous and does not expose `ready`.

The bootstrap class is responsible for:

- validating `apiKey` / `api_key` and `projectSlug` / `project_slug`
- configuring the Latitude span processor and exporter
- registering requested LLM instrumentations
- installing W3C trace-context and baggage propagation when the SDK owns the provider
- registering graceful shutdown handling

## Existing OpenTelemetry providers

The class-based bootstrap should be constructed after any existing OpenTelemetry-compatible observability SDK, such as Sentry, Datadog, New Relic, Honeycomb, or a custom OTel SDK. When a provider is already registered, Latitude attaches its `LatitudeSpanProcessor` to that provider instead of replacing the app's context manager, propagator, sampler, or other processors.

For manual setups, applications can still add `LatitudeSpanProcessor` directly to their own provider and call the instrumentation registration helper.

## Python compatibility

`init_latitude()` remains available in the Python package as a backwards-compatible wrapper. New docs and examples should prefer `Latitude(...)`; legacy code using `init_latitude()` receives the previous dict shape containing `provider`, `flush`, and `shutdown`.
