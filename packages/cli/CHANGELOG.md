# Changelog

All notable changes to the Latitude CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [7.4.0] - 2026-07-20

### Added

- `latitude sessions` commands for reading sessions (the traces of one conversation, grouped by session id): `list` (cursor-paginated, with `filters` + free-text `query`), `analytics` (per-metric totals/medians and a 12-hour bucket series over whole sessions), `get` (session detail with its GenAI conversation and latest trace id), `list-traces` (cursor-paginated traces of the session), `list-signals` (signals recorded across the session's traces), and `get-signal` (one session-scoped signal by slug).

## [7.3.0] - 2026-07-16

### Added

- `latitude projects update --flaggers` accepts two new slugs: `bluffing` (the assistant proceeds past a failed tool call as if it succeeded) and `pii-leakage` (the assistant's output exposes personal data it should not have surfaced).

## [7.2.0] - 2026-07-16

### Added

- `latitude traces list` documents a dedicated `TraceFilterSet` (including `endTime`). Unknown filter fields and `gtePercentile` on `startTime`/`endTime` are rejected with 400 instead of being silently ignored or failing as 500.

## [7.1.0] - 2026-07-14

### Added

- `latitude experiments list/get/create/update/delete` — manage project experiments that compare two or more variants (a filter set + search query + time range) against a baseline. `get` returns the full comparison: per-variant metrics across sessions, users, tools, signals, and behaviours, each with its signed change versus the baseline.

## [7.0.0] - 2026-07-10

### Changed (breaking)

- `latitude monitors update` no longer accepts `--target`, `--trigger`, `--metric`, or `--condition`. Monitor target, trigger, metric, and incident-launching conditions are fixed after creation; use this command for `name`, `description`, and `severity` only.

## [6.1.0] - 2026-07-08

### Added

- `latitude signals get` can now return a `failed` `monitoringState`, surfaced when the signal's most recent evaluation generation or realignment workflow ended in failure. It includes `phase` (`generate` or `realign`), an optional `evaluationId` (for `realign`), and a nullable `reason`. A later successful workflow supersedes an older failure.

## [6.0.0] - 2026-07-06

### Changed

- `latitude traces get` now returns a single `conversation` field — the full trace conversation in OpenTelemetry GenAI format: the system instructions, then the running message history sent into the trace's last LLM-completion span, followed by that span's generated output. The previous `systemInstructions`, `inputMessages`, and `outputMessages` fields are removed; `conversation` supersedes them and additionally includes every intermediate turn and tool call they dropped.

## [5.0.0] - 2026-07-06

### Changed

- **Version realigned to `5.0.0`** (from `0.4.0`), a deliberate jump with no functional change. A retired, unrelated 2025 CLI published `cli-*` GitHub releases up to `cli-4.0.0` under this same name; those tags carry no platform binaries. Leaping past them makes this crate the unambiguous newest `cli-*` release by semver, so agents and release-discovery tooling that pick the highest/newest tag resolve to a real, asset-bearing release. **Only `cli-5.0.0` and later are the real Latitude CLI; `cli-4.0.0` and below must be ignored.**

## [0.4.0] - 2026-07-03

### Added

- `latitude spans query` gains sort control (`order-by` on `startTime` / `duration` / `cost`, ascending or descending) and a `status` span filter (`error` / `ok` / `unset`) — enabling "top-N slowest/costliest spans" and error-only drill-downs.
- `latitude analytics query` breakdown results now include a `label` — the human name for opaque `signalId` / `cluster` keys (the signal name / behavior-cluster name), so by-signal and by-behavior series are self-describing.

### Changed

- `latitude analytics query` percentile metric is now an arbitrary `{kind:"percentile", field, p}` (`p` in [1,99]) instead of the fixed `p95`. Use `p: 95` for the previous `p95` behavior.

### Fixed

- `latitude spans query` pagination no longer skips or duplicates spans that share a `startTime` (common in batch ingest). Paging now uses a stable keyset cursor over `(sort key, spanId)` instead of an offset, so results stay consistent even as new spans arrive mid-pagination. The `--cursor` value stays opaque — no usage change.

## [0.3.0] - 2026-07-02

### Added

- `latitude account bootstrap` — create a temporary organization (with an API key and a project) and get a link to claim ownership of it. Unauthenticated; the terminal entry point for the agentic zero-account onboarding flow.

## [0.2.0] - 2026-07-02

### Added

- `latitude spans query` — list spans across all traces in a project, filtered by a span-field filter set and an optional time range. The row-level, span-grain complement to `latitude analytics query` with `stream=spans`.

## [0.1.0] - 2026-07-01

Initial release of the `latitude` CLI — a single, statically linked binary generated from the Latitude OpenAPI spec by [Fern](https://buildwithfern.com/).

### Added

- A command surface mapping every public API resource to a typed subcommand (`latitude projects list`, `latitude traces get`, `latitude analytics query`, …), with `--help` and a machine-readable `--schema` for each scope.
- Organization API-key auth: reads `LATITUDE_API_KEY`, or store a key in the OS keyring with `latitude auth login` (`auth status` / `auth logout`).
- Output formats for humans and agents: `--format json|table|yaml|csv|jsonl|raw|http`, a `--query` JMESPath filter, shell completions (`latitude completion`), and a man page (`latitude man`).
- Prebuilt binaries for macOS (arm64/x86_64), Linux (arm64/x86_64), and Windows (x86_64), attached to each GitHub release.
