# Changelog

All notable changes to the TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [7.2.0] - 2026-07-03

### Added

- `semantic_similarity` rule condition for signal evaluations. `client.signals.create` (and `update`) now accept a `{ type: "semantic_similarity", query, operator?, threshold }` item in a `rule` evaluation's `conditions`, which matches a session's messages against `query` by embedding similarity. `operator` defaults to `gte`; `threshold` is in `[0, 1]`.

## [7.1.0] - 2026-07-01

### Added

- `client.spans.query` — a cursor-paginated list of spans across all traces in a project, filtered by a span-field `FilterSet` (`operation`, `toolName`, `model`, `provider`, `sessionId`, `traceId`, `tags`, `duration`, `cost`, `tokensInput`/`tokensOutput`) and an optional time `range`. The row-level, span-grain complement to `client.analytics.query` with `stream: "spans"` (aggregates) — use it to drill from an aggregate into the individual spans behind it.

## [7.0.0] - 2026-06-30

Regenerated on the latest Fern toolchain — Fern CLI `0.83.0` → `5.58.0` and the `fern-typescript-node-sdk` generator `3.64.1` → `3.73.4`. The HTTP API surface (endpoints, request/response schemas) is unchanged; `openapi.json` changes are limited to `info` metadata and the auth security scheme (now modeled as an API key).

### Renamed (breaking)

- The root client and its companion exports drop the `Api` infix (via the generator's `naming.namespace` config): `LatitudeApiClient` → `LatitudeClient`, `LatitudeApiError` → `LatitudeError`, `LatitudeApiTimeoutError` → `LatitudeTimeoutError`, `LatitudeApiEnvironment` → `LatitudeEnvironment`, and the wildcard namespace export `LatitudeApi` → `Latitude` (`import * as LatitudeApi` → `import * as Latitude`). Update imports and `new LatitudeApiClient(...)` to `new LatitudeClient(...)`.
- The client auth option is renamed `token` → `apiKey` (the credential is an organization-scoped API key, sent as `Authorization: Bearer <key>`). Update `new LatitudeClient({ token })` to `new LatitudeClient({ apiKey })`.

### Removed (breaking)

- Some standalone query-parameter enum types are no longer exported as named types — they're now inlined as literal unions. Affected names include `DatasetsListRequestSortBy`/`SortDirection`, `DatasetsListColumnsRequestIncludeRemoved`, `DatasetsListRowsRequestSortDirection`, `IncidentsListRequestSeveritiesItem`/`SourceType`, `SavedSearchesListTracesRequestSortBy`/`SortDirection`, `SignalsListRequestLifecycleGroup`/`SortBy`/`SortDirection`, the `Tools*Request*` and `Users*Request*` parameter enums, and `FilterConditionValueItem`. If you imported any by name, use the literal value inline instead.

### Added

- The `apiKey` option now falls back to the `LATITUDE_API_KEY` environment variable when omitted (via the OpenAPI spec's `x-fern-bearer` extension), so `new LatitudeClient()` works when that env var is set. An explicitly passed `apiKey` takes precedence.
- The generator emits additional fine-grained union-member/enum types and some internal module restructuring. No new endpoints or methods.

## [6.10.0] - 2026-07-01

### Added

- `client.analytics.query` gains the `moments` stream — semantic-moment labels (kind/actor-tagged moments detected within a session). Metrics: `count`, or `{avg|min|max|median}` of the 0–1 label `confidence` or moment `coherence`. Breakdown by `kind`, `actor`, or `session`. Values are returned raw (0–1).
- The `traces`/`sessions`/`spans` streams gain a `p95` metric — the 95th-percentile of `duration`/`cost`/`tokens` (seconds/dollars/raw), the tail-latency complement to `median`.

## [6.9.0] - 2026-07-01

### Added

- `client.analytics.query` gains the `behaviors` stream — taxonomy observations (behavior instances clustered from session moments). Metrics: `count`, or `{avg|min|max|median}` of the 0–1 assignment `confidence`. Breakdown by `cluster`, `session`, or `method`.

## [6.8.0] - 2026-07-01

### Added

- `client.analytics.query` gains the `scores` stream — the signal grain. A signal is scored occurrences carrying a `signalId`; analyze one via `stream: "scores"` filtered by `score.signalId` (or broken down by `signalId`). Metrics: `count`, `passRate`, `errorRate`, or `{avg|min|max|median}` of the 0–1 score `value`. Breakdown by `signalId`/`source` or a trace dimension (`model`/`provider`/`service`/`tool`/`tag`) resolved through the score's trace. Score values/rates are returned raw (0–1).

## [6.7.0] - 2026-07-01

### Added

- `client.analytics.query` — run a composable analytics query: a metric over a filtered stream, optionally broken down by a dimension and/or bucketed over time, returning a tidy series (`{ key?, bucketStart?, value }[]`) for charts and dashboards. The request is discriminated on `stream`: `traces` accepts a semantic `query` and a `breakdown` (`model`, `provider`, `service`, `tool`, `tag`, `name`, `userId`, `status`); `sessions` accepts a semantic `query` and the same breakdowns minus `name`; `spans` accepts a `breakdown` (the scalar dims plus the span-only `operation`). Metrics are `count`, `errorRate`, `cacheHitRate`, or `{sum|min|max|avg|median}` over `duration`/`cost`/`tokens`. Adds the `AnalyticsQuery` request and `AnalyticsSeries` response types. Result `value`s are in display units — seconds for `duration`, dollars for `cost`, a 0–1 ratio for `errorRate`/`cacheHitRate`, otherwise a raw count/token total.

## [6.6.0] - 2026-06-30

### Changed

- Renamed `affectedTracesPercent` → `affectedSessionsPercent` on the `Signal` (list) and `SignalDetail` (detail) response types. The value is the fraction of project sessions affected by the signal, in `[0, 1]` (sessions are the platform's primary unit); the previous name mislabeled a sessions-based ratio as traces. Update any code reading `signal.affectedTracesPercent` to `signal.affectedSessionsPercent`.

## [6.5.0] - 2026-06-29

### Added

- `MonitorMetric.CacheHitRate` (`kind: "cacheHitRate"`) — a new monitor metric kind that measures the token-weighted prompt-cache hit rate (cache-read tokens over total input-side tokens, a 0..1 fraction). Pair it with a `below` threshold on `metric.threshold` / `metric.escalating` to alert when caching degrades.

## [6.4.0] - 2026-06-29

### Added

- `client.datasets.updateRow` — partially update a single dataset row by id. Send only the cells you want to change (`input`, `output`, `expectedOutput`, `metadata`, or `custom` values keyed by column identifier); omitted cells keep their current value. Custom values are merged onto the row's existing ones and validated against the dataset's active columns. Adds the `UpdateDatasetRowBody` and `UpdateDatasetRowResponse` types.

## [6.3.0] - 2026-06-29

### Added

- `client.datasets.listColumns`, `addColumn`, `updateColumn`, `deleteColumn`, `reorderColumns`, and `restoreColumn` — manage a dataset's column schema over the API. List the columns (pass `includeRemoved` to include soft-removed ones), add custom columns, rename any column, soft-delete a column (built-in or custom; its data is preserved), reorder columns, and restore a removed column. Adds the `DatasetColumn` and `DatasetColumnSource` types and a `columns` field on `Dataset`.
- Row writes accept custom column values: `client.datasets.insertRows` takes a `custom` map keyed by column identifier, and `DatasetRow` now carries a `custom` field on reads (removed columns are omitted).

## [6.2.1] - 2026-06-26

### Fixed

- Project list/get/create/update responses now strip internal-only `settings` fields (`isSample`, `onboardingType`, `onboardingCompleted`, `sampling`) that could leak from Postgres and break MCP `listProjects` output validation.

### Changed

- `MonitorTarget` now includes normalized response fields (`kind`, `stream`, `savedSearchId`, and `metric`) returned by monitor endpoints.

## [6.2.0] - 2026-06-26

### Added

- `client.signals.create`, `client.signals.update`, and `client.signals.delete` — author signals over the API. `create` registers a signal with its own evaluation (declarative `settings`, e.g. an LLM judge with `criteria`, or a raw `script`) plus optional `priority` and `filters`; `update` changes a signal's `name`, `description`, and `filters`; `delete` removes a user-authored signal. Adds the `CreateSignalBody`, `UpdateSignalBody`, `CreateSignalResponse`, and `UpdateSignalResponse` types.

### Changed

- `Evaluation.alignment` and `Evaluation.alignedAt` are now optional — they are omitted for raw or deterministic evaluations that are not annotation-aligned.

## [6.1.0] - 2026-06-17

### Added

- `ProjectSettings.notifications.destinations.quarantine` (`DestinationNotificationsSetting`) — project-level toggle for data-destination notifications. Members are notified (in-app + email) when a destination is quarantined after repeated sync failures; set `quarantine: false` to opt the project out. Defaults to `true`.
- `client.signals`, signal request/response types, and signal exports, replacing the former issues resource name.

## [6.0.0] - 2026-06-12

First stable release of the v6 SDK — the package leaves alpha. The API surface is unchanged from `6.0.0-alpha.8`; from here on, breaking changes only land with a major version bump.

The stable surface covers `client.account`, `client.projects`, `client.members`, `client.apiKeys`, `client.oauthKeys`, `client.traces`, `client.savedSearches`, `client.issues`, `client.incidents`, `client.monitors`, `client.datasets`, `client.scores`, and `client.annotations` — see the alpha entries below for how each landed.

## [6.0.0-alpha.8] - 2026-06-12

### Added

- **`client.incidents.resolve(projectSlug, incidentId)`** and the `POST /v1/projects/{projectSlug}/incidents/{incidentId}` endpoint — resolves (closes) an ongoing incident and returns it. Resolving an already-closed incident is a no-op that returns it unchanged; an incident id that doesn't exist in the project returns 404. If the incident's condition triggers again, a new incident opens.

## [6.0.0-alpha.7] - 2026-06-11

### Changed

- **A monitor now has exactly one alert.** `CreateMonitorBody.alerts` requires exactly one entry (was: one or more). The alert is edited in place via `client.monitors.updateAlert` and lives for as long as its monitor.
- **Saved searches with a semantic component can't be monitored.** `client.monitors.create` and `client.monitors.updateAlert` return 400 when the watched saved search's query contains unquoted free text (semantic search ranks the closest traces by meaning instead of applying an exact rule, so a monitor has no match rule to count against). Only quoted `"literal"` and backtick `` `phrase` `` terms are monitorable.

### Removed

- **`client.monitors.createAlert(...)`** and the `POST /v1/projects/{projectSlug}/monitors/{monitorSlug}/alerts` endpoint — alerts only come into existence with their monitor (`client.monitors.create`).
- **`client.monitors.deleteAlert(...)`** and the `DELETE /v1/projects/{projectSlug}/monitors/{monitorSlug}/alerts/{alertId}` endpoint — monitor alerts are edited in place (`updateAlert`), never deleted individually. Alerts are still removed when their monitor or watched saved search is deleted.

## [6.0.0-alpha.6] - 2026-06-05

### Added

- **`client.monitors`** — `list`, `create`, `get`, `update`, `delete`, `listAlerts`, `createAlert`, `getAlert`, `updateAlert`, `deleteAlert`, `listIncidents`, `mute`, `unmute`. A monitor groups one or more saved-search alerts. The three issue-lifecycle monitors are auto-provisioned (`system: true`) and reject `delete` / `update` / adding or removing alerts — only `mute` / `unmute` and editing an existing alert's condition values are allowed. `list` and `listIncidents` are cursor-paginated; `listIncidents` items carry a `notified` flag.
- New shared types: `Monitor`, `MonitorAlert`, `MonitorAlertSource`, `AlertCondition`, `AlertCountThreshold`, `AlertBaseline`, `AlertDuration`, `MonitorIncident`, `PaginatedMonitors`, `PaginatedMonitorIncidents`, and the request bodies `CreateMonitorBody`, `CreateMonitorAlertBody`, `UpdateMonitorBody`, `UpdateMonitorAlertBody`.

### Changed

- **`Incident`** gained `monitorAlertId` (the firing monitor alert, or `null` for unattributed incidents) and `condition` (the firing alert's `AlertCondition` snapshot, or `null` for no-parameter kinds). Both fields are additive and appear on every `client.incidents.list` item and on `client.monitors.listIncidents` items.

## [6.0.0-alpha.5] - 2026-06-04

### Removed

- **`client.savedSearches.assign(...)`** and the `POST /v1/projects/{projectSlug}/searches/{searchSlug}/assign` endpoint — saved searches no longer carry an assignee.
- **`SavedSearch.assignedUserId` and `SavedSearch.createdByUserId`** — dropped from the saved-search payload. `assignedUserId` is also removed from `CreateSavedSearchBody` and `UpdateSavedSearchBody`.

## [6.0.0-alpha.4] - 2026-06-02

### Added

- **`DatasetRow.expectedOutput`** — new free-form cell (string or JSON object) for the curated "correct" answer, distinct from the recorded `output`. Returned on every `client.datasets.listRows` / `getRow` payload.
- **`client.datasets.insertRows({ rows: [{ ..., expectedOutput }] })`** — optional input field on each row. Trace imports leave it empty; curators fill it in by hand.

## [6.0.0-alpha.3] - 2026-06-02

### Changed

`datasets.exportRows(...)` now returns a discriminated `{ status: "ready" | "queued" | "too_large", ... }` envelope with `ExportDatasetRowsReadyResponse`, `ExportDatasetRowsQueuedResponse`, and `ExportDatasetRowsTooLargeResponse`
types.

## [6.0.0-alpha.2] - 2026-05-20

### Added

- **`client.account`** — `get()` returns the caller's account snapshot (organization + role + user; user/role are `null` for API-key callers).
- **`client.members`** — `list`, `get`, `invite`, `update`, `remove`. Mutations require an OAuth-authenticated caller; API-key callers receive 403.
- **`client.apiKeys`** — `get` and `update` added (alpha.1 already shipped `list`, `create`, `revoke`). `get` returns the unmasked token; `list` continues to return masked tokens.
- **`client.oauthKeys`** — `list`, `get`, `revoke`. Read-only metadata about OAuth clients connected to the organization; tokens are never exposed by any of these endpoints.
- **`client.traces`** — `list`, `get`, `listSpans`, `getSpan`, `listAnnotations`, `getAnnotation`, `export`, `analytics`. The export endpoint takes a `TracesRef` and emails a CSV to a verified org member.
- **`client.savedSearches`** — `list`, `create`, `get`, `update`, `delete`, `assign`, `listTraces`. `create` and `assign` require OAuth.
- **`client.issues`** — `list`, `get`, `trend`, `listTraces`, `resolve`, `unresolve`, `ignore`, `unignore`, `monitor`, `unmonitor`, `export`, `analytics`. Bulk lifecycle methods are idempotent. `monitor` is rate-limited (`critical`).
- **`client.incidents`** — `list` with optional `[fromIso, toIso]` window (default trailing 7 days) and array filters `sourceTypes` / `sourceId` / `kinds` / `severities`.
- **`client.datasets`** — `list`, `get`, `create`, `update`, `delete`, plus row methods `listRows`, `insertRows`, `deleteRows`, `importRowsFromTraces`, `exportRows`. Row selection uses the shared `ExportSelection` shape (`selected` / `all` / `allExcept`).
- **Analytics endpoints** on `client.traces.analytics` and `client.issues.analytics` — top-line totals/medians plus 12-hour UTC-aligned bucket series. Cost is in USD, durations in seconds (no microcents / nanoseconds on the wire).
- **Pagination shape** — every paginated list now returns `{ items, nextCursor, hasMore }`. Cursors are opaque base64url strings.
- New shared types: `TracesRef` (plural-form sibling of `TraceRef`), `ExportSelection`, `Incident`, `Dataset`, `DatasetRow`, `Annotation` (replaces `AnnotationScoreResponse`), `PaginatedTraces`, `PaginatedIssues`, `PaginatedDatasets`, `PaginatedDatasetRows`, `PaginatedSavedSearches`, and a number of supporting evaluation/score/score-source types.

### Changed

- **`client.projects.list`** now returns a paginated page (`{ items, nextCursor, hasMore }`) instead of a flat `{ projects: [...] }`. Callers should switch from `result.projects` to `result.items`.
- **`Project`** gained `settings` (issue / escalation / notification overrides) and `flaggers` fields. Existing field access keeps working; new fields are additive.
- **`ApiKey`** and **`ApiKeyListItem`** shapes were refined: list rows now carry `maskedToken` instead of `token`; detail responses return the full unmasked `token`.
- **`FilterSet` / `FilterCondition`** types tightened to match the API's discriminated-union shape (richer operator surface, percentile filters).
- Path parameters on detail endpoints were renamed for clarity (`/api-keys/{id}` → `/api-keys/{apiKeyId}`, `/members/{id}` → `/members/{memberId}`). SDK call sites are unaffected because the parameters are positional; only the on-wire path changed.

### Removed

- **`AnnotationScoreResponse`** type — superseded by `Annotation`. Imports must be updated.
- **`ProjectList`** type — superseded by `PaginatedProjects`. Imports must be updated.

## [6.0.0-alpha.1] - 2026-05-06

### Breaking Changes

- **`CreateAnnotationBody` no longer accepts the flat `messageIndex` / `partIndex` / `startOffset` / `endOffset` fields at the top level.** The nested `anchor` object is now the only supported shape:

  ```diff
  - client.annotations.create("project-slug", {
  -   value: 1, passed: true, feedback: "…",
  -   trace: { by: "id", id: "…" },
  -   messageIndex: 2,
  -   partIndex: 0,
  -   startOffset: 10,
  -   endOffset: 25,
  - })
  + client.annotations.create("project-slug", {
  +   value: 1, passed: true, feedback: "…",
  +   trace: { by: "id", id: "…" },
  +   anchor: { messageIndex: 2, partIndex: 0, startOffset: 10, endOffset: 25 },
  + })
  ```

- **`CreateAnnotationBody` no longer accepts `sessionId` or `spanId`.** Both fields are now auto-resolved server-side from the target trace: the session is lifted off the trace, and the span is pinned to the trace's last LLM completion. Callers that were passing either field should remove them — the resolved values are returned on the response. (Internal use cases keep accepting concrete values; only the public API was simplified.)

- **`CreateAnnotationBody` no longer accepts `annotatorId`.** API keys are organization-scoped, not user-scoped, so there is no real Latitude user behind an API request. Annotations created via the public API persist with `annotatorId = null` to avoid letting any token holder attribute work to any teammate. Callers that were passing this field should remove it.

- **`client.annotations.create` no longer accepts `id` or `draft` in the body.** The public annotations API is creation-only and always publishes immediately:
  - `id` is gone — every submission creates a new annotation; client-supplied ids are no longer accepted. Editing an existing annotation is not exposed through the public API.
  - `draft` is gone — every API-submitted annotation is written with `draftedAt = null` and emits `ScoreCreated` with `status: "published"`. Draft state is reserved for the managed UI's editing flow.

  ```diff
  - await client.annotations.create("my-project", {
  -   value: 1, passed: true, feedback: "…",
  -   trace: { by: "id", id: "…" },
  -   draft: false,
  - })
  + await client.annotations.create("my-project", {
  +   value: 1, passed: true, feedback: "…",
  +   trace: { by: "id", id: "…" },
  +   // `id` and `draft` are no longer accepted.
  + })
  ```

- **`CreateScoreBody` (custom and `_evaluation` variants) no longer accepts `traceId`, `sessionId`, or `spanId`.** Trace association is now done via a required `trace` field — the same `TraceRef` discriminated union used by `CreateAnnotationBody` (`{ by: "id", id }` for an exact trace id, or `{ by: "filters", filters }` to resolve a single trace from attribute filters). `sessionId` is lifted from the trace and `spanId` is pinned to the trace's last LLM completion server-side:

  ```diff
  - client.scores.create("project-slug", {
  -   sourceId: "my-eval",
  -   traceId: "0123456789abcdef0123456789abcdef",
  -   sessionId: "session-123",
  -   spanId: "aaaaaaaaaaaaaaaa",
  -   value: 0.87, passed: true, feedback: "…",
  - })
  + client.scores.create("project-slug", {
  +   sourceId: "my-eval",
  +   trace: { by: "id", id: "0123456789abcdef0123456789abcdef" },
  +   value: 0.87, passed: true, feedback: "…",
  + })
  ```

## [6.0.0-alpha.0] - 2026-04-22

### Added

- Initial Fern-generated TypeScript SDK for the Latitude API.
- Resources: `health`, `projects`, `scores`, `annotations`, `apiKeys`.
- `client.fetch()` passthrough for endpoints not yet covered by the typed surface.
- Bearer-token auth, configurable base URL / environment, retries, timeouts, and pluggable fetch implementation.
