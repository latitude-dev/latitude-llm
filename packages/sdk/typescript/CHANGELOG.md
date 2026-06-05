# Changelog

All notable changes to the TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
