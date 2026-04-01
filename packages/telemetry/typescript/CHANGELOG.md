# Changelog

All notable changes to the TypeScript Telemetry SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0-alpha.0] - 2026-04-01

### Breaking Changes

- Constructor now requires `projectSlug` as second argument
- `capture()` no longer takes `path`/`projectId` — takes `tags`/`metadata`/`sessionId`/`userId` instead
- Removed opinionated span methods (`span.completion()`, `span.tool()`, etc.) — use `telemetry.tracer` directly
- Removed `rosetta-ai` dependency
- Env var renamed from `GATEWAY_BASE_URL` to `LATITUDE_TELEMETRY_URL`

### Added

- `telemetry.tracer` exposes raw OTel Tracer for custom span creation
- `capture()` creates a root span when no active span exists, grouping child spans under one trace
- `serviceName` option in constructor
- `RedactSpanProcessor` for masking sensitive HTTP headers
- Auto-instrumentation for 10 AI providers via Traceloop

### Changed

- `capture()` sets trace-wide baggage (`latitude.tags`, `latitude.metadata`, `session.id`, `user.id`) propagated via BaggageSpanProcessor
- Span processors passed via `NodeTracerProvider` constructor (not deprecated `addSpanProcessor`)

## [2.0.4] - 2026-02-26

### Changed

- `capture()` now propagates `path`, `project`, `commit`, and `conversation` references through baggage so child spans inherit the same metadata.

## [2.0.2] - 2026-02-09

### Fixed

- Bump Rosetta AI version

## [2.0.1] - 2026-02-09

### Fixed

- Move Rosetta AI to dependencies

## [2.0.0] - 2026-02-04

### Added

- Manually instrumented completions now support any provider messages
- The manual instrumentation now exports compliant GenAI messages

## [1.1.1] - 2026-02-02

### Fixed

- Disabled `enrichTokens` for OpenAI and TogetherAI instrumentations to fix failures when using `stream: true`

## [1.1.0] - 2026-01-29

### Added

- Initial changelog for TypeScript Telemetry SDK
