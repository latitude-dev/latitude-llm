# Issue Details Page

> **Documentation**: `dev-docs/issues.md`, `dev-docs/reliability.md`, `dev-docs/scores.md`, `dev-docs/spans.md`, `dev-docs/monitors.md`

## Purpose

Today an issue is inspected through a right-side **drawer** (`IssueDetailDrawer` / `IssueDetailBody`) that shows name/description, a summary row, a 14-day trend histogram, linked evaluations, and a paginated mini-traces table. It answers *"what is this cluster?"* but not *"how much does it matter, who does it hit, what is special about it, and where exactly does it happen?"*.

This spec defines a **dedicated full-page Issue view** built from scratch as a first-class route. The page is an **issue report**: it turns the issue + its occurrences (scores) + the underlying telemetry (spans/traces) into impact, pattern, relational, and example analysis — using **only data we already store** (no new LLM calls, no prompt changes).

The drawer is intentionally **not** the design baseline. We build the page first to full feature parity, then **remove the drawer entirely** — the page becomes the single issue surface (row click navigates to it, every issue link points at it, and legacy `?issueId=` drawer URLs redirect to it). The fast in-list triage workflow the drawer provided (prev/next cycling) is preserved as header buttons + J/K hotkeys on the page. There is **no** hybrid drawer.

## Goals

- A dedicated, bookmarkable, shareable route for a single issue.
- Make **impact** a headline fact, not a footnote: affected users, affected sessions, affected traces, and cost — alongside occurrence count.
- Surface **what is unusual** about an issue's occurrences vs. the project baseline (model / provider / tool / tags / finish reason), ranked by how disproportionately each value's traces fall into the issue (rate-elevation).
- Surface **where** the issue happens inside a conversation: which interaction (trace) of the session it usually occurs on.
- Surface **what it is connected to**: co-occurring issues and a benchmark rank against the project's other issues.
- Let users **see the failing moment**: cycle through concrete occurrence examples with the exact message/part highlighted and the originating feedback shown inline.
- Add **light triage**: assignee and priority (status stays the existing resolve/ignore lifecycle).
- Reuse existing infrastructure (centroid, lifecycle, evaluations, conversation rendering, annotation navigation) rather than reinventing it.

## Non-goals

- **No new LLM usage and no prompt changes.** Every analysis below is a deterministic aggregation over stored data. Root-cause/fix suggestions are explicitly out of scope for now.
- **No full ticketing system.** Light triage means assignee + priority only. No comments/notes thread, no custom workflow states, no audit trail in this spec.
- **No temporal-intelligence suite** (onset/changepoint detection, seasonality heatmaps, burstiness, velocity/forecast, MTTR). The zoomable trend histogram stays; the heavier temporal analytics are deferred to avoid overwhelming users.
- **No confidence/provenance panel** (distinct-annotator counts, score-value distributions, sampling extrapolation) for now.
- **No "issue report" export / share-to-tracker** packaging for now.
- **No failure-mode drift detection** (would require persisting per-occurrence embeddings over time; only the aggregate centroid is stored today).
- **No cascade/temporal-order relational analysis** between issues.
- **No public API contract.** Issues remain web-only, consistent with `dev-docs/issues.md`.
- **No new ClickHouse migrations.** All new analytics are read-only repository methods over existing `scores` / `spans` / `traces` tables.

## Glossary

- **Issue**: canonical Postgres row clustering similar failed, non-errored, non-draft scores (`dev-docs/issues.md`).
- **Occurrence**: a score assigned to the issue (`scores.issue_id`), carrying `value`, `passed`, `source`, `feedback`, `trace_id`, `session_id`, `span_id`, and (for annotations) message/part anchors.
- **Trace / interaction**: a single request/response unit. One trace = one interaction.
- **Session / conversation**: an ordered set of traces sharing a `session_id`. "Interaction 3 of the session" = the 3rd trace by start time.
- **Base rate**: the issue's unconditional trace incidence in the time window — `affectedTraces / totalProjectTraces`. The reference every Patterns conditional rate is compared against (it is the same number the impact strip reports as "affected traces %").
- **Conditional rate**: for a dimension value `v`, `P(issue | v)` — the share of project traces carrying `v` that fall into this issue. The Patterns headline number.
- **Rate-elevation**: `conditionalRate − baseRate`, in percentage points — how much more a value's traces fall into the issue than traces overall. Patterns' sort key.
- **Coverage**: `affectedTracesWithValue / issueAffectedTraces` — what share of the *issue* a value explains. Distinguishes a strong-and-broad culprit from a strong-but-niche one.
- **Lift**: `conditionalRate / baseRate` (equivalently `P(v | issue) / P(v)` — the two are algebraically identical). Lift > 1 means over-represented. Kept as a concept; the UI shows the rate pair + rate-elevation rather than the raw multiplier, which is unstable for rare values.
- **Semantic similarity**: cosine similarity between two issues' centroid embeddings (`issues.centroid_embedding`) — "these two issues *mean* the same failure". Lives in Postgres/pgvector, maintained by the clustering pipeline.
- **Co-occurrence**: two issues having occurrences in the same **sessions** — "these two issues *travel together*". Measured over the session sets in ClickHouse `scores`.
- **NPMI** (normalized pointwise mutual information): bounded `[-1, 1]` measure of co-occurrence above chance — `ln(P(A,B) / (P(A)·P(B))) / −ln(P(A,B))`. The numerator is log-lift; the denominator normalizes by the rarity of the joint event, which kills both the rare-pair lift inflation and the big-neighbor chance overlap. Clamped at 0 for the related-issues score.
- **Relatedness**: the merged ranking score for the Related-issues list — noisy-OR of the normalized semantic and co-occurrence scores: `1 − (1 − semScore)(1 − coocScore)`. Sort-order only; never displayed raw.

## Conceptual model

The page is organized as a top-to-bottom **report** with a persistent metadata/triage rail. The report is composed of independent analysis blocks, each backed by one read query, so blocks can ship and degrade independently:

1. **Identity** — name, description, lifecycle status, source, slug, tags.
2. **Impact** — occurrences, affected traces (count + %), affected sessions, affected users, cost, and a derived severity hint.
3. **Trend** — wide, zoomable occurrence histogram with existing escalation/incident overlays.
4. **Patterns** — a single ranked list of the dimension values (model, provider, tool, tag, finish reason) whose traces most disproportionately fall into this issue vs. the project base rate (rate-elevation), support-gated.
5. **Where it happens** — distribution of the session-interaction position at which the issue occurs.
6. **Related** — a single merged list of the project's most related issues, combining two independent signals: **semantically similar** issues (centroid cosine, pgvector) and **co-occurring** issues (shared sessions, NPMI), ranked by a combined relatedness score; plus a project benchmark rank.
7. **Examples** — inline carousel cycling through occurrences with the exact message/part highlighted.
8. **Occurrences** — paginated traces table (the existing list, kept).
9. **Monitoring** — linked evaluations (the existing section, kept).
10. **Triage** — assignee, priority, resolve/ignore.

### Degradation rules

- Any analysis block that has insufficient data renders an explicit empty/low-confidence state, never a misleading chart. Lift and benchmark blocks are **significance-gated**: below a minimum occurrence sample they show "not enough data yet" instead of extreme percentages.
- Annotation-only signals (message/part anchors) degrade to trace-level when anchors are absent (evaluation/custom occurrences).

## Data model

### Postgres — `issues` table (new triage columns)

Add two nullable columns to `latitudeSchema.issues` (see `packages/platform/db-postgres/src/schema/issues.ts`). Per repo convention, **no foreign keys**.

- `assignee_id` — `cuid`, nullable. Logical reference to an organization member; resolved/validated at the use-case boundary, not via FK.
- `priority` — `varchar(16)`, nullable, `$type<IssuePriority>()`. Literal union, no DB enum.

```typescript
// packages/domain/issues/src/entities/issue.ts (additions)
export const IssuePriority = {
  Low: "low",
  Medium: "medium",
  High: "high",
  Urgent: "urgent",
} as const;
export type IssuePriority = (typeof IssuePriority)[keyof typeof IssuePriority];
```

- `priority` defaults to `null` ("unset"). It is **manual and authoritative**; the derived severity hint (below) never writes it — it only *suggests* a value in the UI.
- `assignee_id` defaults to `null` ("unassigned").
- Add a btree index covering triage filtering/sorting on the list page if/when the list exposes assignee/priority columns: extend the existing `issues_project_lifecycle_idx` strategy rather than adding a redundant index. (Deferred until the list surfaces these.)
- **Status is unchanged**: it remains the derived lifecycle (`new`/`escalating`/`ongoing`/`regressed`/`resolved`/`ignored`) plus the manual `resolvedAt`/`ignoredAt` timestamps. No new status column.

The `Issue` entity, `IssueWithLifecycle`, `IssueDetails`, and `IssueListItem` shapes gain `assigneeId` and `priority`.

### Postgres — new use-cases (`@domain/issues`)

- `updateIssueTriageUseCase({ issueId, assigneeId?, priority? })` — single use-case that patches assignee and/or priority. Validates the assignee is a member of the issue's organization. Emits no domain event beyond the standard issue update.
- Read paths (`get-issue-details`, `list-issues`) include the two new fields.

### Postgres — semantic neighbors (`IssueRepository.findSimilarByCentroid`)

New read on the issue repository powering the Related list's semantic signal:

- `findSimilarByCentroid({ projectId, issueId, limit }) → { issueId, similarity }[]` — exact cosine scan of the project's other issues against this issue's `centroid_embedding` (`1 − (centroid_embedding <=> me)`), ordered by similarity, capped at `limit`. Returns an **empty list** when the source issue has no embedding (zero-mass centroid) — the semantic signal simply degrades to nothing.
- Same-embedding-space comparison is guaranteed by construction: `save()` only persists `centroid_embedding` for `CENTROID_EMBEDDING_MODEL`, so no per-row model guard is needed.
- **Resolved/ignored issues are included** — "a similar issue was already resolved" is the most actionable row in the list. No similarity floor at the repository layer; gating lives in the domain scorer.
- No ANN index, same as `hybridSearch`/`searchOrgWide` (exact scan is faster below ~10k issues/project).

### ClickHouse — new read-only analytics (no migrations)

All methods live on `ScoreAnalyticsRepository` (port: `packages/domain/scores/src/ports/score-analytics-repository.ts`; impl: `packages/platform/db-clickhouse/src/repositories/score-analytics-repository.ts`). They reuse existing field registries (`trace-fields.ts`, `score-fields.ts`), `buildClickHouseWhere`, and the existing `groupUniqArrayIf` / `countIf` / `quantileTDigest` patterns.

1. **`aggregateImpactByIssue(issueId, range?) → IssueImpact`**

   ```typescript
   type IssueImpact = {
     occurrences: number;          // count of scores with this issue_id
     affectedTraces: number;       // distinct trace_id among occurrences
     affectedSessions: number;     // distinct session_id among occurrences
     affectedUsers: number;        // distinct traces.user_id among affected traces
     costMicrocents: number;       // sum cost_total_microcents over DISTINCT affected traces
     tokens: number;               // sum tokens_total over DISTINCT affected traces
     totalProjectTraces: number;   // denominator for affectedTracesPercent in range
   };
   ```

   - `affectedTracesPercent = affectedTraces / totalProjectTraces` (already computed today; fold into this method).
   - Cost/tokens are summed over **distinct** affected traces (join occurrences → `traces` by `trace_id`) to avoid double counting when multiple occurrences share a trace.

2. **`aggregateDimensionByIssue(issueId, dimension, range?) → IssueDimensionComparison`** — one read per dimension.

   ```typescript
   type IssueDimension = "model" | "provider" | "tool" | "tag" | "finishReason";

   type DimensionConditionalRate = {
     value: string;            // e.g. "gpt-5.5", "anthropic", "search_web", "length"
     affectedTraces: number;   // distinct traces carrying this value that are in the issue
     totalTraces: number;      // distinct project traces carrying this value (in range)
     conditionalRate: number;  // affectedTraces / totalTraces = P(issue | value), in [0, 1]
     coverage: number;         // affectedTraces / issueAffectedTraces = share of the issue this value explains, in [0, 1]
   };

   type IssueDimensionComparison = {
     dimension: IssueDimension;
     baseRate: number;            // issueAffectedTraces / totalProjectTraces = P(issue), in [0, 1]
     issueAffectedTraces: number; // distinct traces in the issue (coverage denominator)
     values: DimensionConditionalRate[]; // support-gated, sorted by rate-elevation (conditionalRate − baseRate) desc
   };
   ```

   **Dimension value sources (trace-level).** Each dimension reads a span value and is rolled up to the **trace**: a trace "carries" value `v` if any of its spans has `v`. `model` → `spans.model`, `provider` → `spans.provider`, `tool` → `spans.tool_name`, `tag` → `arrayJoin(spans.tags)`, `finishReason` → `arrayJoin(spans.finish_reasons)`. The empty value `''` is excluded. (`operation` / `response_model` are intentionally not dimensions — they describe rather than implicate. Trace-`metadata` JSON keys are a separate, deferred dimension family; see Tasks.)

   **Counting unit is the trace, not the span.** "Is this trace affected by the issue?" is a yes/no, so a trace with ten LLM calls on the same model counts once, not ten times. The numerator (`affectedTraces`) and denominator (`totalTraces`) are both `countDistinct(trace_id)`; this also makes `baseRate` identical to the impact strip's affected-traces %.

   <!--
   PATTERN VALUE — how the comparison is computed, and why it is "reverse" (P(issue | value))
   rather than "forward" (P(value | issue)). Recorded here so a future change is a deliberate
   one, not an accidental regression.

   Both directions answer "is this value over-represented in the issue?" and, by Bayes, share the
   SAME lift: P(value | issue) / P(value) == P(issue | value) / P(issue). What differs is which
   numbers reach the screen and how each behaves on real data.

   FORWARD — P(value | issue), the v1 build:
     • Compute: of the issue's traces, what share carry value v (issueShare), vs. that value's
       share across all project traces (baselineShare). Outlier = issueShare / baselineShare.
     • Introduces: a ratio with an unbounded, unstable tail. A value that is rare *everywhere*
       (including in the issue) divides a tiny issueShare by a near-zero baselineShare and posts a
       huge multiplier (the "×386 on a 2%-coverage value" problem). The displayed multiplier needs
       a baseline floor to avoid divide-by-zero, and that floor is exactly what inflates rare
       values. The reader must mentally divide two shares to reach "is this a culprit?".

   REVERSE — P(issue | value), the chosen design:
     • Compute, per value v: conditionalRate = (distinct issue traces carrying v) / (distinct
       project traces carrying v). Compare to baseRate = P(issue) = issueAffectedTraces /
       totalProjectTraces. rate-elevation = conditionalRate − baseRate; lift = conditionalRate /
       baseRate (same number as forward lift).
     • Introduces: two bounded, directly-readable percentages — "85% of gpt-5.5 traces fall into
       this issue, base rate 3%" — which is the causal/culprit sentence stated outright instead of
       implied. The significance gate becomes natural ("need ≥ N traces using v to trust its
       rate") and kills the rare-value inflation at the source, so no baseline floor and no raw
       multiplier on screen. baseRate ties Patterns to the headline impact %, so the page reads as
       one narrative. Cost is equal or lower: a single scan with countDistinct(trace_id) +
       countDistinctIf(trace_id, trace_id IN issueTraces) GROUP BY value, instead of two passes.
     • Caveat it introduces: reverse can surface a value that is strongly predictive but niche
       (30 traces, 28 in the issue = 93% rate, yet 0.5% of a large issue). That is still a true
       finding, so we keep it but (a) gate on minimum trace support to drop true flukes and
       (b) carry `coverage` on every row so "strong-and-broad" is visually distinct from
       "strong-but-niche". Sort stays on rate-elevation (strength) primary.

   DECISION: reverse. It states the culprit directly, is numerically stable without floors, gates
   intuitively, and aligns with the impact base rate — at equal-or-lower query cost. Revisit only
   if the niche-but-high-rate caveat proves noisy in practice (then consider a coverage-weighted
   sort), in which case this is the place to flip back the conditioning, not the UI.
   -->

   **Significance gate.** Values are filtered to a minimum trace support (`totalTraces ≥ ISSUE_DIMENSION_MIN_SUPPORT`, a named constant) so a value used by a handful of traces cannot post a "93% rate". When no value clears the gate, `values` is empty and the UI shows "not enough data to compare against the project baseline yet". `baseRate` and `issueAffectedTraces` may be reused from `aggregateImpactByIssue` rather than recomputed.

3. **`coOccurrenceByIssue(issueId, range) → IssueCoOccurrenceAggregate`**

   ```typescript
   type IssueCoOccurrence = {
     issueId: string;          // the other issue
     sharedSessions: number;   // sessions where both issues have an occurrence (in range)
     theirSessions: number;    // sessions where the other issue has an occurrence (in range)
   };

   type IssueCoOccurrenceAggregate = {
     mySessions: number;       // sessions where this issue has an occurrence (in range)
     totalSessions: number;    // sessions with ANY issue occurrence (the probability universe)
     candidates: IssueCoOccurrence[]; // top N by sharedSessions, self-excluded, sharedSessions ≥ 1
   };
   ```

   - One scan over `scores` in `range`: select the issue's distinct non-empty `session_id` set, then `GROUP BY issue_id` over issue-carrying scores counting `uniqExactIf(session_id, session_id IN mySessions)` vs `uniqExact(session_id)`, excluding `issueId` itself. A second cheap read returns `mySessions` + `totalSessions`.
   - The probability universe is **sessions carrying at least one issue occurrence** (not all project sessions): unscored sessions carry no information about issue association and would only dilute every probability uniformly.
   - The repository returns **raw counts only** — NPMI scoring, the shared-session floor, and ranking live in `@domain/issues` (see *Related-issues scoring* below) so the math is unit-testable without ClickHouse.
   - The window is fixed at the last `ISSUE_RELATED_COOCCURRENCE_WINDOW_DAYS` (30) days — not wired to a page range selector.

   **Related-issues scoring (`@domain/issues`, pure).** The Related list merges two independent signals into one ranking:

   - `semScore = clamp((cosine − ISSUE_RELATED_SEMANTIC_FLOOR) / (ISSUE_RELATED_SEMANTIC_CEILING − ISSUE_RELATED_SEMANTIC_FLOOR), 0, 1)` — a linear rescale of centroid cosine similarity over its *useful* band. Above the ceiling (≈0.85) two clusters are effectively duplicates (discovery would merge new scores into either); below the floor (≈0.55) they are unrelated. Surviving issue pairs sit below the discovery merge threshold *by construction*, so the band is where all the signal lives.
   - `coocScore = max(0, NPMI)` over the session counts above, gated to `sharedSessions ≥ ISSUE_RELATED_MIN_SHARED_SESSIONS` (3) so one coincidental session cannot post a high score. NPMI is preferred over raw lift (unbounded, inflated for rare pairs) and over Jaccard/overlap percent (inflated by big neighbors that co-occur with everything by chance): its numerator *is* log-lift and its denominator normalizes by joint-event rarity, so both failure modes die at the source.
   - `relatedness = 1 − (1 − semScore)(1 − coocScore)` (noisy-OR): either signal alone carries a row; a row scoring on both — the "possibly the same issue" case — ranks above either alone. Rows below `ISSUE_RELATED_MIN_RELATEDNESS` are dropped; top `ISSUE_RELATED_LIMIT` survive. The combined score is sort-order only and never displayed.

   The forward design (`lift` displayed, sessions/traces both counted) is superseded: lift's instability for rare values is the same problem Patterns hit (see method #2's reverse-conditioning rationale), and a merged single list needs one bounded, comparable score per signal.

4. **`failurePositionBySession(issueId, range?) → FailurePositionDistribution`**

   ```typescript
   type FailurePositionDistribution = {
     buckets: Array<{ position: number; count: number; percent: number }>; // 1-indexed interaction
     overflowBucket?: { fromPosition: number; count: number; percent: number }; // e.g. "10+"
     medianPosition: number;
     sessionsConsidered: number;     // sessions with >= 2 interactions
     singleInteractionShare: number; // share of occurrences in single-trace sessions
   };
   ```

   - Compute, per occurrence, the **rank of its trace within its session** ordered by `traces.start_time` (ClickHouse window: `row_number() OVER (PARTITION BY session_id ORDER BY start_time)`). Aggregate the ranks into buckets, collapsing a long tail into an overflow bucket (e.g. `10+`).
   - Sessions with a single interaction are reported separately (`singleInteractionShare`) so "1st interaction" is not inflated by trivially short sessions.
   - This is the **session**-level "where it happens" view the product wants. A trace-level (message-index) variant is possible later from annotation anchors but is **not** in this spec.

5. **`issueBenchmark(issueId, range?) → IssueBenchmark`**

   ```typescript
   type IssueBenchmark = {
     occurrencesPercentile: number;   // 0..1 among project issues in range
     userReachPercentile: number;     // 0..1 by affectedUsers
     totalIssuesCompared: number;
   };
   ```

   - Computed by ranking this issue's occurrence count and affected-user count against the project's other active issues in `range`. May reuse the list aggregate rather than a bespoke scan where cheap.

### Web server functions (`apps/web/src/domains/issues`)

Extend `issues.functions.ts` with serializable wrappers, fetched by dedicated React Query hooks in `issues.collection.ts` (one hook per analysis block so blocks load and revalidate independently):

- `getIssueImpact`, `getIssueDimensions(dimension)`, `getRelatedIssues`, `getIssueFailurePositions`, `getIssueBenchmark`, plus `updateIssueTriage`. `getRelatedIssues` orchestrates the two reads (pgvector neighbors + ClickHouse co-occurrence counts, in parallel), runs the pure domain scorer, and hydrates the surviving rows from Postgres (`findByIds`) with lifecycle states derived server-side.
- `getIssueDetail` (existing) gains `assigneeId` + `priority`.
- The **examples** block reuses existing data: `listIssueTraces` + per-trace conversation (`useTraceDetail`) + annotations (`useAnnotationsByTrace`); no new occurrence-fetch endpoint is required beyond surfacing the per-occurrence score anchor (`metadata.messageIndex` / `partIndex` / offsets) for the focused score.

## Architecture

- **Postgres** owns the canonical issue row (now including triage), lifecycle, evaluations, and the examples' score anchors.
- **ClickHouse** owns all the new aggregations (impact, dimensions, co-occurrence, failure position, benchmark) over `scores` ⋈ `spans`/`traces`.
- **Read orchestration** mirrors the existing page: ClickHouse-first analytics, hydrate canonical issue/related-issue rows from Postgres by id.
- Each analysis block is an independent query behind its own hook so the page renders progressively and a slow/empty block never blocks identity + triage + impact (the most important above-the-fold content).
- The new ClickHouse methods must be **organization- and project-scoped** at the boundary like every other analytics query, and parameterized (no string interpolation), per `database-clickhouse` conventions.

## Web UI

New route: `apps/web/src/routes/_authenticated/projects/$projectSlug/issues/$issueId/index.tsx` (TanStack Start nested route). The route reads `issueId` from the path (bookmarkable/shareable), unlike the drawer's `?issueId=` query param.

The page is composed from **new presentational components** (built from scratch under `issues/$issueId/-components/`). Where an existing piece is already correct and reusable — the trend bar, the evaluations section, the traces table, the conversation renderer, annotation navigation — it is reused as a building block, but the page layout is not derived from the drawer.

### Layout

A sticky header, a scrollable main column, and a sticky right metadata/triage rail.

```
┌────────────────────────────────────────────────────────────────────────┐
│ STICKY HEADER                                                            │
│  Issues / <name>            [◀ prev] [next ▶]   [Resolve ▾] [Monitor]    │
│  <name>   <status badges>   <source chip>   <slug copy>                  │
├──────────────────────────────────────────────┬───────────────────────────┤
│ MAIN COLUMN (scroll)                          │ RIGHT RAIL (sticky)        │
│                                               │                            │
│ ── Impact strip (tiles) ──────────────────────│  Triage                    │
│  [Occurrences] [Affected traces  N (x%)]      │   Assignee  [picker]       │
│  [Sessions N]  [Users N] [Cost $X] [Severity] │   Priority  [picker]       │
│                                               │   Status    Resolved/…     │
│ ── Description ───────────────────────────────│                            │
│  generated description text                   │  Details                   │
│                                               │   Source    annotation     │
│ ── Trend ─────────────────────────────────────│   First seen 3y ago        │
│  wide zoomable histogram + overlays           │   Last seen  11d ago        │
│                                               │   Tags       [tag list]     │
│ ── Patterns (vs baseline) ────────────────────│                            │
│  Model | Provider | Tool | Tags  (tabs)       │  Benchmark                 │
│  value ▇▇▇▇  60% (×1.5 vs 40%)  ⚠ outlier      │   Top 3% by users          │
│                                               │   Top 8% by volume         │
│ ── Where it happens ──────────────────────────│                            │
│  interaction-position bar chart of the        │  Monitoring                │
│  session  (median: interaction 3)             │   1 evaluation · 92%       │
│                                               │   [open ↓]                 │
│ ── Related issues ────────────────────────────│                            │
│  co-occurring issues list (shared %, lift)    │                            │
│                                               │                            │
│ ── Examples ──────────────────────────────────│                            │
│  ◀  conversation with highlighted part   ▶    │                            │
│      feedback card inline on the message      │                            │
│                                               │                            │
│ ── Occurrences ───────────────────────────────│                            │
│  paginated traces table                       │                            │
│                                               │                            │
│ ── Monitoring (full) ─────────────────────────│                            │
│  linked evaluations + alignment + advanced    │                            │
└──────────────────────────────────────────────┴───────────────────────────┘
```

### Block-by-block presentation

1. **Header (sticky).** Breadcrumb `Issues / <name>`, prev/next navigation (carries the originating list order so cycling matches the table the user came from), and the primary lifecycle actions (Resolve/Unresolve, Ignore/Unignore) plus Monitor. The header shows the **single canonical status badge** derived from the lifecycle states with priority order `Regressed > Escalating > New > Ongoing > Resolved > Ignored`, with secondary states shown as smaller chips. Source chip (annotation/custom) and copyable slug.

2. **Impact strip.** A row of stat tiles, the page's above-the-fold payload, fed by `getIssueImpact`:
   - **Occurrences** (lifetime).
   - **Affected traces** — count and `affectedTracesPercent`.
   - **Affected sessions** — distinct sessions.
   - **Affected users** — distinct users (the most human-meaningful impact metric).
   - **Cost impact** — summed cost over distinct affected traces, formatted as currency, with a tokens sub-label.
   - **Severity** — a derived hint (blend of user reach, occurrence volume, affected-traces %, cost) shown as a label (e.g. `High`) with a tooltip explaining the inputs. Clicking it offers to set `priority` to the suggested value; it never writes priority automatically.

3. **Description.** The generated issue description (unchanged source), rendered as readable prose.

4. **Trend.** A wider version of the occurrence histogram with **zoom/pan controls** and a range selector local to the page. Reuses `IssueTrendBar` (escalation-threshold curve, incident overlays, regressed/escalating bucket coloring) extended for a larger canvas and interactive zoom. Backed by the existing `histogramByIssues` (variable bucket size + range). Optional stacked split by source (annotation/evaluation/custom) is allowed but secondary.

5. **Patterns (what's unusual).** A **single ranked list across all dimensions** (model, provider, tool, tag, finish reason) — not tabs or per-dimension cards — backed by `getIssueDimensions`. Each row is one dimension value and reads as a culprit sentence:

   > `Model` **gpt-5.5** — **85%** of its traces are in this issue (base rate **3%**) · covers **60%** of occurrences

   - Rows are sorted by **rate-elevation** (`conditionalRate − baseRate`) descending, so the values whose traces most disproportionately fall into the issue surface first, *regardless of which dimension they belong to*. A dimension whose values all fail the support gate simply does not appear — no empty sections, no fixed ordering by dimension.
   - Each row shows the **conditional rate** (headline), the **base rate** (reference), and **coverage** (how much of the issue the value explains), so a strong-and-broad culprit is visually distinct from a strong-but-niche one. A small **dimension chip** labels each row; a dimension filter is optional sugar.
   - A subtle bar can encode the conditional rate with a tick at the base rate, so the gap (rate-elevation) is the visual emphasis. The raw lift multiplier is **not** shown (it is unstable for rare values; the two percentages carry the meaning).
   - When no value clears the support gate the section shows "not enough data to compare against the project baseline yet".

6. **Where it happens.** A compact bar chart of the **session-interaction position** distribution (`getIssueFailurePositions`): x-axis = interaction index within the conversation (`1, 2, 3, … , 10+`), y-axis = share of occurrences, with a callout for the **median interaction** (e.g. *"usually on interaction 3 of the conversation"*) and a separate note for the single-interaction share. This is the headline "where" insight; it directly tells users whether failures are an opening-turn problem or a long-conversation-degradation problem.

7. **Related issues.** A **single merged list** from `getRelatedIssues`, ranked by the combined relatedness score (semantic ⊕ co-occurrence, noisy-OR). Each row shows the related issue name (hydrated from Postgres), its lifecycle badge (resolved/ignored included — *"a similar issue was resolved"* is the actionable case), and **reason chips explaining why the row is here** rather than any raw score:

   > *Tool call timeout on search* `Ongoing` — appears in **64%** of this issue's sessions
   > *Hallucinated citations* `Resolved` — **similar failure pattern**
   > *Wrong refund amounts* `Ongoing` — **similar pattern** · shares **20%** of sessions

   - Co-occurrence rows lead with the **shared-session percent** sentence (`sharedSessions / mySessions`); semantic rows lead with the **similar-pattern** chip; dual-signal rows show both (implicitly the "possibly the same issue" case — no explicit duplicate claim in v1).
   - Cosine values and the combined score are **never displayed** — they rank, the chips explain.
   - Rows link to that issue's page. Project-scoped only.
   - Below the list, the **benchmark** summary may also appear here as well as in the rail (*"Top 3% by user reach, top 8% by volume among 214 issues"*). Empty state when neither signal produces a row.

8. **Examples.** An inline **occurrence carousel** built on the reusable `Conversation` component (`packages/ui/src/components/genai-conversation/conversation.tsx`) and the annotation-navigation system (`use-annotation-navigation.ts`):
   - Prev/next (and **H/L** keys) cycle through occurrences (scores) of the issue. (Issue-level prev/next on the page uses J/K; examples use H/L to avoid the collision.)
   - For each occurrence, the embedded conversation **scrolls to and highlights the exact message/part** using the score's `metadata.messageIndex` / `partIndex` / `startOffset`/`endOffset` (via existing `data-message-index` / `data-part-index` attributes and box-shadow highlight).
   - The originating **feedback/reason** renders inline as a card anchored under the message (`messageTrailingSlot`), so the *why* sits next to the failing text.
   - **Degradation:** occurrences without message-level anchors (evaluation/custom) highlight at span/trace level instead. A counter (`3 / 47`) shows position in the set.
   - A "Copy link to this example" action produces a shareable URL (`…/issues/$issueId?example=<scoreId>`), enabled by the page route.

9. **Occurrences.** The existing paginated traces table (`ProjectTracesTable`, infinite scroll, columns startTime/name/tags/duration), retained as-is, with row click opening the trace detail (as a sub-route `?traceId=` on the page rather than the drawer's local Sheet).

10. **Monitoring.** The existing linked-evaluations section (alignment metric, confusion-matrix tooltip, advanced-statistics modal, sampling/scope editing, realign, and the empty-state Monitor button). Reused unchanged; a condensed summary also appears in the right rail.

### Right rail (sticky)

- **Triage**: assignee picker (org members), priority picker (`Low/Medium/High/Urgent`, clearable), and the derived status. Writes via `updateIssueTriage` / existing lifecycle actions, optimistic with `useIssueDetail` invalidation.
- **Details**: source, first/last seen (relative + absolute tooltip), slug (copyable), tags.
- **Benchmark**: percentile chips.
- **Monitoring**: count of linked evaluations + headline alignment %, anchored link to the full Monitoring section.

### Drawer removal (Phase 3.6)

The drawer is **removed**, not graduated. Once the page reaches feature parity (Phase 3.5: prev/next, tags, copyable slug), Phase 3.6:

- makes the issues-table **row click navigate to `/projects/$slug/issues/$issueId`** instead of opening the drawer via `?issueId=`;
- **repoints every issue link** — annotation cards, in-app notifications (`useIssueUrl`), incident-marker popover, monitor-incidents table, and the issue URLs built in **email** (`@domain/email`) and **Slack** (`@domain/integrations`) incident templates — from `…/issues?issueId=<id>` to the path route `…/issues/<id>`;
- adds a **backwards-compat redirect**: the issues list route redirects any incoming `?issueId=<id>` to `/issues/<id>` (preserving `?example=`), because already-sent emails/Slack messages carry the legacy URL and are immutable;
- **deletes the `IssueDetailDrawer` chrome** (the close / prev-next / open-full-page wrapper). The shared `IssueDetailBody` **stays** — both the issue page and the session-detail panel's issue slot render it, the latter still in **drawer** mode, so its `variant` prop is **retained** (not collapsed);
- **retires the `issue-page` flag** so the page renders unconditionally.

There is no curated drawer subset; the page is the only issue surface.

## Feature flag

The new route, the "open full page" affordances, and the triage UI are gated behind the org feature flag `issue-page` during Phases 1–3.5, mirroring the `monitors` rollout pattern (`dev-docs/monitors.md`). Backend triage columns and analytics methods are unflagged (additive, inert without UI). The flag is **temporary**: **Phase 3.6 removes it** when the page replaces the drawer and becomes the sole, always-on issue surface.

## Test strategy

Backend only (no frontend tests), per repo convention:

- Use-case tests for `updateIssueTriageUseCase` (assignee org-membership validation, priority set/clear, idempotency).
- Repository tests (chdb testkit) for each new analytics method: `aggregateImpactByIssue` (distinct-trace cost dedupe, affected-users), `aggregateDimensionByIssue` (trace-level conditional-rate + coverage math + support gate), `coOccurringIssues` (shared sets + self-exclusion + lift), `failurePositionBySession` (window ranking, single-interaction handling, overflow bucket), `issueBenchmark` (percentile ranking).
- Read-path tests that `get-issue-details` / `list-issues` surface `assigneeId` + `priority`.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 — Page scaffold + impact + light triage

- [x] **P1-1**: Add `assignee_id` + `priority` columns (Drizzle migration), extend `Issue` entity, `IssueWithLifecycle`, `IssueDetails`, `IssueListItem`, and `IssuePriority` literal union.
- [x] **P1-2**: `updateIssueTriageUseCase` + web server function `updateIssueTriage` + collection hook, with assignee org-membership validation.
- [x] **P1-3**: `aggregateImpactByIssue` ClickHouse method (occurrences, affected traces/sessions/users, cost/tokens, total project traces) + tests; web `getIssueImpact`.
- [x] **P1-4**: New route `issues/$issueId/index.tsx` behind the `issue-page` flag; sticky header (canonical status badge, prev/next, lifecycle actions, Monitor), description, right rail (triage pickers, details), and the impact strip including the derived severity hint.
- [x] **P1-5**: Reuse the existing trend histogram and occurrences table on the page (no zoom yet); reuse the existing evaluations/monitoring section.
- [x] **P1-6**: "Open full page" affordance from the drawer and/or issues table (flag-gated).

**Exit gate**: an issue opens as a dedicated, bookmarkable page showing identity, impact (users/sessions/traces/cost), trend, occurrences, monitoring, and working assignee/priority/resolve/ignore. Drawer unchanged.

### Phase 2 — Patterns (vs baseline)

- [x] **P2-1**: `aggregateDimensionsByIssue` for `model`/`provider`/`operation`/`tag` with baseline + lift + significance gate + tests.
- [x] **P2-2**: `getIssueDimensions` web function + per-dimension hooks.
- [x] **P2-3**: Patterns card (Model/Provider/Tool/Tags tabs) with lift badges, outlier flags, and the low-sample empty state.

**Exit gate**: the page shows which models/providers/tools/tags are over-represented in this issue vs. the project baseline, with lift and significance handling.

#### Phase 2 — Revision (R2: reverse conditioning + single list)

Supersedes the v1 build above. Rationale and the forward-vs-reverse decision live in *Data model* method #2.

- [ ] **P2-R1**: Recompute `aggregateDimensionByIssue` at **trace level** with **reverse** conditioning — return `conditionalRate`, `coverage`, `baseRate`, `issueAffectedTraces` (single `countDistinct` / `countDistinctIf … GROUP BY value` scan). Add `finishReason`; drop `operation`. Replace the lift/sample/floor gates with a single `ISSUE_DIMENSION_MIN_SUPPORT` trace-support gate. Update chdb tests (conditional-rate + coverage math, support gate, niche-but-high-rate case).
- [ ] **P2-R2**: Update `getIssueDimensions` web function + hooks for the new `IssueDimensionComparison` shape.
- [ ] **P2-R3**: Replace the four cards with a **single list ranked by rate-elevation across all dimensions** — dimension chip + conditional rate + base rate + coverage, support-gated empty state, no per-dimension sections.
- [ ] **P2-R4** *(deferred — most complex, do last)*: add trace-`metadata` JSON keys as a dimension family. Requires discovering which keys are present/useful across an issue's traces (skip unique-per-trace keys) and bucketing their values before the same reverse comparison applies.

**Revised exit gate**: the page shows a single ranked list of the model/provider/tool/tag/finish-reason values whose traces most disproportionately fall into this issue (conditional rate vs. base rate), support-gated, with coverage shown per row.

### Phase 3 — Examples carousel

- [x] **P3-1**: Surface the focused occurrence's score anchor (`messageIndex`/`partIndex`/offsets) to the web layer for an issue's occurrences.
- [x] **P3-2**: `IssueExamples` component reusing `Conversation` + `use-annotation-navigation` to scroll/highlight the exact part, with `messageTrailingSlot` feedback card and J/K cycling.
- [x] **P3-3**: Trace-level/span-level fallback when anchors are absent; `?example=<scoreId>` shareable URL.

**Exit gate**: users can cycle through concrete occurrences with the failing message/part highlighted and the originating feedback shown inline.

### Phase 3.5 — Page feature parity with the drawer

Bring the drawer's remaining affordances onto the page (drawer left intact as the reference).

- [x] **P3.5-1**: Render issue **tags** (`TagList`) and a **copyable slug** (`CopyableText`) on the page header/summary band — not behind the `variant === "drawer"` branch of `IssueDetailBody`. *(As built: slug-copy badge sits under the title in the `Layout.Header` `description` slot; the issue **description text + tags** drop to a full-width row at the top of the content area — `IssueDetailBody` `prepend` — so they use the whole width left of/under the action buttons instead of being squeezed into the header's left column.)*
- [x] **P3.5-2**: **Prev/next issue** buttons + **J/K** hotkeys, cycling over the default-sorted issue list via `useIssues` (disabled at ends; does not carry the originating list's filters/sort). *(As built: new `IssueNeighborNav` at the **start of the header actions** (left of triage, divider between); cycles within the issue's own lifecycle group; hotkeys suppressed while a trace sheet is open.)*
- [x] **P3.5-3**: Rebind the **Examples** carousel from J/K to **H/L** (and its on-screen hotkey badges) so issue prev/next can own J/K. *(L = next, H = prev; suppressed while the example's trace sheet is open.)*

**Exit gate**: the page renders tags + copyable slug, J/K moves between issues, and H/L cycles examples without collision — the page covers everything the drawer did.

### Phase 3.6 — Page replaces the drawer

The page becomes the single issue surface; the drawer and flag are removed. Absorbs old Phase 7's docs + flag-removal.

- [x] **P3.6-1**: Issues-table rows navigate to `/issues/$issueId` as **real anchors** via `InfiniteTable`'s `renderRowLink` (per the web-frontend skill — cmd/middle-click works; not `onRowClick` + `useNavigate`); repoint web issue links (`annotation-card`, `useIssueUrl` notification helper, `incident-marker-popover`, `monitor-incidents-table`, and the "Copy issue link" palette command in `issue-lifecycle-actions`) to the path route. *(Also removed the now-obsolete `preserveSearchParams` prop from `IncidentMarkerPopover` — search-merge was only meaningful for the same-route drawer.)*
- [x] **P3.6-2**: Backwards-compat redirect in the issues list route `beforeLoad`: `?issueId=<id>` → `/issues/<id>` (preserves `?example=`). Uses an identity-passthrough `validateSearch` so the list's other URL params (`useParamState`) are untouched.
- [x] **P3.6-3**: Repoint issue URLs in the email (`@domain/email`) and Slack (`@domain/integrations`) incident-opened/closed/event templates (+ their preview URLs) to the path route.
- [x] **P3.6-4**: Remove the `IssueDetailDrawer` **chrome** + the list's use of it (drawer render, `?issueId=` param state, list J/K cycling). **`IssueDetailBody` and its `variant` prop are kept** — the session-detail panel's issue slot still renders it in drawer mode (the plan's "collapse the variant prop" was wrong).
- [x] **P3.6-5**: Retire the `issue-page` flag (registry entry + the page's route guard; the drawer's "open full page" button was deleted with the chrome). The page renders unconditionally.
- [x] **P3.6-6** *(was P7-2)*: Docs sync — `dev-docs/issues.md` Product Surface ("Issue page behavior": page route + redirect, triage fields, prev/next, the shipped report sections) and `docs/issues/overview.mdx` (drawer → page prose; left a TODO flagging the stale `issue-detail.png` screenshot). `docs/issues/management.md` had no drawer references.

**Exit gate**: the drawer is gone; every issue link (web + email + Slack) opens the page; legacy `?issueId=` redirects; the flag is removed; docs match the shipped surface.

### Phase 4 — Related issues + benchmark

Related issues redesigned before build (no v1 shipped): one merged list combining **semantic similarity** (centroid cosine, pgvector) and **co-occurrence** (shared sessions, NPMI), ranked by noisy-OR relatedness. Displayed lift is dropped for the same instability reason Patterns dropped it (see Data model #3).

- [x] **P4-1**: `IssueRepository.findSimilarByCentroid` (pgvector exact cosine scan, project-scoped, resolved/ignored included, empty when no embedding) + PGlite test.
- [x] **P4-2**: `coOccurrenceByIssue` ClickHouse method (session co-occurrence counts + probability universe, self-exclusion, 30d window) + chdb tests.
- [x] **P4-3**: Pure related-issues scorer in `@domain/issues` (semScore band rescale, NPMI with shared-session floor, noisy-OR merge, min-relatedness gate, top N) + unit tests; named constants (`ISSUE_RELATED_*`). *(As built: the scorer is fronted by `getRelatedIssuesUseCase` in `@domain/issues`, which runs the two reads in parallel and hydrates rows — the web fn stays thin.)*
- [x] **P4-4**: `getRelatedIssues` web function (parallel reads → scorer → Postgres hydration) + hook + Related-issues section (merged list, lifecycle badges, reason chips, empty state), linking to other issue pages.
- [ ] **P4-5**: `issueBenchmark` method (occurrence + user-reach percentile) + tests; benchmark chips (rail + section). *(Unchanged from the original design; not part of the related-issues build.)*

**Exit gate**: the page shows one ranked list of related issues — semantically similar and/or co-occurring — with reason chips, plus (separately) a project benchmark rank.

### Phase 5 — Where it happens (session-interaction position)

- [ ] **P5-1**: `failurePositionBySession` method (window ranking of trace within session, overflow bucket, single-interaction handling, median) + tests.
- [ ] **P5-2**: `getIssueFailurePositions` web function + hook.
- [ ] **P5-3**: "Where it happens" bar chart with median callout and single-interaction note.

**Exit gate**: the page shows on which interaction of the conversation the issue usually occurs.

### Phase 6 — Zoomable trend

- [ ] **P6-1**: Extend `IssueTrendBar` (or a page variant) for a wide canvas with zoom/pan and a page-local range selector; variable bucket size via `histogramByIssues`.
- [ ] **P6-2**: Optional source-split stacking.

**Exit gate**: the trend histogram is wide and zoomable on the page.

### Phase 7 — *(removed)*

Dropped. The drawer is **replaced**, not graduated — see **Phase 3.6**, which removes the drawer, retires the flag (was P7-3), and syncs the docs (was P7-2). There is no hybrid drawer+page.
