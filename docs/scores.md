# Scores

Scores are the canonical operational facts of the reliability system.

Everything else is built on top of them:

- issues
- evaluation dashboards
- annotations
- simulations
- long-term analytics

## Storage Split

Scores use an intentional Postgres + ClickHouse split:

- Postgres stores the canonical mutable score row
- ClickHouse stores an immutable analytics projection of finalized scores

This split exists because mutable score lifecycle does not fit ClickHouse well:

- score rows can start as drafts
- failed non-errored scores only become immutable after `issue_id` is assigned
- human annotation edits should update one canonical row instead of creating replacement duplicates
- score-table reads need immediate consistency, while aggregate analytics can tolerate ClickHouse lag

## Canonical Postgres Store

Postgres is the source of truth for:

- the full logical score row
- `feedback`, `metadata`, and `error`
- draft state via `draftedAt`
- issue assignment via `issue_id`
- all mutable/default reads

The canonical `scores` table is organization-scoped and follows the repository's Postgres RLS conventions.

Core fields:

- `value`: normalized `[0, 1]`
- `passed`: boolean verdict
- `feedback`: clusterable human/LLM-friendly text
- `metadata`: source-specific JSON payload
- `error`: canonical error text for real score failures
- `errored`: boolean helper maintained on write
- `draftedAt`: nullable timestamp indicating that the score is still a draft
- `duration`, `tokens`, `cost`: resource usage, where `duration` is stored in nanoseconds and `cost` is stored in microcents

`feedback` deserves special emphasis.

Its text format is intentionally part of the reliability design:

- it must be readable and useful to both humans and LLMs
- it must be phrased so similar failures can cluster together cleanly
- it is the canonical text used both for semantic similarity search over issue centroids and for BM25 text search against issue names/descriptions
- it should describe the underlying failure pattern, not just dump incidental raw context

`error` is only for true failures. Draft state must not be encoded through sentinel error strings.

State semantics:

- draft: `draftedAt != null`
- passed final: `draftedAt = null`, `passed = true`, `errored = false`
- failed awaiting issue assignment: `draftedAt = null`, `passed = false`, `errored = false`, `issueId = null`
- failed final: `draftedAt = null`, `passed = false`, `errored = false`, `issueId != null`
- errored final: `draftedAt = null`, `errored = true`

Rules:

- drafts are excluded from default score listings, analytics, issue discovery, and evaluation alignment
- draft-aware surfaces such as queue review and in-progress annotation editing explicitly read drafts from Postgres
- writers must never emit a passed score with a non-empty `error`
- errored scores are observability-relevant, but they should not participate in issue discovery or evaluation alignment
- once a score is no longer a draft, it becomes immutable; it may later be deleted, but it should not be edited again

## Source Semantics

```typescript
type ScoreSource = "evaluation" | "annotation" | "custom";
```

- `source = "evaluation"` and `source_id = <evaluation-id>`
- `source = "annotation"` and `source_id = "UI" | "API" | <annotation-queue-cuid>`
- `source = "custom"` and `source_id = <user-defined-bucket>`

Enum-like score contracts should use literal-string unions like `ScoreSource`, not TypeScript enums.

Relationship fields:

- `session_id`
- `trace_id`
- `span_id`
- `simulation_id`
- `issue_id`

`simulation_id` and `issue_id` are nullable in Postgres.

`issue_id` remains part of the canonical logical model:

- issue-linked monitor scores can write it immediately
- discovered failed scores can fill it later
- helper projections are allowed for performance, but the logical `score.issue_id` contract must remain

## Metadata

Source-specific metadata stays intentionally lightweight:

- evaluation scores store `evaluationHash`
- annotation scores store raw or drafted feedback plus the minimal GenAI anchor fields needed to reopen the selection
- custom scores store arbitrary user-defined metadata

The metadata field is not intended for heavy analytical querying.

## Postgres Indexing

Because most operational score reads now live in Postgres, score indexing is part of the core model:

- partial btree on `(organization_id, project_id, created_at, id)` where `drafted_at IS NULL` for default non-draft project score reads
- partial btree on `(organization_id, project_id, source, source_id, created_at, id)` where `drafted_at IS NULL` for evaluation/custom bucket reads
- partial btree on `(organization_id, project_id, issue_id, created_at, id)` where `issue_id IS NOT NULL AND drafted_at IS NULL` for issue drilldowns and issue-backed reads
- partial btree on `(organization_id, project_id, trace_id, created_at, id)` where `trace_id IS NOT NULL` for trace-scoped score hydration
- partial btree on `(organization_id, project_id, session_id, created_at, id)` where `session_id IS NOT NULL` for session drilldowns
- partial btree on `(organization_id, project_id, span_id, created_at, id)` where `span_id IS NOT NULL` for span-scoped score hydration
- partial btree on `(organization_id, project_id, created_at, id)` where `drafted_at IS NULL AND errored = false AND passed = false AND issue_id IS NULL` for issue-discovery work selection
- partial btree on `(updated_at, id)` where `drafted_at IS NOT NULL` for draft-finalization scans
- do not add GIN/JSONB indexes on `metadata`, and do not add text-search indexes on `feedback` or `error` in the scores foundation phase

## ClickHouse Projection

ClickHouse is no longer the canonical score store. It keeps only the immutable analytics projection of finalized scores.

The ClickHouse row intentionally contains just aggregation-relevant fields:

- identifiers and telemetry links
- `source` and `source_id`
- `simulation_id` and `issue_id`
- `value`, `passed`, `errored`
- `duration`, `tokens`, `cost`
- `created_at`

It intentionally does not store:

- `feedback`
- `metadata`
- `error`
- `draftedAt`
- mutable replacement/version timestamps

Recommended initial physical layout:

- `MergeTree()`
- monthly partition on `created_at`
- primary key `(organization_id, project_id, created_at)`
- order by `(organization_id, project_id, created_at, source, source_id, session_id, trace_id, span_id, id)`
- keep `duration`, `tokens`, and `cost` as `UInt64`

ClickHouse fixed-width identifier rule:

- use `FixedString(24)` for CUID-valued columns such as score ids
- use non-null `FixedString(24)` plus the empty-string sentinel for optional CUID links such as `issue_id` and `simulation_id`
- use `FixedString(128)` for bounded non-CUID identifiers such as `session_id` and `source_id`
- use `FixedString(32)` for trace ids and `FixedString(16)` for span ids

Deployment-specific migration note:

- `unclustered/` migrations should use standard merge-tree engines
- `clustered/` migrations should use `ON CLUSTER default` plus the matching `ReplicatedMergeTree` variant
- the logical score-projection schema, partitioning, sort key, and skip indexes should stay identical between both variants

Rules:

- do not update or replace score rows in ClickHouse after insertion
- do not allow duplicate projected rows for the same score id
- analytics must remain correct without `FINAL` or app-level deduplication
- failed non-errored scores are not inserted into ClickHouse until `issue_id` is assigned and the score becomes immutable

## Drafts And Finalization

All score writes happen in Postgres first.

Publication rules:

- drafts never publish to ClickHouse
- non-draft passed or errored scores publish to ClickHouse immediately because they are already immutable
- non-draft failed non-errored scores stay only in Postgres until `issue_id` is assigned
- when a failed non-errored score finally receives `issue_id`, it becomes immutable and is then projected to ClickHouse
- ClickHouse publication must be retry-safe and preserve at-most-one projected row per score id

Draft-specific rules:

- human-created UI annotations are written as drafts in Postgres immediately, so refresh-safe reads do not depend on local memory or Redis
- draft finalization uses a debounced timeout after the last edit; the initial default is `5 minutes`
- human-editable draft finalization is driven by the debounced `annotation-scores:publish` topic task keyed by the canonical score id rather than browser-local timers or persisted due-work scans
- system-created queue annotations are also drafts, but they use `draftedAt` rather than an error sentinel
- system-created queue drafts do not use the automatic finalization path; they stay draft until explicit human review
- once a draft is finalized, it may be deleted later but should not be edited again

Delete behavior:

- delete from Postgres first
- if the score was already projected, issue a rare ClickHouse `DELETE` mutation by `id`
- if the deleted score had contributed to an issue, run the corresponding centroid/member removal flow and refresh dependent issue state

## Reads And Analytics

Read rules:

- most score reads, listings, details, and draft-aware product surfaces query Postgres
- only aggregates and analytical rollups, such as counts, sums, averages, and time-series, query ClickHouse
- immediate consistency is required for mutable score reads, so those reads stay on Postgres
- eventual consistency in ClickHouse is acceptable for aggregates

## Rollups

Scores and telemetry still depend on a score-aware analytics/query layer, but the exact ClickHouse materialized tables are still pending precise definition until the reporting/query shapes stabilize.

That later materialization work will likely need to support responsibilities such as:

- spans
- traces
- sessions
- daily source buckets
- daily issue trends

These rollups power:

- score-aware filters on telemetry
- evaluation/custom bucket dashboards
- issue counts and trends
- simulation-aware analytics

## Telemetry Filtering

Spans, traces, and sessions should be filterable by score-derived properties such as:

- state
- value thresholds
- failed count
- issue id
- source bucket

Score-aware telemetry filtering should use materializations rather than hot joins against canonical Postgres score rows, but the exact tables are still pending precise definition.

## Simulation Hooks

The score model includes `simulation_id` from the start.

This is required for:

- local simulation execution
- hosted simulation reporting
- separating live traffic from simulation traffic in analytics
