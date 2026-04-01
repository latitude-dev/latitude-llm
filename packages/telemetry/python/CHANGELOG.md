# Changelog

All notable changes to the Python Telemetry SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
