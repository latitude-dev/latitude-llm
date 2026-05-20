# Session-level issue deduplication

Issues today are emitted per **score**, and almost every score is bound to a single trace. When a session contains multiple turns that hit the same flagger / evaluator / annotation queue, the resulting issue surfaces N times across the session's traces — once per turn that triggered it. The issues view and the future session-detail panel both want **one row per `(session, issue)`** with the underlying matching traces still discoverable from that row.

This is the same conceptual fix as session-level search (item #3 in `./0-problems.md`), applied to the issues stream. The goal is to consolidate "I have an issue X that fired five times in this conversation" into a single, navigable record, without losing the per-trace granularity that backs investigation, annotations, datasets, and lifecycle.

## Scope

- **In scope.** Issue ↔ trace ↔ session attribution. Display model for the issues page and the session-detail panel. Read-path dedup keys and aggregations. Backfill of existing per-trace stream.
- **Out of scope.** Issue *discovery* itself (the clustering pipeline in `@domain/issues/use-cases/discover-issue.ts` is unchanged — it still works at score granularity). Postgres `issues` row shape (`packages/platform/db-postgres/src/schema/issues.ts:10`). Issue lifecycle state (`new`/`escalating`/`ongoing`/`resolved`/`regressed`/`ignored`) — those remain per-issue and are orthogonal to session aggregation.

## Current state

### Where issues live

There are **two surfaces** for "an issue":

1. **The `issues` row** in Postgres (`packages/platform/db-postgres/src/schema/issues.ts:10`). One row per `(organization_id, project_id, slug)`. Carries the clustered identity: `name`, `description`, `centroid`, `centroidEmbedding`, `searchDocument`. No `traceId`, no `sessionId`. This is the conceptual issue.
2. **The `scores` table** in ClickHouse (`packages/platform/db-clickhouse/clickhouse/migrations/clustered/00006_create_scores.sql:3`). One row per individual score, carrying `session_id`, `trace_id`, `span_id`, `issue_id`, `source`, `source_id`, `created_at`, `passed`, `errored`. **This is where the per-trace duplication lives** — three score rows on three traces in the same session, all with `issue_id = X`, become three "occurrences" of the same issue.

The bridge between the two surfaces is `scores.issue_id`. Every analytic — `occurrences`, `firstSeenAt`, `lastSeenAt`, `affectedTracesPercent`, the trend chart, the trace list — is a `GROUP BY issue_id` over `scores` filtered by `issue_id != ''`.

### How an issue is detected and attached to a score

The detection pipeline is event-driven and operates **at score granularity** end to end:

1. A score is published (`@domain/scores` — evaluation result, published annotation, custom score with `feedback`).
2. The `discoverIssueUseCase` (`packages/domain/issues/src/use-cases/discover-issue.ts:129`) checks eligibility (`checkEligibilityUseCase`, `check-eligibility.ts:23`): published-only, has feedback, not passed, not errored, not already owned.
3. If eligible, it starts either `issueDiscoveryWorkflow` (no candidate found yet — go embed + hybrid-search + rerank against existing issues, otherwise create) or `assignScoreToKnownIssueWorkflow` (linked evaluation or explicit `issueId` already known).
4. The terminal step is **always**: `scoreRepository.assignIssueIfUnowned({ scoreId, issueId })` (see `create-issue-from-score.ts:173` and `assign-score-to-issue.ts:167`). This writes `scores.issue_id` for exactly one score row.
5. An `OutboxEvent` `ScoreAssignedToIssue` is emitted (`assign-score-to-issue.ts:188`); downstream consumers (centroid refresh, escalation recheck) operate at issue granularity but they read scores back out by `issue_id`.

**There is no entity at any layer that says "issue X seen on session S".** Session-level appears only in the score row itself (`scores.session_id`).

### View layer — how the issues page surfaces a row

`listIssuesUseCase` (`packages/domain/issues/src/use-cases/list-issues.ts:422`):

- Page candidates come from `scoreAnalyticsRepository.listIssueWindowMetrics` (`list-issues.ts:486`) — `count() / min(created_at) / max(created_at) FROM scores GROUP BY issue_id` (impl `score-analytics-repository.ts:1060`).
- Full-history occurrence aggregates from `aggregateByIssues` (`score-analytics-repository.ts:807`).
- The `IssueListItem.affectedTracesPercent` (`list-issues.ts:732`) is `windowMetric.occurrences / totalTraces`. The **numerator** is `count(scores)` — i.e. it counts score rows, not distinct traces, and so a session with five matching traces contributes five.
- `IssueListItem.occurrences` (`list-issues.ts:730`) is identically `count(scores)`.

`listIssueTracesUseCase` (`packages/domain/issues/src/use-cases/list-issue-traces.ts:33`) and its CH backing `listTracesByIssue` (`score-analytics-repository.ts:1291`) is the only piece that already does any dedup — but it dedupes at **trace** granularity (`GROUP BY trace_id`), not session. The issue-detail drawer (`apps/web/src/routes/_authenticated/projects/$projectSlug/issues/-components/issue-detail-drawer.tsx:170-188`) renders the result as a flat traces table — one row per trace, no session grouping at all.

### Where the duplication shows up

Three observable places:

| Surface | Symptom |
|---|---|
| Issues page row | `occurrences` and `affectedTracesPercent` count every trace separately. A session that triggered "refusal" on five of its turns inflates this issue's `occurrences` by 5. Across the project, a chatty user can dominate an issue's metrics. |
| Issue-detail drawer's traces table | Five rows of the same conversation, often near-identical except for `traceId`. The user navigating with N/P clicks through what feels like one problem repeated. |
| Future session-detail panel (`./6-session-panel.md`) | Per 0-problems.md item #4, when the panel renders "issues for this session" it must render each issue once, not once-per-trace. With today's data it cannot. |

The Postgres issue row itself does not duplicate. Lifecycle states do not duplicate. Centroid math does not duplicate (each contributing score is added once). The duplication is **purely a display/query rollup** problem rooted in the per-score storage shape.

## The dedup key

Two scores are "the same issue, same session" iff they share `(organization_id, project_id, issue_id, session_id)`. That tuple is the natural dedup key — the issue table already enforces "same issue" via `issue_id`, and the only thing we're folding is the trace dimension within a single session.

**`session_id` on `scores` is always non-empty** under the coalesce convention from `./1-parity-traces-sessions.md`. Scores are written with the canonical session_id derived from the trace they describe:

```sql
coalesce(nullIf(traces.session_id, ''), toString(traces.trace_id))
```

This is the same expression `sessions_mv` uses to assign session_id to its rows, applied at score-write time using the trace's resolved `argMaxIfMerge(session_id)` from the `traces` row. The effect: for any trace, the score's `session_id` matches the canonical session_id of the session that trace belongs to — real session for tagged traces, synthesized `toString(trace_id)` for orphan traces. There is never an empty bucket to special-case.

There is no second key shape to handle: every detection path ends in the same `scoreRepository.assignIssueIfUnowned` call, so every issue-bearing score row has the same `issue_id` semantics regardless of source. Specifically:

- **Annotation-backed issues** (`source = "annotation"`, including system flaggers — see `./remove-system-annotation-queues.md`) share an `issue_id` whenever the centroid match lands them on the same issue. Each turn that gets a refusal flag in the same conversation will land on the same `issue_id` (centroid is stable across the session's feedback variants); they need to dedup.
- **Evaluation-backed issues** (`source = "evaluation"`) carry the linked `evaluation.issueId` (`packages/domain/evaluations`) and so by construction all evaluation results for a given evaluation in the same session share an `issue_id`. They need to dedup.
- **Custom-source issues** (`source = "custom"`) go through the same discovery pipeline — same `issue_id`, same dedup behavior.
- **Errored scores** (`scores.errored = true`) never get an `issue_id` assigned (filtered out in `check-eligibility.ts:49`). They aren't issues; they don't surface on the issues page. If/when they do (proposed in `./0-problems.md`'s open queue), the dedup key would extend naturally — `(issue_id, session_id)` still works because errored scores would still get an `issue_id` assignment.
- **Outlier / statistical signals.** Per the system-queues design principle (see "Interactions with the system-queues design principle" below), statistical signals (`resource-outliers`) are **not** issues and never become annotation queues. They surface through traces UI filters / `TraceCohort*` infrastructure, not through `scores`. Outlier dedup is out of scope here — there's nothing in `scores` to dedup. If a future "performance regression" failure-mode flagger ships, it would write a normal annotation score and inherit this dedup.

### Edge cases the key handles cleanly

| Case | Behavior under `(issue_id, session_id)` |
|---|---|
| Score with `session_id = toString(trace_id)` (orphan trace, no SDK session_id) | Treated as any other session — `(issue_id, session_id = toString(trace_id))` groups the trace's scores into a single 1-trace "session-issue" row. Same code path as conversational sessions; no fallback branch. Under the coalesce convention, raw empty `session_id` never reaches `scores`. |
| Two issues, one session | Two rows. Same `session_id`, different `issue_id`, no overlap. |
| Same issue, two sessions | Two rows. Correct: different sessions are different problem instances even if they cluster to the same issue. |
| Same issue, same session, two traces with different `created_at` | One row. The row carries `firstSeen = min(created_at)`, `lastSeen = max(created_at)`, `matching_trace_ids = [t1, t2]`, `occurrences = 2`. |
| Score later reassigned to a different issue | `assignIssueIfUnowned` is one-shot (idempotent on first-write). Reassignment is not a current operation — issues are append-only in `scores.issue_id`. If we ever introduce reassignment, the dedup key follows the new `issue_id` because the source of truth is the score row, not a denormalized rollup. |

### Edge cases the key does *not* handle

- **Cross-session merging of "the same conceptual problem".** Two unrelated users hit the same refusal flag in different conversations — that's two session-issue rows. By design. The user wants "one row per session", not "one row per problem class"; the latter is what the issue itself already is.
- **A session that crosses a model/prompt version boundary** mid-stream. Each turn's score still lands on the same `issue_id` (centroid clusters the failure pattern, not the context). One row, with `matching_trace_ids` spanning both versions. The version split is a filter/cohort question, not a dedup question.

## Schema impact — two options

### Option A: keep per-trace storage, dedup at query/view time

`scores.issue_id` is already populated. Every analytic query gains a `GROUP BY session_id, issue_id` instead of `GROUP BY issue_id`.

**Pros:**
- **Zero schema migration.** No new table, no MV, no backfill of historical data — every existing score row already has `(issue_id, session_id)` in the right place.
- **Late-arriving traces are free.** A new score gets inserted into `scores`; the next query against the issues page recomputes the rollup. There is no "session aggregate" to invalidate.
- **No write amplification.** The score-write hot path stays untouched. No additional consistency surface.
- **Self-healing on reassign.** If we ever change `assignIssueIfUnowned` to allow reassignment, the rollup just changes on the next read. There is no derived state to fix up.

**Cons:**
- **Scan cost grows with score volume, not session count.** Every issues-page render groups across the full per-trace scores table. Today the page is already `count() GROUP BY issue_id` over `scores`; widening to `GROUP BY issue_id, session_id` then re-aggregating in TS adds one cardinality level. CH handles this well at small N but is the same cost class as today's existing per-issue scan.
- **The "list of matching trace_ids per (session, issue)" needs to be carried through every read path.** Either via `groupArray(trace_id) GROUP BY issue_id, session_id` (one CH array column per row, fine up to a few hundred traces per group) or via a separate trace-list endpoint keyed by `(issueId, sessionId)`. We'd need both because the issues-page render wants a count + small sample, and the panel drill-in wants the full list.
- **`affectedSessionsPercent` requires a second query.** Today `affectedTracesPercent` reuses `traceRepository.countByProjectId` as the denominator. The session analogue needs a `sessionRepository.countByProjectId` (which the sessions materialized view at `00007_sessions.sql` makes cheap, `uniqExact` over the agg state).

### Option B: add a session-level issue rollup table

Introduce a CH `session_issues` table (or an `AggregatingMergeTree` materialized view off `scores`) keyed by `(organization_id, project_id, session_id, issue_id)`.

```sql
CREATE TABLE session_issues
(
    organization_id LowCardinality(FixedString(24)),
    project_id      LowCardinality(FixedString(24)),
    session_id      String,
    issue_id        FixedString(24),

    occurrences     SimpleAggregateFunction(sum, UInt64),
    trace_ids       AggregateFunction(groupUniqArray, FixedString(32)),
    matching_traces AggregateFunction(uniqExact, FixedString(32)),
    first_seen_at   SimpleAggregateFunction(min, DateTime64(3, 'UTC')),
    last_seen_at    SimpleAggregateFunction(max, DateTime64(3, 'UTC')),

    -- Severity / score rollup across the session for this issue
    avg_value       AggregateFunction(avg, Float32),
    failed_count    SimpleAggregateFunction(sum, UInt64),
    errored_count   SimpleAggregateFunction(sum, UInt64)
)
ENGINE = ReplicatedAggregatingMergeTree
PARTITION BY toYYYYMM(first_seen_at)
PRIMARY KEY (organization_id, project_id)
ORDER BY (organization_id, project_id, issue_id, session_id);

CREATE MATERIALIZED VIEW session_issues_mv TO session_issues AS
SELECT
    organization_id,
    project_id,
    session_id,
    issue_id,
    count()                                AS occurrences,
    groupUniqArrayState(trace_id)          AS trace_ids,
    uniqExactState(trace_id)               AS matching_traces,
    min(created_at)                        AS first_seen_at,
    max(created_at)                        AS last_seen_at,
    avgState(value)                        AS avg_value,
    countIf(passed = false AND errored = false) AS failed_count,
    countIf(errored = true)                AS errored_count
FROM scores
WHERE issue_id != ''
GROUP BY organization_id, project_id, session_id, issue_id;
```

This mirrors the existing `sessions_mv` / `scores_hourly_buckets_mv` patterns (`00007_sessions.sql:45`, `00015_add_scores_hourly_buckets.sql:24`).

**Pros:**
- **Issues page reads become single-table point lookups** keyed on `(org, project, issue_id)` — same shape as `scores_hourly_buckets` for escalation. PRIMARY KEY in primary order on `issue_id` means filtering one issue's session rollups is a granule-scoped read regardless of total score volume.
- **`uniqExact(session_id)` for `affectedSessionsPercent`** comes for free from the MV state without a `GROUP BY session_id` outer query.
- **`trace_ids` array is materialized**, so the drill-in "show me the traces in this session that hit this issue" is one column read, no second query.

**Cons:**
- **MVs in CH are insert-time triggers — they don't replay history.** A backfill `INSERT ... SELECT FROM scores` pass is mandatory at rollout (same pattern as `00015_add_scores_hourly_buckets.sql:36-49`).
- **Schema migration risk.** Adding a new table, an MV, and a backfill is more surface area to validate. The existing rollups have been hardened over time; a new one will surface its own corner cases.
- **Single bucketing path.** Under the coalesce convention, every score row already carries a canonical `session_id` (real or `toString(trace_id)` for orphan traces), so the MV's `GROUP BY session_id, issue_id` covers every score with `issue_id != ''` without a UNION fallback. No second query path for un-sessioned scores.
- **Late-arriving traces.** A trace whose `start_time` lands in an already-merged partition: CH handles this via background re-merge of `AggregatingMergeTree`, but for the duration of the lag the rollup is stale. Issues page values will under-count by one until the merge runs. The same lag exists for `sessions_mv` today — it's tolerable but explicit.
- **Reassignment / deletion drift.** `assignIssueIfUnowned` is one-shot today, but `deleteScore` (`score-analytics-repository.ts:602`) does a `DELETE FROM scores WHERE id = ?` (lightweight mark). The MV does not receive deletions — once a row is in `session_issues`, it stays. We'd need a parallel delete path (rebuild on tombstone) to keep the rollup consistent with raw `scores`. This is the single largest correctness risk.
- **Write amplification.** Score insert rate doubles in terms of CH writes (raw + MV). At Large/XL profiles this is non-trivial (see `trace-search.md` cost section for reference).

### Hybrid: query-time dedup now, MV when the cost shows up

Run the query-time approach for V1. The MV is a future optimization, **not** a correctness fix. The shape of the read API doesn't change between the two — both produce the same `SessionIssueRow` (defined below). If a tenant's issues-page latency starts hurting (proxy: the per-issue scan in `aggregateByIssues` crosses ~150ms at p95 on real workloads), we add the MV as a transparent backing store.

## Display model

A deduplicated session-issue row is the unit the issues page and the session-detail panel both read. Shape:

```ts
// packages/domain/issues/src/entities/session-issue.ts  (new)

export interface SessionIssueRow {
  // -- Identity ------------------------------------------------------------
  readonly sessionId: SessionId
  readonly issueId: IssueId

  // -- Aggregates over the matching scores in this (session, issue) -------
  readonly occurrences: number          // count(scores) in this group — the "5 turns" number
  readonly firstSeenAt: Date            // min(scores.created_at)
  readonly lastSeenAt: Date             // max(scores.created_at)
  readonly avgValue: number             // avg(scores.value) — severity proxy
  readonly failedCount: number          // countIf(passed = false AND errored = false)
  readonly erroredCount: number         // countIf(errored = true)
  readonly sources: readonly ScoreSource[] // groupUniqArray(source) — was this driven by evaluation, annotation, custom, or a mix?

  // -- Drill-in payload ----------------------------------------------------
  /**
   * The set of `traceId`s in this session whose scores carry this `issue_id`.
   * Bounded by per-session trace count (sessions are short; even a chatty
   * conversation rarely exceeds a few hundred turns), so carrying the full
   * list inline is cheaper than a second query. The UI uses `traceIds.length`
   * to render "Issue seen on N turns" and the list itself to render the
   * navigable trace strip inside the session panel.
   */
  readonly matchingTraceIds: readonly TraceId[]

  /**
   * `groupUniqArray(scores.id)` — pointers back to the individual scores so
   * the annotation/score detail surfaces (drawer pop-out, dataset add) can
   * round-trip from "this issue on this session" to the underlying score
   * rows without a third query. Same cardinality bound as `matchingTraceIds`.
   */
  readonly contributingScoreIds: readonly ScoreId[]
}
```

The "annotation provenance" question — which annotations across which traces back this row — is answered by `contributingScoreIds`. Every annotation lives on a score (`Score.metadata.rawFeedback` and `annotationAnchor` on the `AnnotationScore` shape, `packages/domain/scores/src/entities/score.ts:90`), so the score-id list is exactly the set of annotations spread across the matching traces. The panel renders them inline in its conversation tab the same way the trace-detail drawer already does, just unioned across multiple traces.

### What the issues page row needs to change

`IssueListItem` in `list-issues.ts:100-122` carries `occurrences` and `affectedTracesPercent`. We add two parallel session-aware counts and leave the per-trace numbers in place (they're still useful for "how many turn-instances are affected"):

```ts
// addition to IssueListItem (list-issues.ts:100)
readonly distinctSessions: number              // uniqExact(session_id) — session_id is always non-empty under the coalesce convention
readonly distinctTraces: number                // uniqExact(trace_id) — what affectedTracesPercent should have been
readonly affectedSessionsPercent: number       // distinctSessions / totalSessions in the same window
```

The existing `occurrences` field's semantics get clarified in the comment ("count of scores attributed to this issue — counts every turn separately") to make the new fields' role obvious. The web UI table reads `distinctSessions` as the primary "impact" number going forward; `occurrences` is retained for the drill-in and for ordering ties.

### What the session-detail panel renders

Per `./6-session-panel.md` (item #7 in `0-problems.md`), the panel surfaces "issues associated to the session". The query is `listSessionIssues({ sessionId })` → `readonly SessionIssueRow[]`. Each row renders as:

```
[icon · issue.name]                 [severity dot · avgValue]
issue.description — seen on N turns (range firstSeenAt … lastSeenAt)
[avatar list of source kinds: evaluation / annotation / custom]
```

Clicking a row scopes the panel's conversation tab to the matching turns (`matchingTraceIds`) and routes annotation popovers to `contributingScoreIds`. Navigation across same-session issues is N/P over `SessionIssueRow[]`.

## Recommended approach

**Option A (query-time dedup), with a strict contract on the read API so we can swap in Option B's MV later without touching consumers.**

### Why

- **Issues are append-only via `assignIssueIfUnowned`** but **scores are not strictly append-only** (`deleteScore` exists). An MV that doesn't track deletes will drift; Option A is read-from-source-of-truth and self-heals.
- **Late-arriving traces** are the explicit caveat in 0-problems.md item #2 (session end detection): until that lands, sessions can stay "open" for arbitrarily long, and any session-issue rollup must reflect occurrences materializing minutes/hours after the first one. Option A reflects them on the next read; Option B needs the merge to catch up, and we'd be debugging "the row says 4 turns but I see 5 in the panel" race conditions for the duration.
- **Scan cost is already paid.** `listIssueWindowMetrics`, `aggregateByIssues`, and `listTracesByIssue` are already `GROUP BY` over `scores WHERE issue_id != ''`. The widening to `GROUP BY issue_id, session_id` is the same partition scan with one more grouping key — well under the threshold where an MV becomes worth its complexity.
- **One read shape, two future implementations.** The repository port (defined below) gives us `listSessionIssuesByIssueId` / `listSessionIssuesBySessionId` as opaque calls. A later MV-backed implementation is a layer swap — same CH platform, no domain change. No consumers care about the storage shape.

### Concrete changes

**Read path. New repository methods on `ScoreAnalyticsRepository` (`packages/domain/scores/src/ports/score-analytics-repository.ts:191`):**

```ts
// shape returned to consumers
readonly SessionIssueRow  // as defined above

// list session-issue rollups for one issue (drives the drill-down on the
// issues page when the user expands "5 affected sessions")
listSessionIssuesByIssueId(input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly issueId: IssueId
  readonly limit?: number
  readonly offset?: number
  readonly options?: ScoreAnalyticsOptions
}): Effect.Effect<readonly SessionIssueRow[], RepositoryError, ChSqlClient>

// list session-issue rollups for one session (drives the session-detail panel)
listSessionIssuesBySessionId(input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly sessionId: SessionId
  readonly options?: ScoreAnalyticsOptions
}): Effect.Effect<readonly SessionIssueRow[], RepositoryError, ChSqlClient>

// distinct-session counterpart to `listIssueWindowMetrics` (replaces the
// per-trace `occurrences` numerator on the issues page)
listIssueSessionWindowMetrics(input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly issueIds: readonly IssueId[]
  readonly filters?: FilterSet
  readonly timeRange?: ScoreAnalyticsTimeRange
  readonly options?: ScoreAnalyticsOptions
}): Effect.Effect<readonly IssueSessionWindowMetric[], RepositoryError, ChSqlClient>
```

with

```ts
export interface IssueSessionWindowMetric {
  readonly issueId: IssueId
  readonly distinctSessions: number   // uniqExact(session_id) — always non-empty under the coalesce convention
  readonly distinctTraces: number     // uniqExact(trace_id)
  readonly occurrences: number        // count() — preserved for tie-breakers
  readonly firstSeenAt: Date
  readonly lastSeenAt: Date
}
```

**CH implementation** for `listSessionIssuesByIssueId` (`packages/platform/db-clickhouse/src/repositories/score-analytics-repository.ts` — adjacent to `listTracesByIssue` at `:1291`):

```sql
SELECT
  session_id,
  count()                                AS occurrences,
  uniqExact(trace_id)                    AS distinct_traces,
  groupUniqArray(trace_id)               AS trace_ids,
  groupUniqArray(id)                     AS contributing_score_ids,
  min(created_at)                        AS first_seen_at,
  max(created_at)                        AS last_seen_at,
  avg(value)                             AS avg_value,
  countIf(passed = false AND errored = false) AS failed_count,
  countIf(errored = true)                AS errored_count,
  groupUniqArray(source)                 AS sources
FROM scores
WHERE organization_id = {organizationId:String}
  AND project_id = {projectId:String}
  AND issue_id = {issueId:FixedString(24)}
GROUP BY session_id
ORDER BY last_seen_at DESC, session_id DESC
LIMIT {limit:UInt32} OFFSET {offset:UInt32}
```

The `(issue_id, session_id)` predicate hits the `idx_issue_id` and `idx_session_id` bloom filters on `scores` (`00006_create_scores.sql:31,34`), so the read is granule-bounded.

No UNION fallback for un-sessioned scores: under the coalesce convention (`./1-parity-traces-sessions.md`), every score row already carries a canonical `session_id` — real for tagged traces, `toString(trace_id)` for orphan traces. Both group cleanly under `GROUP BY session_id`. The UI distinguishes orphan-trace session rows by the visual signature documented in `0-problems.md` (zero tokens, empty models, `trace_count = 1` on the joined session row), not by a sentinel session_id.

**Issues page integration.** `listIssuesUseCase` (`list-issues.ts:486`) calls `listIssueSessionWindowMetrics` alongside `listIssueWindowMetrics` and exposes both `occurrences` (preserved) and `distinctSessions` (new). `affectedTracesPercent`'s denominator stays `traceRepository.countByProjectId` and gains a sibling `affectedSessionsPercent` whose denominator is `sessionRepository.countByProjectId` (cheap — backed by `sessions_mv` at `00007_sessions.sql:45`). The web view (`apps/web/src/routes/_authenticated/projects/$projectSlug/issues/-components/issues-view.tsx:22`) gains a column toggle `affectedSessions` and surfaces it next to `affectedTraces`.

**Issue-detail drawer integration.** `useIssueTracesInfiniteScroll` (`issue-detail-drawer.tsx:170`) stays, but the **default grouping** in the traces table becomes "by session": rows collapse by `sessionId`, expand-on-click to reveal `matchingTraceIds`. The flat list remains accessible behind a toggle for power users who want the per-turn view. Wire-up:

- New endpoint `listIssueSessions` (server fn at `apps/web/src/domains/issues/issues.functions.ts`, sibling of `listIssueTraces` at `:504`) calling `listSessionIssuesByIssueId`. Returns paginated `SessionIssueRow[]`.
- `issue-detail-drawer.tsx` swaps the inner table to a sectioned list: outer level is sessions, inner level (lazy-loaded on expand from `matchingTraceIds`) is the existing `ProjectTracesTable`. The trace overlay (`:637-676`) is unchanged.

**Session-detail panel integration** (`./6-session-panel.md`). The panel's "issues" tab calls `listSessionIssuesBySessionId`. Each row renders as described in **Display model** above.

### Why not a derived "session-issue" entity in Postgres

We considered a new Postgres `session_issues` table joining `sessions ↔ issues`. Rejected because:

- It would need to be kept in sync with CH-side score writes. Every issue assignment crosses the PG↔CH boundary (issue identity in PG, score row in CH); adding a PG row that mirrors a CH state guarantees drift.
- The lifecycle of a session-issue is the lifecycle of its underlying scores — there is no PG-side state to persist that isn't already in scores or issues.
- The MV path (Option B) is the right escape hatch if read cost ever justifies materializing this; layering a PG table on top of an already-rich PG `issues` row + CH `scores` table would be net negative.

## Migration / backfill

**Zero schema changes are required for V1** under the recommended Option A. Existing `scores.session_id` rows already have everything needed:

- **Read path.** Deploy the new repository methods and the `listSessionIssues*` server functions. Update the issues page + issue-detail drawer in the same release to consume `distinctSessions` and the session-grouped trace list.
- **Backfill data.** Not needed. The `scores` table holds historical `(session_id, issue_id)` pairs going back to issue-discovery rollout. The first read of `listSessionIssuesByIssueId` for any historical issue produces correct numbers from raw history.
- **Backfill UI state.** Saved sorts, saved filters, and any persisted column visibility may still reference `occurrences` / `affectedTraces`. Leave both fields in place; do not rename. The new `distinctSessions` / `affectedSessions` are additive. Web column registry update in `issues-view.tsx:22` adds the new column with default visibility `false` for existing tenants and `true` for new ones (introduced as a feature-flag-gated default; flips on for everyone after a week of bake time).
- **CH-side state.** Bloom filters on `session_id` and `issue_id` (`00006_create_scores.sql:31-34`) are already in place — no index changes.

**If we later adopt Option B (MV-backed):**

1. Goose migration: create `session_issues` table + `session_issues_mv` (insert-time trigger).
2. Goose migration body, in a single transaction: `INSERT INTO session_issues SELECT ... FROM scores WHERE issue_id != '' GROUP BY (org, project, session_id, issue_id)`. Same shape as the `scores_hourly_buckets` backfill at `00015_add_scores_hourly_buckets.sql:36-49`. No `session_id != ''` clause needed — every score row carries a canonical session_id under the coalesce convention.
3. Switch `ScoreAnalyticsRepositoryLive` for `listSessionIssues*` to read from `session_issues`. Domain/UI unaffected because the repository contract is unchanged.
4. Wire a tombstone path for `deleteScore` so the MV stays consistent: emit a delete event, and on consumption issue `ALTER TABLE session_issues DELETE WHERE ...`. Or accept that `deleteScore` is rare (admin tool only — confirmed by its absence from the public API) and tolerate eventual recompute via a daily rebuild job. The latter is simpler and matches how `sessions_mv` handles late corrections.

## Interactions with the system-queues design principle

Latitude's broader design principle for system-emitted annotation queues
draws a sharp line between two kinds of signals:

- **Discrete failure modes** that cluster meaningfully in issue discovery
  (embeddings + BM25 over LLM-drafted feedback text). These belong in
  `scores` and surface as issues.
- **Continuous statistical signals** like latency, cost, or token outliers.
  These do NOT belong in `scores` and do NOT get an `issue_id`. They
  surface through `TraceCohort*` infrastructure
  (`@domain/spans/trace-cohorts.ts`) and the traces UI filters instead —
  "the unit should be 'new performance regression detected', not 'this
  individual trace exceeded p99'."

This dedup spec does not change that boundary. Specifically:

- **Everything that ends up in `scores.issue_id`** is, by construction, a discrete failure-mode signal — the eligibility gate (`check-eligibility.ts`) excludes statistical signals from ever being assigned an `issue_id`. So the dedup key `(issue_id, session_id)` operates entirely on the "failure modes" half of the boundary, which is what the principle says belongs there.
- **Outliers and other continuous signals** surface through `TraceCohort*` infrastructure and the traces UI filters. **Those signals are not deduped by this spec**, and they don't need to be — there is no notion of "session-level outlier" in the cohort model; a cohort is "the set of traces matching a predicate", and grouping by `sessionId` inside a cohort is already a filter operation, not a dedup.
- **If we ever revisit "outliers as issues"** (the principle leaves this open: the unit should be "new performance regression detected", not "this individual trace exceeded p99"), the new failure-mode flagger would write a normal annotation score with `source = "annotation"`, `sourceId = "SYSTEM"`. That score gets an `issue_id` via discovery and inherits the `(issue_id, session_id)` dedup for free. No additional design surface needed.

The dedup design therefore **reinforces** the system-queues design principle: it makes the per-session-row UI consequence of the "failure modes only" rule concrete (one row per session per failure-mode kind), and it explicitly does not extend rollup machinery to the cohort/outliers side where the rule says rollup is the wrong shape.

## Files this will touch

### Domain layer
- `packages/domain/scores/src/ports/score-analytics-repository.ts` — add `listSessionIssuesByIssueId`, `listSessionIssuesBySessionId`, `listIssueSessionWindowMetrics`; add `SessionIssueRow`, `IssueSessionWindowMetric` types.
- `packages/domain/scores/src/testing/fake-score-analytics-repository.ts` — implement new methods over the in-memory score store for unit tests.
- `packages/domain/issues/src/use-cases/list-issues.ts` — fold `listIssueSessionWindowMetrics` into the candidate pipeline (`:486` siblings); extend `IssueListItem` with `distinctSessions`, `distinctTraces`, `affectedSessionsPercent`.
- `packages/domain/issues/src/use-cases/list-issue-traces.ts` — keep as the "flat per-trace" read; add `list-issue-sessions.ts` as the new session-grouped reader.
- `packages/domain/issues/src/use-cases/list-issue-sessions.ts` — new use-case wrapping `listSessionIssuesByIssueId`.
- `packages/domain/issues/src/use-cases/list-session-issues.ts` — new use-case for the session-panel side, wrapping `listSessionIssuesBySessionId`.

### Platform layer
- `packages/platform/db-clickhouse/src/repositories/score-analytics-repository.ts` — implement the three new methods. Adjacent to `listTracesByIssue` at `:1291`. Reuse `scopeClause` / `scopeParams` (`:75`, `:78`) and `buildIssueAnalyticsWhere` (`:571`).
- `packages/platform/db-clickhouse/src/repositories/score-repository.ts` (write path) — at score insertion, populate `session_id` via `coalesce(nullIf(traces.session_id, ''), toString(traces.trace_id))` rather than reading the per-span value. The score's session attribution becomes the canonical session_id of the trace it scores, matching `sessions_mv`'s grouping expression. This is what guarantees the dedup `GROUP BY session_id` never sees empty buckets. Open question: do we resolve this at score-write time (read `traces` for each score insert) or backfill the canonical session_id at the next aggregation? Current recommendation: resolve at write time after `trace-end:run` fires, when the trace's `argMaxIfMerge(session_id)` is stable.
- No schema migration. No `clickhouse/migrations/...` files change.

### Web layer
- `apps/web/src/domains/issues/issues.functions.ts` — add `listIssueSessions` and `countIssueSessions` server fns (siblings of `listIssueTraces` at `:504`); plumb `distinctSessions` / `affectedSessionsPercent` into `IssueRecord` (`:72-93`).
- `apps/web/src/routes/_authenticated/projects/$projectSlug/issues/-components/issues-view.tsx` — add `affectedSessions` column option (`:22`).
- `apps/web/src/routes/_authenticated/projects/$projectSlug/issues/-components/issue-detail-drawer.tsx` — section the inner traces table by session (`:540`), add expand/collapse, lazy-load matching traces per row.
- `apps/web/src/domains/issues/issues.collection.ts` — `useIssueSessionsInfiniteScroll` and `useIssueSessionsCount` hooks (mirrors `useIssueTracesInfiniteScroll` / `useIssueTracesCount` used at `issue-detail-drawer.tsx:170,187`).

### Session panel (cross-references `./6-session-panel.md`)
- `packages/domain/sessions/src/use-cases/list-session-issues.ts` (or wherever the session-panel use-cases land) — wrapper around `listSessionIssuesBySessionId`.
- `apps/web/src/routes/_authenticated/projects/$projectSlug/sessions/-components/session-detail-drawer.tsx` — render `SessionIssueRow[]` as the panel's issues tab.

## Open questions

- **Tie-breaking when `lastSeenAt` is equal across multiple sessions for the same issue.** Order by `(lastSeenAt DESC, session_id DESC)` falls out of the query naturally and is stable, but the UI may want richer ordering (severity? source mix?). Punt to v2; if a user reports the order feels arbitrary, revisit.
- **What's the right denominator for `affectedSessionsPercent` when the user has a time range applied?** Today `traceRepository.countByProjectId({ filters: { startTime: [...] } })` is the denominator for `affectedTracesPercent` (`list-issues.ts:519-524`). The session analogue needs `sessionRepository.countByProjectId({ filters: { minStartTime: [...] } })`. The sessions MV (`00007_sessions.sql:38`) has the `idx_start_time` minmax index, so it's cheap. Confirm the filter shape matches the time-range semantics already in use elsewhere.
- **`matchingTraceIds` cardinality cap.** A session with thousands of turns (long-running agent) hitting the same issue would balloon `matchingTraceIds`. Cap at e.g. 200 with `arraySlice(groupUniqArray(trace_id), 1, 200)` and expose a separate paginated `listMatchingTraces({ sessionId, issueId, limit, offset })` reader for the rare overflow. Implementer decision; no consumer cares about the full list when N > 50.
- **Where does session-level lifecycle live?** A user might want to "ignore this issue, but only for this session" — analogous to suppressing a Datadog monitor for a single host. Not addressed here. If we add this, the natural shape is a Postgres `session_issue_overrides` table keyed on `(sessionId, issueId)`, joined in by `listSessionIssues*`. Today the issue-level `ignoredAt` / `resolvedAt` apply globally and that's the only granularity.
- **Reassignment / merge.** Issue merge (combining two clustering misses) is a future feature. When it lands, the dedup key `(issue_id, session_id)` follows the canonical issue id post-merge — but the historical session-issue rows under the deprecated id need to redirect. Easiest: rewrite `scores.issue_id` during merge (a `UPDATE` via `ALTER TABLE scores UPDATE issue_id = ...` — heavy but rare) and let the next read recompute. Note this is out of scope; flag it now so the dedup-key choice doesn't paint us into a corner later. It doesn't — Option A re-reads from raw scores; Option B's MV needs a rebuild path for merges, which is the same correctness surface as the delete-tombstone path above.
- **Should `errored` scores ever surface as session-issues?** Today they're filtered out of issue assignment entirely (`check-eligibility.ts:49`). If the "runtime errors" stream (raised in 0-problems.md item #4's "evaluator failures" mention) ever becomes a first-class issue source, its dedup shape is identical to this spec — same key, same shape. No spec-level change needed; just unblock the eligibility gate when the upstream feature lands.
