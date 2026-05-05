# Changelog

All notable changes to the TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [6.0.0-alpha.1] - 2026-05-05

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

- **`CreateScoreBody` (custom and `_evaluation` variants) no longer accepts `traceId`, `sessionId`, or `spanId`.** Trace association is now done via the optional `trace` field — the same `TraceRef` discriminated union used by `CreateAnnotationBody` (`{ by: "id", id }` for an exact trace id, or `{ by: "filters", filters }` to resolve a single trace from attribute filters). When `trace` is provided, `sessionId` is lifted from the trace and `spanId` is pinned to the trace's last LLM completion. When `trace` is omitted, the score persists as uninstrumented (all three columns null) — same behavior as before omitting the flat fields:

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
