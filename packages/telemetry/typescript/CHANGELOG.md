# Changelog

All notable changes to the TypeScript Telemetry SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0-alpha.10] - 2026-05-14

### Added

- **Per-span project scoping** — `capture({ projectSlug })` routes the wrapping span (and its OTel children) to a specific Latitude project by stamping `latitude.project` on the span. Useful when one process emits to multiple projects (e.g. multiple agents sharing a runtime). Server-side precedence: span attribute `latitude.project` → OTEL resource attribute `latitude.project` → `X-Latitude-Project` header.
- **Optional ctor `projectSlug`** — `new Latitude({ apiKey })` is now valid without a default project. When omitted the SDK sends no `X-Latitude-Project` header, and each `capture()` must set its own `projectSlug` (or rely on a resource/span attribute). Existing customers passing `projectSlug` in the ctor see no behavior change.

## [3.0.0-alpha.9] - 2026-05-13

### Breaking Changes

- **Bootstrap API is now class-based** — `new Latitude(options)` replaces `initLatitude(options)` as the public TypeScript SDK entry point. `LatitudeOptions` replaces `InitLatitudeOptions`.

### Changed

- **Automatic existing OTel provider coexistence** — `new Latitude()` detects common existing tracing providers (Sentry, Datadog, New Relic, Honeycomb, and custom OpenTelemetry SDKs) and attaches the Latitude span processor when possible instead of replacing their tracer provider, context manager, propagator, sampler, or processors.
- **`serviceName` ownership is provider-aware** — when Latitude creates its own provider, `serviceName` is applied to the provider resource as `service.name`; when Latitude attaches to an existing provider, the host SDK remains the source of truth for `service.name`.

### Fixed

- **Provider detection no longer relies on private constructor names** — the SDK now uses OpenTelemetry's proxy provider delegate API and known span-processor containers to detect and attach to existing providers more reliably, including OTel JS v2 and Datadog bridge setups.

## [3.0.0-alpha.8] - 2026-05-08

### Changed

- **Default exporter URL is now always `https://ingest.latitude.so`** — the SDK no longer inspects `NODE_ENV` to decide between production and localhost. Previously, the default URL was `http://localhost:3002` whenever `NODE_ENV` was anything other than exactly `production`, which silently dropped traces for consumers who didn't set `NODE_ENV=production` or who used values like `staging`. Production ingest is now the only default; point at a different ingest by setting `LATITUDE_TELEMETRY_URL` explicitly (e.g. `LATITUDE_TELEMETRY_URL=http://localhost:3002` for local development).

## [3.0.0-alpha.7] - 2026-05-06

### Added

- **OpenAI Agents SDK auto-instrumentation** — new `"openai-agents"` instrumentation type for `initLatitude()` / `registerLatitudeInstrumentations()`. Hooks into the Agents SDK's native tracing system via `addTraceProcessor` and translates agent, generation, response, function, handoff, guardrail, MCP, and audio spans into OpenTelemetry spans on Latitude's tracer with `gen_ai.*` semantic-convention attributes. Works regardless of whether agents use the Responses API (default) or Chat Completions, with no monkey-patching of the OpenAI client. `@openai/agents` is an optional peer dependency.

### Fixed

- **`openai@6` manual instrumentation** — `manuallyInstrument()` is now passed the `OpenAI` class (`moduleRef.OpenAI`) instead of the package namespace. `openai@6` only exposes `Chat`/`Completions` as static members of the `OpenAI` class, so the previous namespace-based call silently no-op'd for v6 consumers. Auto-instrumentation now works on `openai@4`, `@5`, and `@6` alike.

## [3.0.0-alpha.6] - 2026-04-23

### Changed

- **Lazy-load Traceloop instrumentations** — `@traceloop/instrumentation-*` packages are now `await import()`ed inside `registerLatitudeInstrumentations()` only for the instrumentation types the caller requests, instead of being statically imported when `@latitude-data/telemetry` is loaded. Importing the SDK no longer pulls every provider instrumentation (and its transitive AI SDK graph — e.g. `@langchain/core`, `langchain`) into the consumer's bundle. When a requested instrumentation's package is missing, a clear warning is logged and that instrumentation is skipped.

## [3.0.0-alpha.5] - 2026-04-17

### Fixed

- `capture()` now starts a new Latitude root trace when called under an active non-Latitude span, so wrapper spans such as workflow-level capture names are preserved instead of being absorbed into foreign traces.
- Nested Latitude `capture()` calls still reuse the existing Latitude-owned trace and merge context as before.

## [3.0.0-alpha.4] - 2026-04-14

### Fixed

- **Provider SDK version coupling** — moved provider SDK packages (`openai`, `@anthropic-ai/sdk`, etc.) from `optionalDependencies` to `devDependencies` so they are no longer installed alongside `@latitude-data/telemetry`. Users can now use any compatible version of their provider SDK without conflicts.
- **Bumped all Traceloop instrumentations to `^0.25.0`** — notably extends OpenAI support from `>=4 <6` to `>=4 <7`, fixing auto-instrumentation for users on `openai@6.x`.

## [3.0.0-alpha.3] - 2026-04-07

### Added

- **`serviceName` on `LatitudeSpanProcessor` and `initLatitude()`** — optional `LatitudeSpanProcessorOptions.serviceName` / `InitLatitudeOptions.serviceName` sets OpenTelemetry **`service.name`** on each span so Latitude ingest can attribute telemetry to your service. When using `initLatitude()`, the value is also applied to the `NodeTracerProvider` resource (falling back to `npm_package_name` or `"unknown"` when omitted).

## [3.0.0-alpha.2] - 2026-04-07

### Changed

- OpenTelemetry peer stack upgraded to align with **@opentelemetry/sdk-trace-node 2.6** and **@opentelemetry/exporter-trace-otlp-http / instrumentation 0.213** (previously 1.x / 0.57), so `LatitudeSpanProcessor` and related types match apps using **@opentelemetry/sdk-node** 0.213+.

### Fixed

- `initLatitude()` and examples now use `resourceFromAttributes()` instead of `new Resource()` (OpenTelemetry JS 2.x API).
- Span filtering reads `ReadableSpan.instrumentationScope` instead of the removed `instrumentationLibrary` field.

## [3.0.0-alpha.1] - 2026-04-01

### Breaking Changes

- **Complete SDK re-architecture** — monolithic `Telemetry` class replaced with modular, composable API
- **New bootstrap API** — `initLatitude()` replaces `new Telemetry()` as primary entry point
- **`capture()` no longer creates spans** — now only attaches context to spans created by auto-instrumentation
- **Context propagation changed** — uses OpenTelemetry's native Context API instead of baggage
- Removed manual instrumentation (`telemetry.tracer` still available via advanced setup)
- Removed `Telemetry` class and `TelemetryOptions` interface
- Removed `Instrumentors` enum — now use string literals via `registerLatitudeInstrumentations()`

### Added

- `initLatitude()` — one-call bootstrap for complete OTel + LLM instrumentation setup
- `LatitudeSpanProcessor` — composable span processor for shared-provider setups
- `registerLatitudeInstrumentations()` — register LLM auto-instrumentations (OpenAI, Anthropic, etc.)
- Smart span filtering — only LLM-relevant spans exported by default (gen_ai.*, llm.*, openinference.*, ai.* attributes)
- `disableSmartFilter` option — export all spans instead of just LLM spans
- `shouldExportSpan` callback — custom span filtering
- `blockedInstrumentationScopes` option — filter out unwanted instrumentation scopes
- `capture()` now supports nested calls with proper context merging (tags dedupe, metadata shallow merge, last-write-wins for userId/sessionId)
- Integration examples for Datadog and Sentry

### Changed

- SDK is now OpenTelemetry-first — designed for composability with existing OTel setups
- `capture()` uses OTel's `context.with()` for reliable async context propagation
- Span processors use standard OTel APIs (no deprecated methods)
- Package structure: SDK split into `sdk/init.ts`, `sdk/context.ts`, `sdk/processor.ts`, `sdk/span-filter.ts`, `sdk/types.ts`

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
