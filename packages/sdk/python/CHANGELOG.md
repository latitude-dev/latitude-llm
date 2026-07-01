# Changelog

All notable changes to the Python SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [6.9.0] - 2026-07-01

### Added

- `query` on `client.analytics` gains the `behaviors` stream — taxonomy observations (behavior instances clustered from session moments). Metrics: `count`, or `{avg|min|max|median}` of the 0–1 assignment `confidence`. Breakdown by `cluster`, `session`, or `method`.

## [6.8.0] - 2026-07-01

### Added

- `query` on `client.analytics` gains the `scores` stream — the signal grain. A signal is scored occurrences carrying a `signalId`; analyze one via `stream="scores"` filtered by `score.signalId` (or broken down by `signalId`). Metrics: `count`, `passRate`, `errorRate`, or `{avg|min|max|median}` of the 0–1 score `value`. Breakdown by `signalId`/`source` or a trace dimension (`model`/`provider`/`service`/`tool`/`tag`) resolved through the score's trace. Score values/rates are returned raw (0–1).

## [6.7.0] - 2026-07-01

### Added

- `query` on `client.analytics` (sync and async) — run a composable analytics query: a metric over a filtered stream, optionally broken down by a dimension and/or bucketed over time, returning a tidy series (`key` / `bucket_start` / `value` items) for charts and dashboards. The request is discriminated on `stream`: `traces` accepts a semantic `query` and a `breakdown` (`model`, `provider`, `service`, `tool`, `tag`, `name`, `userId`, `status`); `sessions` accepts a semantic `query` and the same breakdowns minus `name`; `spans` accepts a `breakdown` (the scalar dims plus the span-only `operation`). Metrics are `count`, `errorRate`, `cacheHitRate`, or `{sum|min|max|avg|median}` over `duration`/`cost`/`tokens`. Adds the `AnalyticsQuery` request and `AnalyticsSeries` response types. Result `value`s are in display units — seconds for `duration`, dollars for `cost`, a 0–1 ratio for `errorRate`/`cacheHitRate`, otherwise a raw count/token total.

## [6.6.0] - 2026-06-30

### Changed

- Renamed `affected_traces_percent` → `affected_sessions_percent` on the `Signal` (list) and `SignalDetail` (detail) response models (JSON alias `affectedSessionsPercent`). The value is the fraction of project sessions affected by the signal, in `[0, 1]` (sessions are the platform's primary unit); the previous name mislabeled a sessions-based ratio as traces. Update any code reading `signal.affected_traces_percent` to `signal.affected_sessions_percent`.

## [6.5.0] - 2026-06-29

### Added

- `MonitorMetricCacheHitRate` / `MonitorMetric_CacheHitRate` (`kind="cacheHitRate"`) — a new monitor metric kind that measures the token-weighted prompt-cache hit rate (cache-read tokens over total input-side tokens, a 0..1 fraction). Pair it with a `below` threshold on `metric.threshold` / `metric.escalating` to alert when caching degrades.

## [6.4.0] - 2026-06-29

### Added

- `update_row` on `client.datasets` (sync and async) — partially update a single dataset row by id. Send only the cells you want to change (`input`, `output`, `expected_output`, `metadata`, or `custom` values keyed by column identifier); omitted cells keep their current value. Custom values are merged onto the row's existing ones and validated against the dataset's active columns. Adds the `UpdateDatasetRowResponse` type.

## [6.3.0] - 2026-06-29

### Added

- `list_columns`, `add_column`, `update_column`, `delete_column`, `reorder_columns`, and `restore_column` on `client.datasets` (sync and async) — manage a dataset's column schema over the API. List the columns (pass `include_removed` to include soft-removed ones), add custom columns, rename any column, soft-delete a column (built-in or custom; its data is preserved), reorder columns, and restore a removed column. Adds the `DatasetColumn` and `DatasetColumnSource` types and a `columns` field on `Dataset`.
- Row writes accept custom column values: `client.datasets.insert_rows` takes a `custom` map keyed by column identifier, and `DatasetRow` now carries a `custom` field on reads (removed columns are omitted).

## [6.2.1] - 2026-06-26

### Fixed

- Project list/get/create/update responses now strip internal-only `settings` fields (`is_sample`, `onboarding_type`, `onboarding_completed`, `sampling`) that could leak from Postgres and break MCP `listProjects` output validation.

### Changed

- Monitor target responses now document the normalized fields returned by monitor endpoints (`kind`, `stream`, `saved_search_id`, and `metric`).

## [6.2.0] - 2026-06-26

### Added

- `client.signals.create`, `client.signals.update`, and `client.signals.delete` on `LatitudeApiClient` and `AsyncLatitudeApiClient` — author signals over the API. `create` registers a signal with its own evaluation (declarative settings, e.g. an LLM judge with `criteria`, or a raw `script`) plus optional `priority` and `filters`; `update` changes a signal's `name`, `description`, and `filters`; `delete` removes a user-authored signal. Adds the `CreateSignalResponse` and `UpdateSignalResponse` types.

### Changed

- `Evaluation.alignment` and `Evaluation.aligned_at` are now optional — they are omitted for raw or deterministic evaluations that are not annotation-aligned.

## [6.1.0] - 2026-06-17

### Added

- `ProjectSettings.notifications.destinations.quarantine` (`DestinationNotificationsSetting`) — project-level toggle for data-destination notifications. Members are notified (in-app + email) when a destination is quarantined after repeated sync failures; set `quarantine: false` to opt the project out. Defaults to `true`.
- `client.signals` on `LatitudeApiClient` and `AsyncLatitudeApiClient`, replacing the former issues resource name.

## [6.0.0] - 2026-06-12

Complete rewrite for the new Latitude platform. The package is now generated by [Fern](https://buildwithfern.com/) from our OpenAPI spec and targets the v6 public API. It is **not** backwards compatible with `latitude-sdk` 5.x, which targeted the legacy prompt-management platform — none of the 5.x surface (prompts, runs, evaluations push, logs) carries over.

### Added

- `LatitudeApiClient` and `AsyncLatitudeApiClient`, mirroring the TypeScript `@latitude-data/sdk` v6 surface: `client.account`, `client.projects`, `client.members`, `client.api_keys`, `client.oauth_keys`, `client.traces`, `client.saved_searches`, `client.issues`, `client.incidents`, `client.monitors`, `client.datasets`, `client.scores`, and `client.annotations`.
- Bearer-token auth, configurable base URL / environment, per-request timeouts, retries, and a pluggable `httpx` client.
- Fully typed request/response models (Pydantic v2) exported from `latitude_sdk`.
