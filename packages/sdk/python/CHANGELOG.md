# Changelog

All notable changes to the Python SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [9.7.0] - 2026-07-28

### Added

- `settings.redaction` on `client.projects.update` and on the project response: server-side PII redaction applied before spans are stored. Set `mode: "enforce"` to scan span content for the configured categories and replace matches with a labelled placeholder, with `entities` choosing the categories, `scopes.metadata` extending the scan to metadata and tags, and `identities` controlling whether user identifiers are kept or pseudonymized. Applies only to spans ingested after the change and cannot be undone.

### Changed

- `client.projects.update` now *patches* `settings` instead of replacing it. Fields you omit keep their stored values, so updating one setting no longer clears the others.

## [9.6.1] - 2026-07-24

### Changed

- `client.datasets.export_rows` and `client.signals.export` now raise `TooManyRequestsError` when the export is rate-limited (HTTP 429), instead of a generic error.

## [9.6.0] - 2026-07-22

### Added

- `client.memory` group for reading memory observability: `list_stores` (cursor-paginated store roll-up), `get_store` (current snapshot, optional point-in-time `at`), `get_store_diff` (per-record diff between two timestamps), `list_store_users`, `get_record` (body plus version history), `get_record_change` (one change's before/after diff), `list_record_reads`, and `list_record_users`. Store and record ids are opaque query params, so the unattributed (`""`) store and the unnamed record are reachable.
- `client.sessions.get_memory` / `get_memory_changes` and `client.traces.get_memory` / `get_memory_changes` — a session's or trace's memory footprint (per-record read/added/removed token metrics and totals) and its per-record before/after write diffs.
- `client.users.memory_stores` — the memory stores an end-user accessed.

## [9.5.0] - 2026-07-21

### Added

- `client.signals` lifecycle methods `resolve` / `unresolve` / `ignore` / `unignore`. Resolving archives a signal while its evaluations keep watching for regressions; ignoring archives it, stops monitoring, and mutes notifications.
- Signal responses now carry `resolved_at`, `ignored_at`, and `regressed_at`, and `states` can include `resolved`, `regressed`, and `ignored`.
- Signal analytics now include `resolved` and `ignored` counts.

### Changed

- Muting a signal is now a pure notification toggle: incidents keep opening while muted.

## [9.4.0] - 2026-07-20

### Added

- `client.sessions` group for reading sessions (the traces of one conversation, grouped by session id): `list` (cursor-paginated, with `filters` + free-text `query`), `analytics` (per-metric totals/medians and a 12-hour bucket series over whole sessions), `get` (session detail with its GenAI `conversation` and `latest_trace_id`), `list_traces` (cursor-paginated traces of the session), `list_signals` (signals recorded across the session's traces), and `get_signal` (one session-scoped signal by slug).

## [9.3.0] - 2026-07-16

### Added

- `client.projects.update` `flaggers` map accepts two new slugs: `bluffing` (the assistant proceeds past a failed tool call as if it succeeded) and `pii-leakage` (the assistant's output exposes personal data it should not have surfaced).

## [9.2.0] - 2026-07-16

### Added

- `list_traces` filters now document and validate a dedicated `TraceFilterSet` (including `end_time`). Unknown filter fields and `gte_percentile` on `start_time`/`end_time` are rejected with 400 instead of being silently ignored or failing as 500.

## [9.1.0] - 2026-07-14

### Added

- `client.experiments` — manage project experiments that compare two or more variants against a baseline: `list`, `create`, `get`, `update`, `delete`. Each variant is a population defined by a `filter_set`, an optional search `query`, and a `time_range`; exactly one variant carries the `baseline` flag. `client.experiments.get` returns the full comparison — per-variant metrics grouped by entity (`sessions`, `users`, `tools`, `signals`, `behaviours`), where every metric is a `{ "value": ..., "delta": ... }` pair whose `delta` is the signed change versus the baseline (`None` on the baseline variant itself). `tools`, `signals`, and `behaviours` also carry a `top` ranked list.

## [9.0.0] - 2026-07-10

### Changed (breaking)

- `client.monitors.update` no longer accepts `target`, `trigger`, `metric`, or `condition`. Monitor target, trigger, metric, and incident-launching conditions are fixed after creation; use this call for `name`, `description`, and `severity` only.

## [8.1.0] - 2026-07-08

### Added

- `SignalDetail.monitoring_state` gains a `failed` variant, returned when the most recent evaluation generation or realignment workflow for the signal ended in failure. It carries `phase` (`"generate"` or `"realign"`), an optional `evaluation_id` (present only for `realign`), and a nullable `reason` with the resolved failure message. A later successful workflow supersedes an older failure, so `failed` only reflects the latest run.

## [8.0.1] - 2026-07-07

### Changed

- `client.spans.query` and `client.analytics.query` with `stream: "spans"` now use `SpanRowFilterSet` for `filters` — span row filters reject the `gtePercentile` operator (returns `400`). Use `client.analytics.query` with `{ "kind": "percentile", "field": ..., "p": ... }` for span percentile metrics instead.

## [8.0.0] - 2026-07-06

### Changed (breaking)

- `client.traces.get` (`TraceDetail`) now returns a single `conversation` field — the full trace conversation in OpenTelemetry GenAI format: the system instructions, then the running message history sent into the trace's last LLM-completion span, followed by that span's generated output. The previous `system_instructions`, `input_messages`, and `output_messages` fields are removed. They only captured the first turn's input and the last turn's output, silently dropping every intermediate turn and tool call — all of which `conversation` includes.

## [7.4.0] - 2026-07-03

### Added

- `client.spans.query` gains `order_by` (`startTime`/`duration`/`cost`, asc/desc) and a `status` span filter (`error`/`ok`/`unset`) — enabling "top-N slowest/costliest spans" and error-only drill-downs.
- `client.analytics.query` breakdown results now include a `label` — the human name for opaque `signalId`/`cluster` keys (the signal name / behavior-cluster name), so by-signal and by-behavior series are self-describing.

### Changed

- `client.analytics.query` percentile metric is now `{ "kind": "percentile", "field": ..., "p": ... }` (`p` in [1,99]) instead of the fixed `p95`. Use `p: 95` for the previous `p95` behavior.

## [7.3.0] - 2026-07-03

### Added

- `client.account.bootstrap` — create a temporary organization (with an API key and a project) and get a link to claim ownership of it. Unauthenticated; powers the agentic zero-account onboarding flow.

## [7.2.0] - 2026-07-03

### Added

- `semantic_similarity` rule condition for signal evaluations. `client.signals.create` (and `update`) now accept a `{ "type": "semantic_similarity", "query": ..., "operator": ..., "threshold": ... }` item in a `rule` evaluation's `conditions`, which matches a session's messages against `query` by embedding similarity. `operator` defaults to `gte`; `threshold` is in `[0, 1]`.

## [7.1.0] - 2026-07-01

### Added

- `client.spans.query` — a cursor-paginated list of spans across all traces in a project, filtered by a span-field `FilterSet` (`operation`, `toolName`, `model`, `provider`, `sessionId`, `traceId`, `tags`, `duration`, `cost`, `tokensInput`/`tokensOutput` — the DSL keys are camelCase regardless of SDK language) and an optional time `range`. The row-level, span-grain complement to `client.analytics.query` with `stream="spans"` (aggregates) — use it to drill from an aggregate into the individual spans behind it.

## [7.0.0] - 2026-06-30

Major regeneration on the latest Fern toolchain — Fern CLI `0.83.0` → `5.58.0` and the `fern-python-sdk` generator `4.32.2` → `5.15.0` (a major generator upgrade). The HTTP API surface (endpoints, request/response schemas) is unchanged; `openapi.json` changes are limited to `info` metadata and the auth security scheme (now modeled as an API key).

### Renamed (breaking)

- The client classes drop the `Api` infix (via the generator's `client_class_name` config): `LatitudeApiClient` → `LatitudeClient`, `AsyncLatitudeApiClient` → `AsyncLatitudeClient`, and the environment enum `LatitudeApiClientEnvironment` → `LatitudeEnvironment` (via `environment_class_name`). Update your imports and constructors (`from latitude_sdk import LatitudeClient`).
- The client auth argument is renamed `token` → `api_key` (the credential is an organization-scoped API key, sent as `Authorization: Bearer <key>`). Update `LatitudeClient(token=...)` to `LatitudeClient(api_key=...)`.

### Fixed

- Generated code examples and docstrings now import from `latitude_sdk` (the actual installed module) instead of the bare `latitude` package name (via the generator's `package_name` config).

### Removed (breaking)

- Standalone request/query-parameter enum types are no longer exported — they are inlined into the corresponding method signatures. Affected names include `DatasetsListRequestSortBy`, `DatasetsListRequestSortDirection`, `DatasetsListColumnsRequestIncludeRemoved`, `DatasetsListRowsRequestSortDirection`, `IncidentsListRequestSeveritiesItem`, `IncidentsListRequestSourceType`, `ListMonitorsForTargetBodyTargetType`, `UpdateMonitorBodySeverity`, `UpdateMonitorBodyTrigger`, `SavedSearchesListTracesRequestSortBy`/`SortDirection`, `SignalsListRequestLifecycleGroup`/`SortBy`/`SortDirection`, the `Tools*Request*` and `Users*Request*` parameter enums, and `FilterConditionValueItem`. If you imported any of these by name, pass the literal value inline.

### Added

- The `api_key` argument now falls back to the `LATITUDE_API_KEY` environment variable when omitted (via the OpenAPI spec's `x-fern-bearer` extension), so `LatitudeClient()` works when that env var is set. An explicitly passed `api_key` takes precedence.
- The v5 generator emits many more fine-grained union-member and enum types (e.g. `ActiveMemberStatus`, `AlertEscalatingConditionThreshold_Absolute`/`_Expected`/`_Multiplier`, `AlertThresholdConditionTrigger`, `AnnotationSource`) and ~226 additional type modules. No new endpoints or methods.

## [6.10.0] - 2026-07-01

### Added

- `query` on `client.analytics` gains the `moments` stream — semantic-moment labels (kind/actor-tagged moments detected within a session). Metrics: `count`, or `{avg|min|max|median}` of the 0–1 label `confidence` or moment `coherence`. Breakdown by `kind`, `actor`, or `session`. Values are returned raw (0–1).
- The `traces`/`sessions`/`spans` streams gain a `p95` metric — the 95th-percentile of `duration`/`cost`/`tokens` (seconds/dollars/raw), the tail-latency complement to `median`.

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
