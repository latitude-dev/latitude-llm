# Changelog

All notable changes to the Python Telemetry SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0a2] - 2026-04-17

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
