# Scores

Scores are the canonical operational facts of the reliability system.

> **Renamed from "Issues" (Signals spec, Phase 1).** The product and domain model are signal-first. Some queue topic names remain under the legacy `issues:` prefix, but the canonical Postgres/ClickHouse column is `signal_id` (`signalId` in domain code).

Everything else is built on top of them:

- signals
- evaluation dashboards
- annotations
- simulations
- long-term analytics

## Storage Split

Scores use an intentional Postgres + ClickHouse split:

- Postgres stores the canonical mutable score row
- ClickHouse stores immutable score analytics rows

This split exists because mutable score lifecycle does not fit ClickHouse well:

- score rows can start as drafts
- most failed non-errored scores only become immutable after `signal_id` is assigned
- human annotation edits should update one canonical row instead of creating replacement duplicates
- score-table reads need immediate consistency, while aggregate analytics can tolerate ClickHouse lag

## Canonical Postgres Store

Postgres is the source of truth for:

- the full logical score row
- `feedback`, `metadata`, and `error`
- draft state via `draftedAt`
- signal assignment via `signal_id`
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
- `annotatorId`: nullable user id for human-authored annotation scores; `null` for system-generated scores (evaluations, flaggers, custom uploads)

`feedback` deserves special emphasis.

Its text format is intentionally part of the reliability design:

- it must be readable and useful to both humans and LLMs
- it must be phrased so similar failures can cluster together cleanly
- it is the canonical text used for the primary semantic similarity search over signal centroids and lexical text search against signal names/descriptions
- for annotation scores, `metadata.rawFeedback` preserves the original wording and may be used as a fallback signal-discovery query when the canonical feedback pass finds no match
- it should describe the underlying failure pattern, not just dump incidental raw context

`error` is only for true failures. Draft state must not be encoded through sentinel error strings.

State semantics:

- draft: `draftedAt != null`
- passed published: `draftedAt = null`, `passed = true`, `errored = false`
- failed awaiting signal assignment: `draftedAt = null`, `passed = false`, `errored = false`, `signalId = null`
- failed published: `draftedAt = null`, `passed = false`, `errored = false`, `signalId != null`
- errored published: `draftedAt = null`, `errored = true`

Rules:

- drafts are excluded from default score listings, analytics, signal discovery, and evaluation alignment
- draft-aware surfaces such as queue review and in-progress annotation editing explicitly read drafts from Postgres
- draft annotations may carry a preselected `signal_id`, but that value is editable intent only until publication clears `draftedAt`
- writers must never emit a passed score with a non-empty `error`
- errored scores are observability-relevant, but they should not participate in signal discovery or evaluation alignment
- once a score is no longer a draft, it may later be deleted, but it should not be edited again; failed non-errored scores may still receive later `signal_id` assignment before they become fully immutable

## Source Semantics

```typescript
type ScoreSource = "evaluation" | "annotation" | "custom";
```

- `source = "evaluation"` and `source_id = <evaluation-id>`
- `source = "annotation"` and `source_id = "UI" | "API" | <annotation-queue-cuid>`
- `source = "custom"` and `source_id = <user-defined-source-id>`

Enum-like score contracts should use literal-string unions like `ScoreSource`, not TypeScript enums.

Relationship fields:

- `session_id`
- `trace_id`
- `span_id`
- `simulation_id`
- `signal_id`

`simulation_id` and `signal_id` are nullable in Postgres.

`signal_id` remains part of the canonical logical model:

- public `/scores` ingestion does not accept caller-supplied `signalId`; canonical ownership comes from internal evaluation lookup, annotation publication, or discovery
- internal live signal-linked monitor failures may write `signalId` immediately at canonical score creation so the failed score is immutable as soon as it is persisted
- draft annotations may carry it as editable signal intent while `draftedAt != null`
- discovered failed scores can fill it later once they match or create a signal
- helper materializations are allowed for performance, but the logical `score.signal_id` contract must remain

## Write Contracts

All score producers reuse one canonical Postgres-first write path:

- public machine-facing score ingestion uses `POST /v1/organizations/:organizationId/projects/:projectId/scores`
- default `/scores` uploads create `source = "custom"` rows and support arbitrary custom metadata
- clients that upload locally executed Latitude evaluation results reuse the same `/scores` route with `_evaluation: true`, evaluation-score metadata, and the evaluation CUID as `source_id`
- custom scores written through `/scores` always stay unowned at write time and use signal discovery when they are eligible
- evaluation scores written through `/scores` always stay unowned at write time; later centralized signal handling may resolve an already linked evaluation signal before similarity search starts
- internal live evaluation execution writes passed monitor results unowned, writes failed non-errored signal-linked monitor results with `signalId = evaluation.signalId` immediately, and writes errored monitor results as unowned immutable evaluation scores with `error != null`
- non-draft evaluation scores with a `trace_id` are unique per `(organization_id, project_id, source_id, trace_id)` in Postgres, so canonical evaluation persistence stays idempotent even when concurrent workers race past an earlier duplicate precheck
- annotation ingestion stays on `POST /v1/organizations/:organizationId/projects/:projectId/annotations` even though annotations still persist canonical score rows
- internal evaluation and simulation writers reuse the same score-validation and persistence path rather than maintaining a second storage model
- source-specific metadata is validated exactly before persistence, so evaluation, annotation, and custom writers cannot drift into incompatible payload shapes
- instrumented and uninstrumented writes both use the same canonical row shape, with `session_id`, `trace_id`, and `span_id` remaining optional
- draft updates rewrite the same canonical Postgres row in place while `draftedAt` is still set; once a score is published, later writes must fail instead of mutating the immutable row

## Metadata

Source-specific metadata stays intentionally lightweight:

- evaluation scores store `evaluationHash`
- annotation scores store raw or drafted feedback plus the minimal GenAI anchor fields needed to reopen either the whole-conversation annotation or the exact selected message/text range
- flagger-authored annotation rows (`sourceId: "SYSTEM"`) add `flaggerSlug`, the content anchor `contentHash`, and `flaggerTraceId` — the Latitude trace of the generation that made the call, so a detection can be traced back to the decision behind it and graded (see [`./flaggers.md`](./flaggers.md#grading-a-flaggers-own-decisions)). `flaggerTraceId` is absent on deterministic detections, cached generations, and rows predating it.
- custom scores store arbitrary user-defined metadata

### Shareable conversation anchors

Anchored annotation scores (message-level or part-level) can deep-link into the Conversation tab. Clicking an anchored score in the score list writes a `scoreId` search param on the trace or session URL; the param survives reloads and can be copied for sharing. On load, `useConversationAnnotationFocus` waits until the conversation tab is active and messages are rendered, then scrolls to the anchored message, flashes it, and opens the annotation popover.

Opening a session from a signal occurrence uses the same mechanism: the session route carries `scoreId` for the score that recorded the occurrence there, so the first view lands on the evidence message rather than the session header. See [`./annotations.md`](./annotations.md) and [`./conversation-timeline.md`](./conversation-timeline.md).

The metadata field is not intended for heavy analytical querying.

## Postgres Indexing

Because most operational score reads now live in Postgres, score indexing is part of the core model:

- partial btree on `(organization_id, project_id, created_at, id)` where `drafted_at IS NULL` for default non-draft project score reads
- partial btree on `(organization_id, project_id, source, source_id, created_at, id)` where `drafted_at IS NULL` for evaluation/custom source reads
- partial btree on `(organization_id, project_id, signal_id, created_at, id)` where `signal_id IS NOT NULL AND drafted_at IS NULL` for signal drilldowns and signal-backed reads
- partial btree on `(organization_id, project_id, trace_id, created_at, id)` where `trace_id IS NOT NULL` for trace-scoped score hydration, including draft-aware annotation review/edit reads
- partial btree on `(organization_id, project_id, session_id, created_at, id)` where `session_id IS NOT NULL` for session drilldowns
- partial btree on `(organization_id, project_id, span_id, created_at, id)` where `span_id IS NOT NULL` for span-scoped score hydration
- partial btree on `(organization_id, project_id, created_at, id)` where `drafted_at IS NULL AND errored = false AND passed = false AND signal_id IS NULL` for signal-discovery work selection
- partial btree on `(updated_at, id)` where `drafted_at IS NOT NULL` for draft-publication scans and other draft-aware annotation maintenance
- do not add GIN/JSONB indexes on `metadata`, and do not add text-search indexes on `feedback` or `error` in the scores foundation phase

These draft-aware indexes are the minimal annotation foundations:

- trace-scoped annotation reads keep reusing canonical `scores` rows from Postgres rather than introducing a standalone annotation table
- queue review, in-product annotation editing, and draft publication continue to read/write the same canonical score row

## ClickHouse Analytics

ClickHouse is no longer the canonical score store. It keeps only immutable score analytics rows.

The ClickHouse row intentionally contains just aggregation-relevant fields:

- identifiers and telemetry links
- `source` and `source_id`
- `simulation_id` and `signal_id`
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
- use non-null `FixedString(24)` plus the empty-string sentinel for optional CUID links such as `signal_id` and `simulation_id`
- use `FixedString(128)` for bounded non-CUID identifiers such as `session_id` and `source_id`
- use `FixedString(32)` for trace ids and `FixedString(16)` for span ids

Deployment-specific migration note:

- `unclustered/` migrations should use standard merge-tree engines
- `clustered/` migrations should use `ON CLUSTER default` plus the matching `ReplicatedMergeTree` variant
- the logical score analytics schema, partitioning, sort key, and skip indexes should stay identical between both variants

Rules:

- do not update or replace score rows in ClickHouse after insertion
- do not allow duplicate analytics rows for the same score id
- analytics must remain correct without `FINAL` or app-level deduplication
- failed non-errored scores are not inserted into ClickHouse until `signal_id` is assigned and the score becomes immutable

## Drafts And Publication

All score writes happen in Postgres first.

Publication rules:

- drafts are never saved to ClickHouse
- non-draft passed or errored scores are saved to ClickHouse analytics immediately because they are already immutable
- most non-draft failed non-errored scores stay only in Postgres until `signal_id` is assigned
- failed non-errored signal-linked live monitor scores may already carry `signal_id` at the initial canonical write and then sync ClickHouse analytics immediately
- errored live monitor scores stay unowned but still sync ClickHouse analytics immediately because `error != null` makes them immutable
- other unowned non-draft failed non-errored scores request centralized signal handling through the transactional `ScoreCreated` outbox event, optionally carrying a selected `signalId` for published annotations
- when an unowned failed non-errored score finally receives `signal_id`, it becomes immutable and is then written to ClickHouse analytics
- ClickHouse analytics save must be retry-safe and preserve at-most-one row per score id
- the canonical Postgres write transaction must never talk to ClickHouse directly; after commit, the caller runs `syncScoreAnalyticsUseCase`, which re-fetches the canonical score row and inserts into ClickHouse analytics only if the row is still immutable and not already present in analytics
- for failed non-errored scores that were not already immutable at initial write, the centralized `signals:discovery` task runs `syncScoreAnalyticsUseCase` after direct known-signal assignment, and the Temporal `signal-discovery` workflow runs the same sync after create-or-match assignment when similarity search was needed
- when an immutable score lands on an existing signal, the same Postgres transaction writes `ScoreAssignedToSignal` to the outbox so debounced signal-details regeneration still remains atomic with the canonical ownership change
- this differs from direct-publication reliability events such as `TracesIngested`: immutable score analytics save stays synchronous-after-commit for freshness, while only the slower debounced signal-details refresh remains event-driven

Draft-specific rules:

- human-created UI annotations are written as drafts in Postgres immediately, so refresh-safe reads do not depend on local memory or Redis
- draft publication uses a debounced timeout after the last edit; the initial default is `5 minutes`
- human-editable draft publication is driven by the debounced `annotation-scores:publish` topic task keyed by the canonical score id rather than browser-local timers or persisted due-work scans
- system-created queue annotations are also drafts, but they use `draftedAt` rather than an error sentinel
- system-created queue drafts do not use the automatic publication path; they stay draft until explicit human review
- once a draft is published, it may be deleted later but should not be edited again

Delete behavior:

- delete from Postgres first
- if the score was already stored in ClickHouse analytics, issue a rare ClickHouse `DELETE` mutation by `id`
- if the deleted score had contributed to a signal, run the corresponding centroid/member removal flow and refresh dependent signal state

## Reads And Analytics

Read rules:

- most score reads, listings, details, and draft-aware product surfaces query Postgres
- only aggregates and analytical rollups, such as counts, sums, averages, and time-series, query ClickHouse
- immediate consistency is required for mutable score reads, so those reads stay on Postgres
- eventual consistency in ClickHouse is acceptable for aggregates
- the base Postgres read contracts are project-scoped score listings plus source-scoped listings for evaluation/custom sources, both using limit/offset pagination and newest-first ordering
- default score listings exclude drafts; draft-aware surfaces must opt in explicitly to `include` or `only` draft reads instead of relying on separate tables or bespoke repositories

## Rollups

Scores and telemetry still depend on a score-aware analytics/query layer, but the exact ClickHouse materialized tables are still pending precise definition until the reporting/query shapes stabilize.

That later materialization work will likely need to support responsibilities such as:

- spans
- traces
- sessions
- daily source rollups
- daily signal trends

These rollups power:

- score-aware filters on telemetry
- evaluation/custom source dashboards
- signal counts and trends
- simulation-aware analytics

## Telemetry Filtering

Spans, traces, and sessions should be filterable by score-derived properties such as:

- state
- value thresholds
- failed count
- signal id (stored as `score.signalId` in filters; column `signal_id` in analytics)
- annotation author (`score.annotatorId`)
- source

Score-scoped filter keys use the `score.*` prefix and route into a ClickHouse subquery over the `scores` analytics table (`SCORE_FIELD_REGISTRY` in `@platform/db-clickhouse`). Supported keys:

| Filter key | Meaning |
| --- | --- |
| `score.passed` | boolean pass/fail |
| `score.errored` | boolean errored state |
| `score.value` | normalized score value |
| `score.source` | `evaluation` / `annotation` / `custom` |
| `score.sourceId` | evaluation id, annotation queue id, or custom source id |
| `score.annotatorId` | human annotator user id; use `neq ''` for "has human annotations" |
| `score.signalId` | linked signal id |
| `score.simulationId` | simulation id |

`score.annotatorId` filters traces and sessions to those with at least one matching published annotation score. The traces/sessions UI exposes this as an "Annotated by" member picker plus a "Has annotations" toggle (`annotator_id != ''`).

Score-aware telemetry filtering should use materializations rather than hot joins against canonical Postgres score rows, but the exact tables are still pending precise definition.

## Simulation Hooks

The score model includes `simulation_id` from the start.

This is required for:

- local simulation execution
- hosted simulation reporting
- separating live traffic from simulation traffic in analytics
