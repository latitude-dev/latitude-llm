# Session-level search

Collapse search results to one row per `session_id`, with the row carrying the
aggregated score across its matching traces and enough metadata to render
"3 matching turns / best score 0.82" and to drill into a specific trace when
the user clicks in.

This is a derivative of `specs/trace-search.md`. Read that first. This spec
only documents the deltas needed to roll trace-level search up to the session
level. It is _not_ a redesign of the search pipeline — the indexing pipeline,
the lexical/semantic split, the phrase parser, the embedding model choice,
and the chunk-level embedding rows are all reused as-is.

## Implementation tasks

Tracking checklist for the work this spec describes. Grouped by PR boundary;
within each group, order is execution order. Boxes use `- [ ]` (unchecked)
and flip to `- [x]` as the work lands.

Sequencing rationale: PR 1 is a mechanical refactor with zero behavior change
— pulling it out keeps PR 2's diff focused on the actual session-rollup logic.
PR 2 lands the SQL + domain port + repo. PR 3 plumbs server functions. PR 4
swaps the UI. Each PR is independently mergeable and reviewable; PRs 2–4 can
ship one after another without a flag (the user-visible swap only happens in
PR 4, so PRs 1–3 are silent on the client).

### PR 1 — Extract shared search-plan module (refactor, LAT-599)

No behavior change. Moves the search-plan builder out of `TraceRepository`'s
closure into a shared module so `SessionRepository` can import the same
functions in PR 2 (see §9 Open questions → "`buildSearchPlan` location").

- [x] New file `packages/platform/db-clickhouse/src/repositories/search-plan.ts`:
  - [x] Move the `SearchPlan` type (`trace-repository.ts:195-199`) —
        exported. (Originally planned as internal, but Copilot's review
        on #3234 flagged that `planSearch`'s exported return type
        references it, producing a `.d.ts` with a private alias on a
        public signature. Made `@public` so knip recognizes the
        export as intentional even without a direct named import yet.)
  - [x] Move `tokenizePhrase` (`trace-repository.ts:72-77`).
  - [x] Move `buildLexicalSearchSubquery` (`trace-repository.ts:103-150`).
  - [x] Move `buildSemanticSearchSubquery` (`trace-repository.ts:162-186`).
  - [x] Move `buildSearchPlan` (`trace-repository.ts:218-277`) — pure
        function, kept internal; consumed by `planSearch`. PR 2 keeps it
        internal too (SessionRepository only needs `planSearch`).
  - [x] Move `isActiveSearch` (`trace-repository.ts:283-285`) — exported.
  - [x] Export `planSearch` as a top-level Effect (no factory needed). The
        `AI` service is accessed via `Effect.serviceOption(AI)` inside
        `generateQueryEmbedding`, which doesn't add `AI` to the requirements
        channel — so the helper module stays dependency-free at the type
        level without a `createSearchPlanner({ ai })` factory. Original
        framing was over-engineered.
- [x] Update `packages/platform/db-clickhouse/src/repositories/trace-repository.ts` to
      import from the new module; delete the now-duplicated code from the
      `TraceRepositoryLive` closure.
- [x] Keep `TRACE_SEARCH_*` constants in `packages/domain/spans/src/constants.ts`
      where they live today (`:114-138`); the helper module reads them via
      import — no change to the constants file.
- [x] Verify `pnpm --filter @platform/db-clickhouse test` passes unchanged
      (this is a refactor; trace-search behavior is identical). 146/146
      green.
- [x] Verify `pnpm typecheck` is clean. 68/68 workspace tasks green.

### PR 2 — Domain port & types

- [x] `packages/domain/spans/src/constants.ts`: add
      `SESSION_SEARCH_SCORE_AGGREGATION = "max"` next to the trace-search
      constants. Documents the §4.2 decision; switching it later is a
      one-constant change. Also added
      `SESSION_SEARCH_MAX_MATCHING_TRACES_PER_ROW = 50` (H3 fix from
      adversarial review — caps `matching_trace_ids`/`matching_trace_scores`
      arrays at SQL level so pathological single-session-covers-everything
      cases stay bounded).
- [x] New file
      `packages/domain/spans/src/entities/session-search-match.ts`:
      define `SessionSearchMatch` (`bestScore`, `bestTraceId`,
      `matchingTraceCount`, `matchingTraceIds`, `matchingTraceScores`)
      per spec §5.1. Kept out of `session.ts` because the match is
      *per result*, not a property of the session. Re-exported from
      both `index.ts` and `browser.ts` so PR 4 can import client-side.
- [x] Widen `SessionListPage` (`packages/domain/spans/src/ports/session-repository.ts`)
      with optional `searchMatches?: Readonly<Record<string, SessionSearchMatch>>`
      keyed by `sessionId`. **Parallel field**, not a property of
      `SessionRecord` itself — the match is per result, not per session
      (spec §5.1).
- [x] Widen `SessionRepositoryShape.listByProjectId` options with optional
      `searchQuery: string`.
- [x] Widen `countByProjectId` options with optional `searchQuery: string`.
      Return type widened from `number` to
      `SessionCountResult { totalCount; matchingTraceCount? }` so the UI
      can render "N sessions · M matching turns". Updated the one
      internal caller (`createFakeSessionRepository`).

> **Scope trim (vs. spec §4.6 / §5.1):** the search page consumes only the
> list and the count today — `useTraceMetrics` and `useTraceTimeHistogram`
> are exclusive to the `TraceAggregationsPanel` on the non-search project
> route and don't take a `searchQuery`. Plumbing search through metrics
> and histogram is dead weight for V1. The spec body still documents the
> shapes in case product asks for them later; the checklist intentionally
> skips them.

### PR 2 — Repository implementation (ClickHouse)

The search SQL was extracted into a new file
`packages/platform/db-clickhouse/src/repositories/search-by-project.ts`
so `session-repository.ts`'s `listByProjectId` / `countByProjectId`
stay readable. The new module exports `listSessionsBySearchQuery` /
`countSessionsBySearchQuery`; the calling repo passes a
`FetchFullSessions` callback (closes over `LIST_SELECT` +
`toDomainSession`) to avoid a circular import.

- [x] `packages/platform/db-clickhouse/src/repositories/session-repository.ts`:
      import `planSearch` / `isActiveSearch` from the PR 1 module.
- [x] `listByProjectId`: when `parsed = parseSearchQuery(searchQuery)` is
      active, delegate to `listSessionsBySearchQuery` (which owns the
      CTE); otherwise keep the existing `FROM sessions` query unchanged.
- [x] Implement the search path with the CTE structure from §4.3
      (in `search-by-project.ts`):
  - [x] `search_results` CTE wrapping `plan.subquery`.
  - [x] `trace_rollup` CTE joining `traces` ⨝ `search_results`. Per the
        adversarial review (B1 fix), the projection finalizes **all**
        aggregate columns `SESSION_FIELD_REGISTRY` references
        (`argMaxIfMerge(user_id)`, `groupUniqArrayIfMerge(models)`,
        `groupUniqArrayArray(tags)`, etc. — mirrors
        `trace-repository.ts:LIST_SELECT`) so per-trace HAVING resolves
        correctly. `start_time` / `end_time` aliases match the registry
        column names instead of the spec's `trace_start_time` /
        `trace_end_time`. Canonical
        `coalesce(nullIf(argMaxIfMerge(t.session_id), ''),
        toString(t.trace_id))` session_id expression projected per
        spec §6.7.
  - [x] Outer `SELECT … GROUP BY session_id` with:
        `max(relevance_score) AS best_score`,
        `argMax(trace_id, relevance_score) AS best_trace_id`,
        `count() AS matching_trace_count`,
        `matching_trace_ids` / `matching_trace_scores` via
        `arrayMap` + `arrayReverseSort` + `groupArray((trace_id, relevance_score))`
        **capped at 50** via `arraySlice` (H3 fix — bounds per-row
        memory in pathological single-session cases;
        `matching_trace_count` still reflects the true total). Plus
        rolled-up session numerics (`sum(cost_total_microcents)`,
        `sum(span_count)`, etc.).
  - [x] Apply `extraWhere` (score-filter subquery, with
        `buildScoreRollupSubquery("trace_id", ...)` since we're
        filtering trace rows) and `finalHaving` (FilterSet HAVING)
        **inside `trace_rollup`** — per-trace, not post-rollup
        (spec §4.5).
  - [x] Apply the cursor predicate as a session-level HAVING:
        `HAVING (max(relevance_score), session_id) <
        ({cursorSortValue:Float64}, {cursorSessionId:String})`
        (spec §4.4); cursor shape `{ sortValue: string; sessionId: string }`.
  - [x] `ORDER BY best_score DESC, session_id DESC LIMIT :limit`.
  - [x] Return `SessionListPage` with the existing session items plus
        `searchMatches` keyed by `sessionId`. Two-query strategy: rollup
        gives candidate `session_id`s, then `fetchFullSessions` resolves
        the full `Session` shape via `SELECT ${LIST_SELECT} FROM
        sessions WHERE session_id IN (...)`. Pre-migration orphans
        (whose `sessions_mv` filtered them out before #3224) fall back
        to `toOrphanSession` synthesized from the rollup data; this
        fallback can be revisited once migration 00016 is +90 days old
        (lexical search TTL) and the case provably empties out.
- [x] `countByProjectId`: when search is active, delegate to
      `countSessionsBySearchQuery`. Returns
      `{ totalCount, matchingTraceCount }` from the same CTE shape so
      the UI can render "N sessions · M matching turns" (spec §4.6).
- [x] When `searchQuery` is present, force the ordering to `best_score
      DESC, session_id DESC` regardless of the client `sortBy`
      (spec §4.7).

### PR 2 — Tests

- [x] New cases in `packages/platform/db-clickhouse/src/repositories/session-repository.test.ts`
      (file added in PR 1 of `./1-parity-traces-sessions.md`):
  - [x] Lexical-only search: a session whose traces all score `0.0` still
        surfaces and counts (spec §6.4).
  - [x] Hybrid (lexical + semantic): `best_score` equals the max of the
        session's per-trace semantic scores; matching traces with no
        embedding contribute `0.0` rows that still count toward
        `matching_trace_count`.
  - [x] Score-filter HAVING applied per-trace, not post-rollup: a session
        with one cost-passing trace and four cost-failing traces surfaces
        with `matching_trace_count = 1` (spec §6.6).
  - [x] Cursor: paginating with `(best_score, session_id)` yields a
        stable monotonic order with no duplicates across pages.
  - [x] Orphan-trace-as-session: a matching trace with no SDK
        `session_id` produces a row keyed on `toString(trace_id)`,
        `matching_trace_ids = [trace_id]`, `best_trace_id = trace_id`
        (spec §6.7).
  - [x] Multi-trace session: `matching_trace_ids` is sorted by score
        descending; `matching_trace_scores` is the parallel-aligned
        score array.
  - [x] List + count: both query paths share the same candidate set (a
        listed session always counts; a counted session is always
        reachable via pagination) — no drift between them.
  - [x] Ordering override: setting `sortBy = "cost"` while `searchQuery`
        is non-empty still orders by `best_score` (spec §4.7).

Final: `pnpm --filter @platform/db-clickhouse test` reports 154/154
(was 146 in PR 1, +8 new search cases). Workspace `pnpm typecheck`
68/68. `pnpm knip` clean. Biome lint on the touched files clean.

**Adversarial review findings filed for follow-up:**

- LAT-611 (Low) — profile `argMaxIfMerge(session_id)` cost in
  `trace_rollup` at XL scale.
- LAT-612 (Medium) — `EXPLAIN` the `traces ⨝ search_results` join
  strategy at XL scale.
- LAT-613 (Medium) — eliminate duplicate full-scan work between the
  list and count search paths.

### PR 3 — Server functions (TanStack Start)

- [ ] `apps/web/src/domains/sessions/sessions.functions.ts`:
      widen `listSessionsByProject` input with
      `searchQuery: z.string().max(500).optional()`; widen
      `SessionListResult` to include
      `searchMatches?: Readonly<Record<string, SessionSearchMatch>>`.
      Serialize `SessionSearchMatch` next to the existing
      `serializeSession` helper.
- [ ] Add `countSessionsByProject` server function with input
      `{ projectId, filters?, searchQuery? }` returning
      `{ totalCount: number; matchingTraceCount?: number }` (the second
      number is only populated under search; the UI uses it for the
      "5 sessions · 12 matching turns" string from spec §4.6).
- [ ] Force ordering to `bestScore DESC` server-side when `searchQuery`
      is non-empty (independent of `sortBy`) — already enforced at the
      repo, but document the contract in the handler comment.

### PR 4 — Frontend (hooks + search page UI)

The search page becomes session-centric **unconditionally** — the same
`SessionsView` already used by the project page's Sessions tab. There's
no `TracesView`/`SessionsView` swap. `searchMatches` is a data-driven
prop: when a query is active it's populated and the matching-turns
pill / best-trace drill-in light up; when it's empty the view degrades
to a plain session listing (filters still work). One code path, one
column-settings store, one set of React Query keys.

- [ ] `apps/web/src/domains/sessions/sessions.collection.ts`:
      widen `useSessionsInfiniteScroll` to accept optional
      `searchQuery`; include it in the query key
      (`["sessionsInfiniteScroll", projectId, sorting, filters,
      searchQuery]`). Page-param shape:
      `{ sortValue: string; sessionId: string }`.
- [ ] Same file: add `useSessionsCount(projectId, filters, searchQuery?)`
      with key `["sessionsCount", projectId, filters, searchQuery]`.
- [ ] `apps/web/src/routes/_authenticated/projects/$projectSlug/search/index.tsx`:
      replace `TracesView` with `SessionsView` permanently. Remove
      `useTracesCount` / `TRACE_COLUMN_OPTIONS` / `traceColumnSettings`
      imports; replace with `useSessionsCount`,
      `SESSION_COLUMN_OPTIONS`, `useTableColumnSettings<SessionColumnId>`
      (storage key bumps to `"projects.search.sessions.columns.v1"`).
- [ ] Same file: pass `searchQuery={q}` to `SessionsView` always (empty
      string when the user hasn't typed yet). Render the count string
      as:
      - no query, no filters → empty
      - filters only → `"N sessions"`
      - query active → `"N sessions · M matching turns"` (both numbers
        come from `useSessionsCount`).
- [ ] Same file: `traceIdsRef` for drawer prev/next stays the same
      shape as today's Sessions tab (`sessions-view.tsx:392`): each
      expanded session contributes its `session.traceIds` in
      ingestion order, concatenated in page order. No search-specific
      branching — matching vs. non-matching is a visual cue in the
      table, not a navigation distinction.
- [ ] `apps/web/src/routes/_authenticated/projects/$projectSlug/-components/sessions-view.tsx`:
      add `searchQuery?: string` and
      `searchMatches?: Readonly<Record<string, SessionSearchMatch>>`
      props. Both optional — the project-page Sessions tab keeps
      calling without them and behaves identically to today.
- [ ] Same file: a `"searchMatches"` column id exists in
      `SESSION_COLUMN_OPTIONS` but renders the "**N** matching turns"
      pill **only when `searchMatches[sessionId]` is present**. No
      append/remove dance in the visible-column-ids logic — the column
      is always declared, the cell is empty when there's no match
      data.
- [ ] Same file: `useExpandedSessionTraces` (line ~54-98) is unchanged —
      keeps its existing `listTracesByProject` call. The expansion
      shows **all** of the session's traces in ingestion order, same
      as the Sessions tab today (spec §5.3). Matching turns are
      flagged, not filtered.
- [ ] Same file: when `searchMatches[sessionId]` is provided, render a
      visual highlight on expanded trace rows whose `traceId` is in
      `matchingTraceIds` — subtle background tint or focus ring, exact
      treatment chosen during PR 4 design. The row stays clickable as
      today; the highlight is a non-modal cue that "this turn
      matched". An optional score pill (per-row, value from the
      parallel `matchingTraceScores` array) can render alongside if
      design wants it.
- [ ] Same file: top-level row click — when `searchMatches[sessionId]`
      exists, open drawer on `bestTraceId`; otherwise behave like
      today (expand only, no drawer). Expanded trace row click always
      opens the drawer on that specific `traceId`.
- [ ] Same file: `useSessionSelectionAdapter` is unchanged. The
      existing `sessionTraceIndex` (`sessionId → session.traceIds`) is
      fed regardless of whether `searchMatches` is present — checking
      a session row selects all of its traces, same as the Sessions
      tab today; `enqueueTracesExport` consumes that selection with
      no transformation.
- [ ] Telemetry (spec §7 step 5): log per-search-query
      `matching_session_count`, `sum(matching_trace_count)`, and
      query latency. Wire into the existing PostHog client.
- [ ] Manual verification:
      - Empty search bar, no filters → empty state, no count.
      - Add a filter, no query → session listing (same as the project
        Sessions tab) with "N sessions" count.
      - Type `payment` → one row per session with the "matching
        turns" pill; expanding a session shows the **full
        conversation** (all turns in ingestion order, same as the
        Sessions tab) with the matching turns visually flagged;
        top-level row click opens the drawer on `bestTraceId`;
        checking a session and exporting produces a CSV of all the
        session's traces (same as the Sessions tab today).

### Follow-ups (out of scope for this spec; tracked here only as breadcrumbs)

- [ ] Highlight metadata pass-through (`best_matched_chunk_index`, etc.)
      — depends on `./5-search-highlights.md` Phase A landing (the
      trace-level subquery doesn't produce those fields yet). When it
      does, add the `argMax(..., relevance_score)` aggregates into
      `trace_rollup` per spec §6.5; no other changes needed.
- [ ] Freshness-weighted ordering — see `./0-problems.md:148-163` and
      spec §8. Inputs are now available (`best_score` + session
      `max(trace_end_time)`); ship after the rollup is in production.

## Scope

- **In:** session-level result collapsing for `listTracesByProject` (the
  search query path), the count / metrics / histogram subqueries that share
  the same search plan, the cursor shape used by infinite scroll, and the
  result-row payload the drawer needs to drill into a matching trace.
- **Out:** session-level _ingestion_ (we do not build a new
  `session_search_documents` table in V1 — see Decisions); changes to how
  `parseSearchQuery` or `buildTraceSearchDocument` work; the trace-detail
  drawer's existing highlight pipeline (the drawer keeps opening on a
  specific `traceId` — see Drill-in).
- **Forward-only:** sessions whose traces were indexed before rollout are
  invisible to search, same as trace search today (`trace-search.md` →
  Constraints & Limitations / Forward-only rollout).

## Why this is needed

Session 3 in the index doc (`specs/session-problems/0-problems.md:55-72`)
describes the symptom: a long conversation that hits a search query
produces 10+ trace rows for the same `session_id`, and other sessions get
buried below the fold. The current pipeline ranks and paginates at the
trace level (`packages/platform/db-clickhouse/src/repositories/trace-repository.ts:982-985`),
so the page-25 limit becomes "top 25 traces" — frequently top 25 turns of
the same conversation — not "top 25 sessions".

## 1. Current trace-level pipeline (recap)

Active search drives a single ClickHouse query whose result set is one row
per `trace_id`. The path is:

1. UI submits a free-text query `q` to `listTracesByProject`
   (`apps/web/src/domains/traces/traces.functions.ts:122-168`) /
   `countTracesByProject`
   (`apps/web/src/domains/traces/traces.functions.ts:170-197`) /
   `getTraceMetricsByProject`
   (`apps/web/src/domains/traces/traces.functions.ts:258-285`) /
   `getTraceTimeHistogramByProject`
   (`apps/web/src/domains/traces/traces.functions.ts:319-349`).
2. Each handler enters `TraceRepository.listByProjectId` etc. in
   `packages/platform/db-clickhouse/src/repositories/trace-repository.ts:948`
   and friends.
3. `parseSearchQuery` splits the raw input into literal phrases / token
   phrases / semantic prompt
   (`packages/domain/spans/src/use-cases/parse-search-query.ts:31-69`).
4. `planSearch` (`trace-repository.ts:786-791`) optionally calls Voyage
   for a query embedding via `generateQueryEmbedding`
   (`trace-repository.ts:759-779`).
5. `buildSearchPlan` (`trace-repository.ts:218-277`) produces one of
   three subquery shapes, each returning `(trace_id, relevance_score)`:
   - **Lexical only** — phrases AND-ed against `trace_search_documents`
     (`buildLexicalSearchSubquery`, `trace-repository.ts:103-150`).
     `relevance_score = 0.0`.
   - **Semantic only** — `cosineDistance` ranking on
     `trace_search_embeddings` rolled up by `max(...) GROUP BY trace_id`
     (`buildSemanticSearchSubquery`, `trace-repository.ts:162-186`),
     gated by `WHERE semantic_score >= 0.30`
     (`TRACE_SEARCH_MIN_RELEVANCE_SCORE`,
     `packages/domain/spans/src/constants.ts:138`).
   - **Hybrid** — lexical filter `LEFT JOIN` semantic rollup, `max()`
     across (`trace-repository.ts:264-276`).
6. The list path
   (`trace-repository.ts:960-1020`) wraps that subquery in:

   ```sql
   WITH search_results AS (
     SELECT trace_id, relevance_score FROM (<plan.subquery>)
   )
   SELECT ${LIST_SELECT}, search_results.relevance_score
   FROM traces t
   INNER JOIN search_results ON t.trace_id = search_results.trace_id
   WHERE t.organization_id = :org AND t.project_id = :proj
     ${extraWhere}        -- score-filter subquery if any
     ${cursorClause}      -- (search_results.relevance_score, t.trace_id) < (:cv, :ct)
   GROUP BY t.organization_id, t.project_id, t.trace_id, search_results.relevance_score
   ${finalHaving}          -- HAVING from the FilterSet
   ORDER BY search_results.relevance_score DESC, t.trace_id DESC
   LIMIT :pageSize
   ```

   `LIST_SELECT` is the materialized-trace projection at
   `trace-repository.ts:287-322`. The cursor is the tuple
   `(sortValue=relevance_score, traceId)`
   (`trace-repository.ts:1011-1017`).
7. `count` / `metrics` / `histogram` paths (`trace-repository.ts:1226-1295`,
   `:1402-1469`, and the histogram counterpart) re-use the same plan as
   a filter: `AND trace_id IN (SELECT trace_id FROM (<plan.subquery>))`.

`session_id` is _not_ a column on `trace_search_documents`
(`packages/platform/db-clickhouse/clickhouse/migrations/unclustered/00009_trace_search_documents.sql:12-44`)
or on `trace_search_embeddings`
(`…/unclustered/00013_trace_search_embeddings_chunked.sql:6-23`). It is
only available on the materialized `traces` table as an `argMaxIfState` over
spans (`…/unclustered/00011_plan_aware_retention.sql:78`). The
`traces`-side projection in `LIST_SELECT` resolves it with
`argMaxIfMerge(session_id)` (`trace-repository.ts:312`). The session
materialization itself (`sessions` AggregatingMergeTree
+ `sessions_mv`) lives in `…/unclustered/00007_sessions.sql:4-79` and is
populated from `spans` — its `session_id` is the same key.

## 2. What's broken

The list path collapses _at the trace level_:

```
GROUP BY t.organization_id, t.project_id, t.trace_id, search_results.relevance_score
ORDER BY search_results.relevance_score DESC, t.trace_id DESC
LIMIT 50
```

(`trace-repository.ts:982-985`)

Concretely:

- A session containing 12 user/assistant turns is materialized as 12 (or
  more) distinct `trace_id` rows in `traces` (one per LLM call / per
  trace boundary the customer instrumented). Each of those traces is
  independently indexed in `trace_search_documents` and
  `trace_search_embeddings`.
- When the query matches the session's topic, every one of those traces
  scores high. The hybrid/semantic subquery returns 12 rows. The list
  query joins them against `traces`, groups by `trace_id`, sorts by
  `relevance_score`, returns the first 25.
- All 25 (or 12, or 8) can be the _same `session_id`_. Other sessions in
  the project that also match drop off the page.

The downstream UI then has no signal that those 12 rows belong together.
`SessionsView` (`apps/web/src/routes/_authenticated/projects/$projectSlug/-components/sessions-view.tsx:194`)
shows trace rows nested under session rows, but the search page uses
`TracesView` (`…/-components/traces-view.tsx`) which renders the flat
trace list. The search-page session pollution is a presentation problem
_and_ a pagination/scoring problem — pagination is what makes the loss
fatal: the 26th-best session is unreachable until the user scrolls past
the duplicate cluster.

`countTracesByProject` is consistent with the duplicate list — it
returns "12 traces matched" — which is technically true and entirely
useless. The user wants "1 session, 12 matching turns".

`getTraceMetricsByProject` (the aggregations strip above the table) is
also computed over the de-duplicated trace set with the search filter
applied. The numbers themselves are arithmetically correct ("avg cost of
matching traces") but conceptually mismatched against a session-level
listing: with the rollup, the aggregation should describe matching
_sessions_, not the underlying matching turns.

## 3. Proposed pipeline — two designs

The choice is whether to push the rollup _into the query_ (the existing
trace-level indexes stay; we add a `GROUP BY session_id`) or to build
new session-level materialized indexes that mirror what already exists
for traces. The two designs are not mutually exclusive — option B is a
performance optimization on top of A — but only one is required to ship
the feature.

### Option A — Query-side rollup over existing indexes

Add `GROUP BY session_id` to the search plan's outer join, replacing the
existing `GROUP BY trace_id`. The trace-level indexes
(`trace_search_documents`, `trace_search_embeddings`) and the
trace-search worker are unchanged.

Aggregations needed on the join row:

- `max(search_results.relevance_score)` → `best_score`
- `groupArray(t.trace_id)` → `matching_trace_ids`
- `groupArray(search_results.relevance_score)` → `matching_trace_scores`
- `count()` → `matching_trace_count`
- Any aggregate of the `LIST_SELECT` numerical fields rolled up across
  the traces of the session (sum of costs, span counts, etc. — same
  shape as the existing `sessions` materialized table at
  `…/00007_sessions.sql:4-79`).

**Pros**

- Zero new tables, zero schema change, zero backfill. Lands in a single
  PR.
- Search corpus stays canonical: one place to reason about lexical
  text and chunk embeddings, one TTL story, one worker. If we ever fix
  a bug in `buildTraceSearchDocument` it instantly improves session
  ranking too.
- Cheap on freshness: an embedding written 200ms ago is in the next
  query result. There's no second-stage materialization to wait for.
- The chunk-level granularity already in `trace_search_embeddings`
  carries naturally — the per-chunk `argMax` in `5-search-highlights.md`
  still works because we drill in from the session to its
  best-scoring trace and route the existing trace-level highlight
  endpoint from there.
- Reversible: we can layer Option B on later as a perf optimization
  without changing the API contract.

**Cons**

- Query cost grows. The plan inner already touches up to 30k chunk rows
  (`SEMANTIC_SCAN_LIMIT` in `trace-repository.ts:65`); the outer join
  now groups by `session_id` instead of `trace_id`. Each result row
  may carry a multi-element `groupArray`. In ClickHouse this is
  bounded by the lexical/semantic candidate set, not by the project's
  total session count — so it's similar to the trace-level cost, not
  worse — but the `groupArray`s allocate memory proportional to the
  matching-trace fan-out.
- Cursor is no longer `(relevance_score, trace_id)`. The natural cursor
  is `(best_score, session_id)`. That's a cursor schema change in the
  TanStack-Start handler / React Query keys.
- The session row still has to read from `traces` (for cost / tokens /
  etc.) _and_ from `sessions` (if we want simulation_id, span counts,
  user_id at session granularity, etc.) — there's a join graph
  decision to make (see §4 SQL).
- No write-time deduplication of the search corpus by session — same
  text indexed once per trace even when the chunks overlap. (This is
  actually fine; the embeddings table already tolerates that via the
  per-chunk `content_hash` dedup at
  `trace-search-repository.ts:61-90`.)

**Write amplification**: zero — we don't add a new write path.

**Freshness**: same as today, ~debounce after `trace-end:run`
(`trace-search.md` → Indexing Pipeline).

**Complexity**: ~one PR. `buildSearchPlan` is unchanged; the calling
list/count/metrics queries swap `GROUP BY trace_id` for `GROUP BY
session_id` and the cursor logic changes shape.

### Option B — Materialized `session_search_documents` / `session_search_embeddings`

Mirror the existing trace-side tables at the session granularity.

```sql
-- Lexical: one row per session, concatenated/normalized text across the
-- session's traces, with the same tokenbf/ngrambf indexes.
CREATE TABLE session_search_documents (
  organization_id    LowCardinality(String),
  project_id         LowCardinality(String),
  session_id         String,
  min_start_time     DateTime64(9, 'UTC'),
  max_end_time       DateTime64(9, 'UTC'),
  search_text        String,
  content_hash       FixedString(64),
  indexed_at         DateTime64(3, 'UTC') DEFAULT now64(3),
  retention_days     UInt16 DEFAULT 90,
  INDEX idx_search_text_tokenbf search_text TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 1,
  INDEX idx_search_text_ngrambf search_text TYPE ngrambf_v1(3, 512, 3, 0) GRANULARITY 1
)
ENGINE = ReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(min_start_time)
ORDER BY (organization_id, project_id, session_id)
TTL toDateTime(min_start_time) + toIntervalDay(retention_days + 30) DELETE;

-- Semantic: one row per (session_id, chunk_index), embeddings computed
-- against the session-level packed conversation.
CREATE TABLE session_search_embeddings (
  organization_id  LowCardinality(String),
  project_id       LowCardinality(String),
  session_id       String,
  chunk_index      UInt16,
  start_time       DateTime64(9, 'UTC'),
  content_hash     FixedString(64),
  embedding_model  LowCardinality(String),
  embedding        Array(Float32),
  retention_days   UInt16 DEFAULT 30,
  indexed_at       DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
ORDER BY (organization_id, project_id, session_id, chunk_index)
TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;
```

A `session-search:refreshSession` worker (analogous to
`apps/workers/src/workers/trace-search.ts`) re-runs
`buildTraceSearchDocument` over `allMessages` concatenated across the
session's traces in chronological order. Re-indexing is triggered on
every `trace-end:run` for any trace belonging to the session — i.e. the
worker keys on `session_id` and re-runs whenever any of its traces
changes.

**Pros**

- One row per session at query time, no `groupArray` fan-out, no
  rollup. Cursor stays the simple `(best_score, session_id)` tuple.
- Lexical index quality on the concatenated text is _better_ than on
  per-trace text for cross-turn queries ("user complained about
  refunds and then asked about cancellation"): the phrase can span
  trace boundaries.
- Semantic-side embeddings cover cross-turn context too — useful for
  multi-turn conversational queries the trace-level chunker can't
  reach.

**Cons**

- **Re-indexing amplification.** Every new trace in a long session
  re-builds the entire session document and re-embeds (some of) its
  chunks. A session with 50 turns triggers ~50 re-indexes; each is
  effectively `O(session_size)`. The trace-level pipeline trades
  monotonically per trace.
- **Freshness lag.** Two-stage materialization — `trace-end:run` →
  trace-search worker → session-search worker. A second debounce
  window before the session becomes searchable on the new turn.
- **Storage.** Adding a second copy of the embedding corpus is the
  main cost. At XL scale (`trace-search.md` → Cost & Performance) the
  trace embedding corpus is ~20 GB; the session corpus would be
  comparable, since session text is the concatenated trace text.
  Voyage cost roughly doubles at billed tiers.
- **Operational surface.** Two workers, two tables, two TTLs, two
  backfill paths, two sets of dashboards. A bug in either one
  produces two divergent search behaviors (the trace-search worker
  drift and the session-search worker drift), each of which is hard
  to debug without observability.
- **`buildTraceSearchDocument` is trace-shaped today.** Its
  head/tail turn selection (`build-trace-search-document.ts`'s
  `selectHeadTailTurns`) and chunking are tuned for a single trace.
  Composing across traces means either calling it _N_ times and
  union-ing, or rewriting it to accept a virtual "session
  conversation". Either is non-trivial and bleeds into the
  `5-search-highlights.md` semantic-region mapping.

**Write amplification**: ~`session_trace_count` extra writes per turn
in steady state (re-index of the whole session). Voyage embed calls
get re-issued for chunks whose content hash changed; turns that didn't
change skip embedding via the existing `hasEmbeddingWithHash`
path (`trace-search-repository.ts:61-90`).

**Query cost**: similar to today's trace-level query, since the
candidate set is one-row-per-session.

**Freshness**: trace-end debounce + session-search debounce.

**Complexity**: ~four PRs minimum (schema, worker, repository, backfill).

## 4. Recommended approach — Option A (query-side rollup)

Ship the query-side rollup first. The "session detail" use case the
search bar serves is already gated by clicking into a session and from
there into a trace — i.e. the user is going to land on a single trace's
drawer anyway. We don't need session-level embedding quality, only
session-level _result deduplication_, which is a SQL operation.

If profiling later surfaces that the `groupArray` fan-out or the
session-level grouping is slow at Large/XL scale, we can layer Option B
without changing the API contract: the read row shape (`session_id` +
`matching_trace_ids` + `best_score` + `matching_trace_scores` +
`best_trace_id`) is the same either way.

### 4.1 Recommended row schema

The search plan still returns
`(trace_id, relevance_score)` from `buildSearchPlan` (no change). The
outer query now collapses to one row per session:

```ts
interface SessionSearchRow {
  readonly session_id: string
  readonly best_score: number                      // max(relevance_score)
  readonly best_trace_id: string                   // argMax(trace_id, relevance_score)
  readonly matching_trace_count: number            // count(distinct trace_id in the search hit set, including lexical-only matches at score = 0)
  readonly matching_trace_ids: readonly string[]   // groupArray(trace_id) sorted by score DESC
  readonly matching_trace_scores: readonly number[]
  // … plus the rolled-up trace-level numerics (cost_total_microcents, span_count, etc.)
  // matching the existing `SessionRecord` shape from sessions.functions.ts:12-39
}
```

Two practical notes on this schema:

- `matching_trace_ids` is capped by the candidate set, not by the
  session size. A pure-semantic query has at most one row per
  `(trace_id, chunk_index)` survivor of the `SEMANTIC_SCAN_LIMIT =
  30_000` cap (`trace-repository.ts:65`). After the per-trace
  `max(...) GROUP BY trace_id` rollup that's at most 30k distinct
  trace candidates project-wide; the per-session fan-out is the
  session's matching-trace count, typically single-digit.
- `matching_trace_scores` is ordered to match `matching_trace_ids`
  (CH's `groupArray` is order-preserving when followed by `arraySort`
  on a parallel array — see SQL below). The drawer route only needs
  `best_trace_id`; the array is for "show 3 matching turns" UI in the
  result card.

### 4.2 Score aggregation policy

**Recommendation: `max(relevance_score)`.**

- It matches the existing per-trace rollup (`max(semantic_score) GROUP BY
  trace_id` at `trace-repository.ts:169-180`) — the trace-level score is
  already a max-over-chunks; the session-level score becomes
  max-over-traces-over-chunks. The semantics compose cleanly: "best
  matching chunk in the best matching trace".
- It preserves single-best-match precision: a session where _one_ turn
  is a perfect match for the query stays at the top, instead of being
  diluted by N other unrelated turns averaged in.
- It's stable under "session keeps getting longer" — a low-relevance
  follow-up turn doesn't push the session down the list. Avg or
  weighted-avg both have that pathology.

Considered and rejected:

- **`avg(score)`** — dilutes single-strong-match sessions; pessimizes
  against long sessions; hard to interpret cross-session because the
  matching-trace _count_ skews it.
- **`max(score) * log(1 + matching_trace_count)`** ("more turns
  matching = stronger evidence") — tempting but premature. We have
  zero data on whether "5 turns about refunds" should rank above "1
  perfectly-matching turn about refunds with score 0.92". Defer until
  we have telemetry. The `matching_trace_count` field is shipped in
  the row so the UI can show it without baking it into the score.
- **`avg(top_k=3 scores)`** — middle ground; defensible but adds a
  parameter we'd have to tune and a code path we'd have to maintain.
  Defer.

Score aggregation lives in a single CH expression; switching it later
is a one-line change behind a `SESSION_SEARCH_SCORE_AGGREGATION`
constant. Document the chosen aggregation in
`packages/domain/spans/src/constants.ts` next to the other trace-search
constants.

### 4.3 Recommended SQL

The outer query becomes (parameter names match the existing
`buildSearchPlan` `params` shape):

```sql
WITH search_results AS (
  SELECT
    trace_id,
    relevance_score
  FROM ( ${plan.subquery} )                  -- unchanged (buildSearchPlan output)
),

trace_rollup AS (
  -- The existing trace-deduped projection over `traces`, with the score joined in.
  -- This is the same shape as the per-trace LIST_SELECT, narrowed to traces that
  -- matched the search.
  --
  -- The `session_id` column applies the canonical coalesce expression from
  -- ./1-parity-traces-sessions.md so the outer GROUP BY collapses correctly for
  -- both real sessions (SDK-supplied id) and orphan traces (synthesized
  -- toString(trace_id)). Reading argMaxIfMerge(t.session_id) directly would
  -- yield '' for orphan traces and collapse them all into one "empty session"
  -- group — which is exactly the misclassification we're avoiding.
  SELECT
    t.organization_id                                AS organization_id,
    t.project_id                                     AS project_id,
    t.trace_id                                       AS trace_id,
    coalesce(
      nullIf(argMaxIfMerge(t.session_id), ''),
      toString(t.trace_id)
    )                                                AS session_id,
    ${LIST_SELECT_NUMERICS}                          -- sums for cost/tokens/span_count/etc.
    min(t.min_start_time)                            AS trace_start_time,
    max(t.max_end_time)                              AS trace_end_time,
    search_results.relevance_score                   AS relevance_score
  FROM traces t
  INNER JOIN search_results ON t.trace_id = search_results.trace_id
  WHERE t.organization_id = {organizationId:String}
    AND t.project_id = {projectId:String}
    ${extraWhere}                                   -- score-filter subquery
  GROUP BY
    t.organization_id, t.project_id, t.trace_id,
    search_results.relevance_score
  ${finalHaving}                                    -- HAVING from FilterSet
)

SELECT
  organization_id,
  project_id,
  session_id,

  -- Score aggregation across the session's matching traces.
  max(relevance_score)                                            AS best_score,
  argMax(trace_id, relevance_score)                               AS best_trace_id,

  -- Per-session count of matching traces. Zero-relevance lexical-only
  -- rows still count (they matched the phrase filter).
  count()                                                         AS matching_trace_count,

  -- Matching traces sorted by their own relevance, descending. The two
  -- arrays stay aligned: zip them on the client to render "Trace X · 0.84".
  arrayMap(
    pair -> pair.1,
    arrayReverseSort(pair -> pair.2, groupArray((trace_id, relevance_score)))
  )                                                               AS matching_trace_ids,
  arrayMap(
    pair -> pair.2,
    arrayReverseSort(pair -> pair.2, groupArray((trace_id, relevance_score)))
  )                                                               AS matching_trace_scores,

  -- Rolled-up session numerics (sum across the session's matching traces).
  -- Mirrors `SessionRecord` shape so the UI can render the same cells the
  -- session listing already supports without a second query.
  min(trace_start_time)                                           AS session_start_time,
  max(trace_end_time)                                             AS session_end_time,
  sum(cost_total_microcents)                                      AS cost_total_microcents,
  sum(span_count)                                                 AS span_count,
  sum(error_count)                                                AS error_count,
  sum(tokens_total)                                               AS tokens_total
  -- … same shape as session-repository LIST_SELECT (session-repository.ts:21-49)

FROM trace_rollup
WHERE 1=1                                           -- session_id is always non-empty under coalesce; no filter needed
  ${sessionCursorClause}                            -- see §4.4
GROUP BY organization_id, project_id, session_id
ORDER BY best_score DESC, session_id DESC
LIMIT {limit:UInt32}
```

Notes:

- The CTE structure (`search_results` → `trace_rollup` →
  session-level `SELECT`) preserves the existing `extraWhere` /
  `finalHaving` semantics from `trace-repository.ts:960-985`: the
  trace-level filter set (incl. score subqueries) is applied
  _before_ the session rollup, so a session is only matched on the
  subset of its traces that pass per-trace filters. This is the
  right behavior for filters like `tags = X` (only sessions whose
  matching traces carry that tag), and unambiguous in the edge
  cases.
- `argMax(trace_id, relevance_score)` ties are broken
  non-deterministically — that's fine; the UI links into one of the
  matching traces and the user can see all of them via
  `matching_trace_ids`.
- The `arrayReverseSort(pair -> pair.2, ...)` pattern is ClickHouse's
  way to keep two arrays aligned: zip via `groupArray((a, b))` then
  sort the tuple by the second element descending, then unzip with
  `arrayMap`. Cheaper than a window function and works inside an
  aggregate clause.
- **No `WHERE session_id != ''` filter.** Under the coalesce
  convention from `./1-parity-traces-sessions.md`, every trace row gets
  a non-empty `session_id` in the rollup CTE (`coalesce(nullIf(...),
  toString(trace_id))`). Orphan traces — those with no SDK-supplied
  `session_id` on any span — surface as 1-trace sessions in the
  search results, identified by their `toString(trace_id)` session_id
  and the standard `tokens_total = 0` / `models = []` visual
  signature.
- `INNER JOIN traces ON t.trace_id = search_results.trace_id` is the
  same join as today. The `trace_search_documents` /
  `trace_search_embeddings` tables don't carry `session_id`, so the
  join through `traces` is how we resolve session membership. This
  is cheap because `(organization_id, project_id, trace_id)` is the
  primary key.

### 4.4 Cursor

The cursor moves from `(relevance_score, trace_id)` to
`(best_score, session_id)`. The `sessionCursorClause` is:

```sql
AND (best_score, session_id) < ({cursorSortValue:Float64}, {cursorSessionId:String})
```

Same lexicographic-tuple comparison as today
(`trace-repository.ts:962-963`), keyed on the session instead of the
trace. `BATCH_SIZE = 50` and the `+1 / hasMore` semantic
(`trace-repository.ts:1004-1019`) carry over unchanged.

Because the cursor predicate is on the _outer_ aggregate, it has to be
applied in a `HAVING` clause (the comparison references `best_score`,
which is an aggregate). The pattern:

```sql
GROUP BY organization_id, project_id, session_id
HAVING (max(relevance_score), session_id) < (
  {cursorSortValue:Float64}, {cursorSessionId:String}
)
ORDER BY best_score DESC, session_id DESC
LIMIT {limit:UInt32}
```

This is identical to how non-search session listing pages today
(`session-repository.ts:216-222`).

### 4.5 Score-filter (`HAVING`) interaction

The existing trace-level path applies `HAVING` _at the trace level_
(`trace-repository.ts:982-983`). With session rollup we have two
defensible choices:

- **Apply per-trace, then roll up.** A session matches if at least
  one of its matching traces passes the HAVING. This is what falls
  out naturally from the CTE structure above (HAVING is applied in
  `trace_rollup`).
- **Apply session-level (post-rollup).** A session matches if the
  rolled-up aggregate passes the HAVING. E.g. `cost > $5` means "sum
  of matching-trace costs > $5".

**Recommendation: per-trace.** It matches how `FilterSet` is described
on the trace list ("traces with cost > X"); a session that contains
even one trace with cost > X is a session worth surfacing under the
matching turns. Documented in the spec; can revisit if user feedback
disagrees.

### 4.6 count / metrics / histogram

These three siblings of the list query (`trace-repository.ts:1226-1295`,
`:1402-1469`, and the histogram path) currently re-use the search plan
via `AND trace_id IN (SELECT trace_id FROM (<plan.subquery>))`.

They must move in lockstep with the list:

- **count** returns `count(DISTINCT session_id)` over the matched set
  (i.e. the same post-rollup row count the user sees in the list).
  The UI string changes from "12 traces" to "5 sessions · 12 matching
  turns" — keep both counts available by adding
  `matching_trace_count_total = sum(matching_trace_count)` to the
  count query result.
- **metrics** are rolled up across _sessions_ now, not traces. Most
  fields are sums of the per-session aggregates that already include
  cross-trace sums — so the aggregate query reads from the same
  CTE structure (`trace_rollup` → group-by-session) and the
  top-level `SELECT` computes `avg(cost_total_microcents)` etc. over
  session rows.
- **histogram** is bucketed by session start time (the earliest
  matching turn). Same CTE shape, with an outer
  `GROUP BY toStartOfInterval(min(trace_start_time), :bucket)`.

### 4.7 Ordering policy

When `searchQuery` is present, the server orders by `best_score DESC,
session_id DESC` regardless of the client `sortBy` — same policy as
trace search today (`trace-search.md` → Ordering policy). The
column-header sort UI keeps its current "we set the URL param but the
server still orders by relevance" behavior.

## 5. API and UI impact

### 5.1 Server functions

The search read path currently lives on `listTracesByProject`,
`countTracesByProject`, `getTraceMetricsByProject`,
`getTraceTimeHistogramByProject`, and exporters. Two options:

- **A. Branch inside `listTracesByProject`.** When `searchQuery` is
  present, the handler returns a different shape (`SessionRecord` +
  matching-trace metadata) instead of `TraceRecord[]`. Client code
  that consumes the search page (`apps/web/src/routes/_authenticated/projects/$projectSlug/search/index.tsx`)
  switches over the response variant.
- **B. Introduce `listSessionsByProject` with a `searchQuery` input.**
  Keep `listTracesByProject` purely trace-level. The search page
  uses `listSessionsByProject` when `q` is non-empty. The
  non-search `/projects/$projectSlug` route, which today calls
  `listTracesByProject` and doesn't have a session-collapsed mode,
  is left alone.

**Recommendation: B.** The trace list and the session list are two
different surfaces (the non-search trace page should keep showing
traces; the search page should always show sessions when there's an
active query). Conflating them through a polymorphic
`listTracesByProject` would force every consumer to handle both
shapes, including dashboards/exports/etc. that have no reason to
care.

`listSessionsByProject` already exists at
`apps/web/src/domains/sessions/sessions.functions.ts:54-94` and the
ClickHouse repository at
`packages/platform/db-clickhouse/src/repositories/session-repository.ts:203-269`.
The new path:

1. Widen the inputValidator on `listSessionsByProject` to accept
   `searchQuery: z.string().max(500).optional()`.
2. Add `SessionRepositoryShape.listByProjectId` to optionally take
   `searchQuery` in its `options` (`session-repository.ts`'s shape
   at `packages/domain/spans/src/ports/session-repository.ts:47-53`).
3. Inside the repo, mirror the planSearch / buildSearchPlan dance
   from `trace-repository.ts:756-791` (extract them into a shared
   module — see §6 Open questions).
4. When `searchQuery` is active, run the CTE from §4.3; otherwise
   keep the existing `FROM sessions` path.
5. Add the matching-trace fields to the returned `SessionRecord`
   variant via a parallel `searchMatch` field (do _not_ pollute
   `SessionRecord` itself; the search match is _per result_, not a
   property of the session):

   ```ts
   interface SessionSearchMatch {
     readonly bestScore: number
     readonly bestTraceId: string
     readonly matchingTraceCount: number
     readonly matchingTraceIds: readonly string[]
     readonly matchingTraceScores: readonly number[]
   }

   interface SessionListResult {
     readonly sessions: readonly SessionRecord[]
     readonly searchMatches?: Readonly<Record<string, SessionSearchMatch>>
     // keyed by sessionId; present only when searchQuery was active
     readonly hasMore: boolean
     readonly nextCursor?: { sortValue: string; sessionId: string }
   }
   ```

   The same parallel-field shape the `5-search-highlights.md` spec
   recommends for trace-level matched-chunk metadata
   (`5-search-highlights.md` → "Phase C — Semantic region highlight").

Parallel new fns:

- `countSessionsByProject` — exists today
  (`sessions.functions.ts:54-94` defines the list and metrics; add
  count if not already present) — extend with `searchQuery`.
- `getSessionMetricsByProject` — extend with `searchQuery`.
- `getSessionTimeHistogramByProject` — add it; sessions don't have a
  histogram fn today.
- `enqueueSessionsExport` — exporter for the session selection.

### 5.2 React Query keys

Today's search page keys are scoped to traces:

```
["tracesInfiniteScroll", projectId, sortBy, sortDirection, filters, q]
["tracesCount",          projectId, filters, q]
```

(`apps/web/src/domains/traces/traces.collection.ts:29-55,83-...`)

When `q` is non-empty on the search route, the page switches to:

```
["sessionsInfiniteScroll", projectId, sortBy, sortDirection, filters, q]
["sessionsCount",          projectId, filters, q]
```

Both keys still flow through the same Voyage cache key
`(text, model, dimensions, "query")` for the embedding call
(`trace-search.md` → Query-time embedding) — the cache lives at the
Voyage call site inside the ClickHouse repository and is invariant to
whether the caller is the trace or session list.

### 5.3 Search page UI

`apps/web/src/routes/_authenticated/projects/$projectSlug/search/index.tsx`
renders `SessionsView` unconditionally — the same view used by the
project page's Sessions tab
(`apps/web/src/routes/_authenticated/projects/$projectSlug/-components/sessions-view.tsx:194-468`).
There's no `TracesView`/`SessionsView` swap; the search page is
session-centric whether or not a query is active.

- **No query, no filters:** empty state.
- **Filters only:** plain session listing — same data path as the
  project's Sessions tab, just hosted on the `/search` URL with the
  saved-search affordances available.
- **Query active:** session listing carrying the rollup payload —
  matching-turns pill, score-ordered expanded rows, drawer drill-in
  on `bestTraceId`.

`searchMatches` is a data-driven prop on `SessionsView` (per-result
record, keyed by `sessionId`). When it's populated the view lights up
the search-specific affordances; when it's empty (no query) the view
degrades to today's project-page Sessions tab behavior. One code
path, no conditional rendering.

The `"searchMatches"` column lives in `SESSION_COLUMN_OPTIONS`
unconditionally; the cell renderer reads
`searchMatches[sessionId]?.matchingTraceCount` and renders nothing
when absent. Expanded rows come from `useExpandedSessionTraces`
(`sessions-view.tsx:54-98`) unchanged: **all** of the session's
traces in ingestion order, same as the Sessions tab today. Matching
turns are flagged visually (background tint or focus ring on the
trace row, exact treatment finalized during PR 4 design) — a
non-modal cue that the row produced the score, not a filter. Reading
the session top-to-bottom remains the primary mental model; the
highlight tells the user where in the conversation the matches sit.
`matchingTraceIds` and `matchingTraceScores` are consumed only for
the visual flagging and optional per-row score pill.

### 5.4 Drawer drill-in

When the user clicks a session row → expanded → individual matching
trace row, the existing trace-detail drawer flow takes over
(`search/index.tsx:355-368`). The drawer continues to receive
`traceId` (one specific trace from `matchingTraceIds`) and uses the
trace-level highlight pipeline from `5-search-highlights.md`. **No
change to the drawer is needed for the rollup itself** — the rollup
is purely a result-list operation.

Clicking the top-level session row (not an expanded trace row) opens
the drawer on `bestTraceId`. This is the default drill-in: "show me
why this session matched best".

### 5.5 Drawer prev/next navigation

`search/index.tsx` already supports cycling through results with
prev/next traces (`canNavigateNext`, `canNavigatePrev`,
`navigateTrace`). With sessions as the result rows:

- Inside an expanded session: prev/next walks every turn of the
  session in ingestion order — same as today's Sessions tab.
  Matching/non-matching is a visual cue inside the table, not a
  navigation distinction.
- Top-level session row click (no expansion needed): opens the
  drawer directly on `bestTraceId` — the default "show me why this
  session matched". The user can hit prev/next from there to walk
  the conversation around that match.

`traceIdsRef` (`search/index.tsx:78`, `sessions-view.tsx:392`) stays
identical in shape to the Sessions tab today: expanded sessions
contribute their full `session.traceIds` in ingestion order,
concatenated in page order. No search-specific assembly. The drawer
sees the same flat trace-id list it sees on the project page.

## 6. Edge cases

### 6.1 Session with one matching trace

Identical-to-trace-search behavior. `matching_trace_count = 1`,
`matching_trace_ids = [traceId]`, `best_score = relevance_score`. UI
hides the "N matching turns" pill or renders "1 matching turn".

### 6.2 Session with many matching traces (high fan-out)

A 50-turn conversation about a topic that all matches the query.
`matching_trace_count = 50`. The session row carries 50 ids and 50
scores in the result payload — at 8 bytes per `Float32` and ~32
bytes per UUID string that's ~2 KB per session row. Across a page of
50 sessions, that's ~100 KB — fine. We do _not_ cap the array
server-side; if a future profile shows the payload getting heavy,
truncate to the top-K matching traces in the SQL and surface
`matching_trace_count` separately (the array becomes a preview, the
count stays accurate).

### 6.3 Session whose traces span multiple days

Each trace has its own `min_start_time` / `max_end_time` from the
`traces` materialized view. The session-level rollup uses
`min(trace_start_time)` and `max(trace_end_time)` for the start/end
times — same shape as the existing `sessions` materialization at
`…/00007_sessions.sql:58`. The histogram bucket is keyed on the
session start time (earliest matching turn).

There is a subtle issue with the embedding TTL (30 days,
`TRACE_SEARCH_EMBEDDING_LOOKBACK_DAYS`): a long-running session
could have its oldest matching turn drop out of the embedding table
while the newer turns are still indexed. Behavior degrades
gracefully — older turns disappear from the embedding side; if they
still match lexically they remain in the lexical-only branch
(`trace_search_documents` is 90-day). This is the same
forward-only, TTL-respecting behavior as trace search today.

### 6.4 Mixed lexical + semantic (hybrid) rollup

`buildSearchPlan` in the hybrid branch already returns
`(trace_id, relevance_score)` where `relevance_score` is
`max(sem.semantic_score)` over chunks for traces that match
phrases, with `0.0` for phrase-only matches that didn't make the
embedding table (`trace-repository.ts:264-276`).

Two things to verify after the rollup:

- **Lexical-only sessions stay in.** A session whose matching traces
  all have `relevance_score = 0.0` (phrase matched, no embedding)
  rolls up to `best_score = 0.0`. They should still appear — ordering
  is stable (the tie-breaker `session_id DESC`), and the count
  reports them. **Recommendation: keep them; do not gate `best_score
  > 0` at the session level.**
- **Semantic floor.** The pure-semantic branch already applies
  `WHERE semantic_score >= 0.30` _inside_ `buildSearchPlan`
  (`trace-repository.ts:249`). The session rollup doesn't re-apply
  the floor and doesn't need to: the trace candidates have already
  passed the per-trace gate. A session whose traces individually
  scored 0.31, 0.32, 0.45 rolls up to `best_score = 0.45` — clean.
  A session with zero traces above 0.30 produces no row in the
  outer rollup at all because there's no inner candidate.

### 6.5 The "winning chunk metadata" follow-up

`5-search-highlights.md` proposes carrying `matched_chunk_index`,
`first_message_index`, `last_message_index` (and friends) through
the trace-level subquery so the drawer can highlight a chunk-level
region. With the session rollup, that metadata sits one level deeper
(per matching trace, not per session). The natural shape:

- `trace_rollup` adds the matched-chunk columns from
  `5-search-highlights.md` Phase C as additional aggregates per
  trace.
- The session-level rollup picks the winning trace via `argMax`
  and the winning trace's chunk metadata flows through alongside:

  ```sql
  argMax(matched_chunk_index, relevance_score)        AS best_matched_chunk_index,
  argMax(matched_first_message_index, relevance_score) AS best_matched_first_message_index,
  argMax(matched_last_message_index, relevance_score)  AS best_matched_last_message_index
  ```

  The drawer, when opened on `best_trace_id`, gets the same payload
  as today's trace-level highlight code path — nothing in
  `5-search-highlights.md` changes.

### 6.6 Score-filter (`FilterSet` HAVING) combined with session rollup

Already covered in §4.5: HAVING is applied at the per-trace level
inside `trace_rollup`. A session with one cost-passing trace and four
cost-failing traces still surfaces, with `matching_trace_count = 1`.
This is the user's intent — sessions visible in the search are
sessions that contain something interesting.

### 6.7 Orphan traces (no SDK session_id)

Traces whose spans never carried a `gen_ai.conversation.id` get a
synthesized session_id of `toString(trace_id)` in the rollup CTE via
the coalesce expression (see §4.3 and `./1-parity-traces-sessions.md`).
That means orphan traces **do** surface in session-level search
results — as 1-trace sessions. Pagination, cursors, and counts
treat them identically to real sessions; the visual distinction is
made on the UI side via the same `tokens_total = 0` / `models = []`
signature used everywhere else.

If a trace matches the search but has no `gen_ai.conversation.id` on
any of its spans, the result row carries `session_id =
toString(trace_id)`, `best_trace_id = trace_id`, `matching_trace_ids
= [trace_id]`. Drawer drill-in (§5.4) opens that single trace
directly.

### 6.8 `argMaxIfMerge(session_id)` reading semantics

`session_id` on `traces` is an `AggregateFunction(argMaxIf, ...)`
state (`…/00011_plan_aware_retention.sql:78`); the materialized
view's `LIST_SELECT` resolves it with `argMaxIfMerge(session_id)`
(`trace-repository.ts:312`). In the session-rollup CTE we read
session_id _inside_ `trace_rollup`'s GROUP BY-per-trace context, so
the merge happens once per trace — same as today's list query —
producing a plain `String`. We then apply the canonical coalesce
(`coalesce(nullIf(argMaxIfMerge(t.session_id), ''),
toString(t.trace_id))`) so orphan traces get their synthesized id
inside the same projection. The outer session GROUP BY then groups
on that plain, always-non-empty string. No double-merge edge cases.

## 7. Migration / rollout

Forward-only, same posture as trace search:

1. **Add the SQL path.** Implement Option A in
   `SessionRepository.listByProjectId` behind an `if (searchQuery)`
   branch. Wire `searchQuery` through the input schema, repository
   port, and server function.
2. **Add sibling fns.** `countSessionsByProject` /
   `getSessionMetricsByProject` / new histogram, all with
   `searchQuery` plumbed through and using the same CTE structure.
3. **Switch the search page.** Behind a feature flag if we want to
   stage; otherwise just swap `TracesView` → `SessionsView` on
   `/search` when `q.length > 0`. The non-search routes are
   unaffected.
4. **Update React Query collection hooks.** Replace
   `useTracesInfiniteScroll` + `useTracesCount` on the search page
   with `useSessionsInfiniteScroll` + `useSessionsCount` (the latter
   may need creating, depending on whether session count is already
   exposed).
5. **Telemetry.** Log per-query: matching session count, sum of
   matching-trace counts, query latency. We need these to decide
   whether Option B is ever needed.
6. **Drawer & highlights.** No change in V1. Phase C of
   `5-search-highlights.md` continues to work; the drawer is opened
   on `best_trace_id` or any specific `matchingTraceId`. The
   trace-level highlight endpoint takes the `q` plus the chosen
   `traceId` and produces highlights — unchanged.

No backfill is required because the trace-level indexes are reused.

## 8. Future work

- **Option B revisit.** If `matching_trace_count` distributions
  consistently show high fan-out (e.g. p99 > 30) and query latency
  becomes the bottleneck, materialize session-level corpora. The
  expected trigger is XL-scale projects with very long conversations
  (LangChain/agent-style sessions). The migration path is additive:
  build `session_search_documents` / `session_search_embeddings`,
  flip `buildSearchPlan` to consult them, leave the trace-level
  tables as the fallback / per-trace-highlight source of truth.
- **Cross-turn semantic queries.** The trace-level chunker can't see
  across trace boundaries by construction (chunks are turns within
  a trace). A query like "user asked X then later said Y" can't be
  served by the trace embeddings even after the session rollup. This
  is the strongest argument for Option B — but it's a real
  user-need question, not a perf question. Defer until we have
  examples.
- **Freshness-weighted ordering.** Tracked separately in
  `0-problems.md:148-163`. The session row's `best_score` is the
  obvious input to a `f(best_score, recency)` blended sort. Slot
  this in after the rollup ships.
- **Session-level export shape.** Already solved by the existing
  `useSessionSelectionAdapter` (`sessions-view.tsx:105-180`): session
  checkboxes drive a trace-keyed selection state, and
  `enqueueTracesExport` consumes it directly — no changes for search
  mode. Selection covers all of the session's traces, same as the
  Sessions tab today. A dedicated session-CSV layout (one row per
  session with rolled-up totals) is a separate product question;
  pursue only if customers ask. "Select session in search → export
  only the matching turns" is also possible as a future flag if
  product wants the narrower default.
- **Score normalization across plans.** Lexical-only returns
  `relevance_score = 0.0` while semantic returns cosines in roughly
  `[0.3, 0.9]`. The rollup carries that through, so a phrase-only
  session lands at `best_score = 0.0` regardless of phrase quality.
  This is the same shape as trace search today and is consistent
  with the policy "lexical is a filter, not a scorer"
  (`trace-search.md` → Configuration Reference / hybrid ranking
  note). Revisit if/when we add native phrase relevance.

## 9. Open questions

- **`buildSearchPlan` location.** The plan is currently defined inside
  `TraceRepository`'s closure (`trace-repository.ts:756-791`). The
  session repository needs the same function. Options: extract it to
  a shared helper in `packages/platform/db-clickhouse/src/repositories/`
  (next to `score-filter-subquery.ts`), or move it to the domain
  package (`packages/domain/spans/src/use-cases/`). The latter is
  cleaner but requires inverting the AI dependency. Recommendation:
  extract to a shared helper module
  `…/db-clickhouse/src/repositories/search-plan.ts` that exports
  `planSearch` / `buildSearchPlan` / `isActiveSearch`. Both
  repositories import.
- **Should the trace search page still exist?** Once
  `/projects/$projectSlug/search` collapses to sessions by default,
  is there ever a reason for a "search but show me traces flat" view?
  Possibly yes for power-users debugging the search itself. Defer to
  product but the SQL path supports both with zero extra work — the
  trace-level list query already exists and is unchanged.
- **Per-session export selection.** Resolved: selection mirrors the
  expansion — both show **all** of the session's traces, matching
  what the Sessions tab does today. `useSessionSelectionAdapter` is
  fed `session.traceIds` regardless of whether search is active, and
  `enqueueTracesExport` consumes that selection unchanged. The
  visual highlight on matching trace rows is a presentation cue, not
  a selection scope. If product later wants "checking a session in
  search selects only its matching turns", flip the index source to
  `matchingTraceIds` — one line.
- **Tie-breaker stability.** When `best_score` ties (especially the
  `0.0` lexical-only case), `ORDER BY best_score DESC, session_id
  DESC` is stable but arbitrary. Is there a recency or freshness
  signal we should prefer over `session_id` as the secondary sort?
  `max(trace_end_time)` would put recently-active sessions first
  among ties — defensible. Defer to the freshness-sort spec
  (`0-problems.md` → §8).
- **What does "matching turn" mean in the UI string?** "Turn" is
  user-facing; we've been using "trace" internally and "matching
  trace" in this spec. Pick one before shipping copy. Suggested:
  expose "**N** matching turns" in the result card, keep
  "trace_id" in URLs and API contracts.
- **Cursor staleness when a new trace lands mid-pagination.** The
  cursor `(best_score, session_id)` is stable as long as no new
  trace for an already-paginated session bumps its `best_score`. A
  new very-high-scoring trace landing mid-scroll could re-rank the
  session to the top of page 1 while it's already on page 3 — the
  user might see it again. This is the same forward-time anomaly as
  trace search today (`trace-search.md` doesn't address it
  explicitly); accept and document.
