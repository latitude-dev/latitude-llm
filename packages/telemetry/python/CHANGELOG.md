# Changelog

All notable changes to the Python Telemetry SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0a8] - 2026-05-16

### Changed

- **Renamed `project_slug` → `project` on the `Latitude` constructor, `init_latitude()`, and `capture()` options.** The `Slug` suffix leaked an internal database concept into the SDK surface. Affects:
  - `Latitude(api_key=..., project=...)`
  - `init_latitude(api_key=..., project=...)`
  - `capture("name", fn, {"project": ...})`

### Deprecated

- `project_slug` on both the constructor and `capture()` options still works but logs a one-time `logging.warning` and will be removed in a future release. When both `project` and `project_slug` are passed, `project` wins.

### Migration

```diff
- Latitude(api_key=..., project_slug="my-project")
+ Latitude(api_key=..., project="my-project")

- capture("run", fn, {"project_slug": "evaluations"})
+ capture("run", fn, {"project": "evaluations"})
```

The `X-Latitude-Project` HTTP header name, the `latitude.project` span attribute, and the `LATITUDE_PROJECT_SLUG` environment variable convention are all unchanged — they're independent of the SDK option name.

## [3.0.0a7] - 2026-05-15

### Breaking Changes

- **`instrumentations` is now a dict mapping integration name → LLM SDK module.** Replaces the list-of-strings form. Example: `instrumentations={"openai": openai, "anthropic": anthropic}`. The caller passes the module they already imported in app code, so the patch lands on the same module instance the app actually uses. Mirrors the TypeScript SDK's object-form API for full feature parity.
- **The list-of-strings form (`instrumentations=["openai"]`) is removed with no fallback.** Anything other than a plain dict — including the old list — raises `TypeError` at register time with a migration hint. See the README's "Migrating from `instrumentations=[\"openai\"]`" section.
- **Unknown integration keys raise `TypeError`.** Previously a typo in an integration name silently no-op'd with a `logging.warning`. Now the bootstrap fails loudly, naming the supported keys.

### Added

- New `InstrumentationName` literal type and `InstrumentationsInput` alias exported from `latitude_telemetry`.
- **13 additional integrations** wired into the registry (the PyPI deps were already pinned in `pyproject.toml` but the registry only registered 10): `aleph_alpha`, `crewai`, `dspy`, `google_generativeai`, `groq`, `haystack`, `litellm`, `mistralai`, `ollama`, `replicate`, `sagemaker`, `transformers`, `watsonx`. Each takes the corresponding user-imported module.

### Removed

- The internal `INSTRUMENTATION_MAP` lookup with its `module/class/package/manual` fields, replaced by the typed `IntegrationDef` dataclass + a flat `INTEGRATIONS` dict.
- Internal `__import__` of the user's SDK module — the user now passes it directly.

## [3.0.0a6] - 2026-05-14

### Added

- **Per-span project scoping** — `capture({"project_slug": ...})` routes the wrapping function (and its OTel children) to a specific Latitude project by stamping `latitude.project` on the span. Useful when one process emits to multiple projects (e.g. multiple agents sharing a runtime). Server-side precedence: span attribute `latitude.project` → OTEL resource attribute `latitude.project` → `X-Latitude-Project` header.
- **Optional ctor `project_slug`** — `Latitude(api_key=...)` is now valid without a default project. When omitted the SDK sends no `X-Latitude-Project` header, and each `capture()` must set its own `project_slug` (or rely on a resource/span attribute). Existing callers passing `project_slug` in the ctor see no behavior change.

## [3.0.0a5] - 2026-05-13

### Added

- **Class-based bootstrap API** — `Latitude(...)` is now the primary entry point, matching the TypeScript SDK. It exposes `.provider`, `.flush()`, and `.shutdown()`, attaches to an existing OpenTelemetry provider when one is registered, and keeps `init_latitude()` as a backwards-compatible wrapper.

### Changed

- **Existing OpenTelemetry provider coexistence** — `Latitude(...)` attaches the Latitude span processor to a registered or explicitly passed provider when possible instead of replacing the application's provider or propagator setup.
- **`service_name` ownership is provider-aware** — when Latitude creates its own provider, `service_name` is applied to the provider resource as `service.name`; when Latitude attaches to an existing provider, the host SDK remains the source of truth for `service.name`.

### Fixed

- **Provider detection no longer depends on private OpenTelemetry globals** — the SDK now uses the public tracer provider API and treats proxy/no-op providers as unregistered providers.

## [3.0.0a4] - 2026-05-08

### Changed

- **Default exporter URL is now `https://ingest.latitude.so`** — previously the SDK fell back to `http://localhost:3002` whenever `LATITUDE_TELEMETRY_URL` was unset, which silently dropped traces for any consumer who didn't read the docs and explicitly export the env var. Production ingest is now the only default; point at a different ingest by setting `LATITUDE_TELEMETRY_URL` explicitly (e.g. `LATITUDE_TELEMETRY_URL=http://localhost:3002` for local development).

## [3.0.0a3] - 2026-05-06

### Added

- **OpenAI Agents SDK auto-instrumentation** — new `"openai-agents"` instrumentation type wires `openinference-instrumentation-openai-agents` (Arize OpenInference) into the SDK. Spans cover agent runs, generations, responses, function calls, handoffs, and guardrails. Pass `instrumentations=["openai-agents"]` to `Latitude(...)` and install the `openai-agents` package in your project.



### Fixed

- `capture()` now starts a new Latitude root trace when called under an active non-Latitude span, so wrapper spans such as workflow-level capture names are preserved instead of being absorbed into foreign traces.
- Nested Latitude `capture()` calls still reuse the existing Latitude-owned trace and merge context as before.

## [3.0.0a1] - 2026-04-01

### Breaking Changes

- **Complete SDK re-architecture** — monolithic `Telemetry` class replaced with modular, composable API
- **New bootstrap API** — `init_latitude()` replaces `Telemetry()` as primary entry point
- **`capture()` no longer creates spans** — now only attaches context to spans created by auto-instrumentation
- **Context propagation changed** — uses OpenTelemetry's native Context API instead of baggage
- Removed `Telemetry` class and `TelemetryOptions` — use `init_latitude()` or `LatitudeSpanProcessor`
- Removed `Instrumentors` enum — now use string literals via `register_latitude_instrumentations()`
- Removed `CaptureOptions` — now `ContextOptions` with slightly different structure
- Removed `BaggageSpanProcessor` — replaced with context-based approach in `LatitudeSpanProcessor`

### Added

- `init_latitude()` — one-call bootstrap for complete OTel + LLM instrumentation setup
- `LatitudeSpanProcessor` — composable span processor for shared-provider setups
- `register_latitude_instrumentations()` — register LLM auto-instrumentations (OpenAI, Anthropic, etc.)
- Smart span filtering — only LLM-relevant spans exported by default (gen_ai.*, llm.*, openinference.*, ai.* attributes)
- `disable_smart_filter` option — export all spans instead of just LLM spans
- `should_export_span` callback — custom span filtering
- `blocked_instrumentation_scopes` option — filter out unwanted instrumentation scopes
- `capture()` now supports nested calls with proper context merging (tags dedupe, metadata shallow merge, last-write-wins for user_id/session_id)
- `RedactSpanProcessorOptions` for configurable PII redaction
- New SDK module structure: `sdk/init.py`, `sdk/context.py`, `sdk/instrumentations.py`, `sdk/types.py`

### Changed

- SDK is now OpenTelemetry-first — designed for composability with existing OTel setups
- `capture()` uses OTel's `context.attach()`/`context.detach()` for reliable async context propagation
- `LatitudeSpanProcessor` is now a proper OTel SpanProcessor that reads context and stamps attributes

## [3.0.0a0] - 2026-04-01

### Breaking Changes

- Constructor now requires `project_slug` as second argument
- `capture()` no longer takes `path`/`project_id` — takes `tags`/`metadata`/`session_id`/`user_id` instead
- Removed opinionated span methods (`span.completion()`, `span.tool()`, etc.) — use `telemetry.tracer` directly
- Removed `GatewayOptions` and `InternalOptions` — SDK reads `LATITUDE_TELEMETRY_URL` env var directly
- Removed `SpanType`, `LogSources`, `SpanKind`, `SpanStatus`, `SPAN_SPECIFICATIONS`

### Added

- `telemetry.tracer` exposes raw OTel Tracer for custom span creation
- `capture()` creates a root span when no active span exists, grouping child spans under one trace
- `service_name` option in constructor
- `RedactSpanProcessor` for masking sensitive HTTP headers
- Auto-instrumentation for 21 AI providers

### Changed

- `capture()` sets trace-wide baggage (`latitude.tags`, `latitude.metadata`, `session.id`, `user.id`) propagated via BaggageSpanProcessor

## [2.0.4] - 2026-02-26

### Changed

- `capture()` now writes prompt reference fields into baggage so child spans inherit `path`, `project`, `commit`, and `conversation` metadata.

## [2.0.3] - 2026-01-29

### Fixed

- Fixed `@telemetry.capture()` decorator not working correctly with generator functions. The span now stays open until all items are yielded, enabling proper tracing for streaming LLM responses.
