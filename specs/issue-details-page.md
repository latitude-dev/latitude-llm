# Issue Details Page

> **Documentation**: `dev-docs/issues.md`, `dev-docs/reliability.md`, `dev-docs/scores.md`, `dev-docs/spans.md`, `dev-docs/monitors.md`

> **Build status (Phases 1–3 shipped on branch `issue-details-page-redesign`).** This spec is the *intended* design; the **as-built state and the next steps live in the execution/handoff doc** (`~/.claude/plans/system-instruction-the-user-has-recursive-crown.md`) — read that first to continue. Key deviations from the design below, decided during the build:
> - **Layout**: no right rail. The page is a fixed `Layout.Header` (back + title + description + lifecycle actions) + a compact non-scrolling **summary band** (triage + status + first/last seen + occurrences + sessions + users + cost; the *affected-traces* tile was dropped; *users* hidden at 0) + a single scroll area ordered **Patterns → Trend → Evaluations → Examples → Traces**.
> - **Patterns**: four horizontally-scrollable cards (not tabs). Dimensions are `model | provider | tool (span tool_name) | tag` (not `operation`); baseline = all project spans, lifetime; per-span counting; lift gated/floored, shows `<1%`/"not seen elsewhere" never `0%`.
> - **Examples**: published annotation occurrences with a `messageIndex` anchor + trace (cap 30, no pagination); reuses the search region-frame highlight + substring highlight; feedback rendered as the underlying annotation (author/flagger + comment); Expand/See-trace open the trace drawer. Eval/custom occurrences excluded.
> - **Trend** still reuses the drawer's fixed 14-day/12h chart (zoomable trend is Phase 6).
> - **Page prev/next-issue navigation is not built** (deferred to Phase 7).

## Purpose

Today an issue is inspected through a right-side **drawer** (`IssueDetailDrawer` / `IssueDetailBody`) that shows name/description, a summary row, a 14-day trend histogram, linked evaluations, and a paginated mini-traces table. It answers *"what is this cluster?"* but not *"how much does it matter, who does it hit, what is special about it, and where exactly does it happen?"*.

This spec defines a **dedicated full-page Issue view** built from scratch as a first-class route. The page is an **issue report**: it turns the issue + its occurrences (scores) + the underlying telemetry (spans/traces) into impact, pattern, relational, and example analysis — using **only data we already store** (no new LLM calls, no prompt changes).

The drawer is intentionally **not** the design baseline. We build the page first, then decide which elements graduate back into the simpler drawer view as a curated subset (hybrid model). The drawer keeps its role: fast in-list triage with prev/next cycling.

## Goals

- A dedicated, bookmarkable, shareable route for a single issue.
- Make **impact** a headline fact, not a footnote: affected users, affected sessions, affected traces, and cost — alongside occurrence count.
- Surface **what is unusual** about an issue's occurrences vs. the project baseline (model / provider / tool / tags), ranked by over-representation (lift).
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
- **Baseline**: comparable telemetry that is **not** an occurrence of this issue — used as the denominator for lift. Default baseline = all project traces in the same time window (see Architecture for the exact definition).
- **Lift**: `issuePercent / baselinePercent` for a dimension value. Lift > 1 means the value is over-represented among occurrences.

## Conceptual model

The page is organized as a top-to-bottom **report** with a persistent metadata/triage rail. The report is composed of independent analysis blocks, each backed by one read query, so blocks can ship and degrade independently:

1. **Identity** — name, description, lifecycle status, source, slug, tags.
2. **Impact** — occurrences, affected traces (count + %), affected sessions, affected users, cost, and a derived severity hint.
3. **Trend** — wide, zoomable occurrence histogram with existing escalation/incident overlays.
4. **Patterns** — dimension distributions (model, provider, tool/operation, tags) vs. baseline, ranked by lift, significance-gated.
5. **Where it happens** — distribution of the session-interaction position at which the issue occurs.
6. **Related** — co-occurring issues (shared traces/sessions, with lift) and a project benchmark rank.
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

2. **`aggregateDimensionsByIssue(issueId, dimension, range?) → DimensionComparison`** and a baseline counterpart folded into one response.

   ```typescript
   type IssueDimension = "model" | "provider" | "operation" | "tag";
   type DimensionValue = { value: string; count: number; percent: number };
   type DimensionComparison = {
     dimension: IssueDimension;
     sampleSize: number;          // occurrence sample backing the issue distribution
     issue: DimensionValue[];     // sorted desc by percent
     baseline: DimensionValue[];
     outliers: Array<{ value: string; issuePercent: number; baselinePercent: number; lift: number }>;
   };
   ```

   - `model` / `provider` / `operation` / `tag` read from `spans` of affected traces (and `traces` aggregations where cheaper: `models`, `providers`, `tags`).
   - **Baseline = all project spans/traces in `range` (occurrence and non-occurrence alike).** This is simpler and stable than a strict "non-occurrence" set and is an acceptable denominator at issue scale; documented as the chosen definition.
   - `outliers` ranked by `lift = issuePercent / baselinePercent`, filtered to a minimum lift and minimum issue count so a 3-occurrence issue cannot report "100% modelX".
   - Significance: gate on `sampleSize`; below the threshold the method returns the distributions but an empty `outliers` array and the UI shows "not enough data to compare".

3. **`coOccurringIssues(issueId, range?) → CoOccurringIssue[]`**

   ```typescript
   type CoOccurringIssue = {
     issueId: string;
     sharedTraces: number;        // traces where both issues have an occurrence
     sharedSessions: number;      // sessions where both have an occurrence
     coOccurrencePercent: number; // sharedSessions / this-issue affectedSessions
     lift: number;                // P(other | this session) / P(other across project sessions)
   };
   ```

   - Implemented by selecting the issue's affected `trace_id`/`session_id` set, then `GROUP BY issue_id` over scores on those traces/sessions, excluding `issueId` itself.
   - Returns top N by lift, with a minimum shared-count floor. Issue name/lifecycle is hydrated from Postgres by the caller (`IN (...)`).

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

- `getIssueImpact`, `getIssueDimensions(dimension)`, `getCoOccurringIssues`, `getIssueFailurePositions`, `getIssueBenchmark`, plus `updateIssueTriage`.
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

5. **Patterns (vs baseline).** A tabbed card — **Model | Provider | Tool | Tags** — backed by `getIssueDimensions`. Each tab lists the top values as horizontal bars showing the issue percent, with a **lift badge** (`×1.5 vs 40% baseline`) and an **outlier flag** on statistically over-represented values. Sorted so the most anomalous values surface first. Below the significance threshold the card shows "not enough occurrences to compare against the project baseline yet".

6. **Where it happens.** A compact bar chart of the **session-interaction position** distribution (`getIssueFailurePositions`): x-axis = interaction index within the conversation (`1, 2, 3, … , 10+`), y-axis = share of occurrences, with a callout for the **median interaction** (e.g. *"usually on interaction 3 of the conversation"*) and a separate note for the single-interaction share. This is the headline "where" insight; it directly tells users whether failures are an opening-turn problem or a long-conversation-degradation problem.

7. **Related issues.** A list from `getCoOccurringIssues`: each row shows the related issue name (hydrated from Postgres), its lifecycle badge, the **shared-session percent**, and a **lift** chip (*"appears in 64% of this issue's sessions — ×8 vs baseline"*). Rows link to that issue's page. Below the list, the **benchmark** summary may also appear here as well as in the rail (*"Top 3% by user reach, top 8% by volume among 214 issues"*). Empty state when no meaningful co-occurrence exists.

8. **Examples.** An inline **occurrence carousel** built on the reusable `Conversation` component (`packages/ui/src/components/genai-conversation/conversation.tsx`) and the annotation-navigation system (`use-annotation-navigation.ts`):
   - Prev/next (and J/K keys) cycle through occurrences (scores) of the issue.
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

### Drawer relationship (after the page ships)

Once the page exists, the drawer is re-derived as a **curated subset** for in-list triage: identity + status, impact strip, trend, triage controls, and an "Open full page ↗" link. Heavy analysis (patterns, where-it-happens, related, examples) lives on the page. The exact subset is decided after the page is built and reviewed (per the product decision), so the drawer migration is the final phase, not the first.

## Feature flag

Gate the new route and any new nav entry behind an org feature flag (e.g. `issue-page`), mirroring the `monitors` rollout pattern (`dev-docs/monitors.md`). The flag gates: the `$issueId` route, the "open full page" affordance from the drawer/table, and the new triage columns' UI. Backend triage columns and analytics methods can exist unflagged (additive, inert without UI).

## Test strategy

Backend only (no frontend tests), per repo convention:

- Use-case tests for `updateIssueTriageUseCase` (assignee org-membership validation, priority set/clear, idempotency).
- Repository tests (chdb testkit) for each new analytics method: `aggregateImpactByIssue` (distinct-trace cost dedupe, affected-users), `aggregateDimensionsByIssue` (lift math + significance gate), `coOccurringIssues` (shared sets + self-exclusion + lift), `failurePositionBySession` (window ranking, single-interaction handling, overflow bucket), `issueBenchmark` (percentile ranking).
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

### Phase 3 — Examples carousel

- [x] **P3-1**: Surface the focused occurrence's score anchor (`messageIndex`/`partIndex`/offsets) to the web layer for an issue's occurrences.
- [x] **P3-2**: `IssueExamples` component reusing `Conversation` + `use-annotation-navigation` to scroll/highlight the exact part, with `messageTrailingSlot` feedback card and J/K cycling.
- [x] **P3-3**: Trace-level/span-level fallback when anchors are absent; `?example=<scoreId>` shareable URL.

**Exit gate**: users can cycle through concrete occurrences with the failing message/part highlighted and the originating feedback shown inline.

### Phase 4 — Related issues + benchmark

- [ ] **P4-1**: `coOccurringIssues` ClickHouse method (shared traces/sessions, lift, self-exclusion, floor) + tests; Postgres hydration of related issue rows.
- [ ] **P4-2**: `issueBenchmark` method (occurrence + user-reach percentile) + tests.
- [ ] **P4-3**: Related-issues list + benchmark chips (rail + section), linking to other issue pages.

**Exit gate**: the page shows co-occurring issues with lift and a project benchmark rank.

### Phase 5 — Where it happens (session-interaction position)

- [ ] **P5-1**: `failurePositionBySession` method (window ranking of trace within session, overflow bucket, single-interaction handling, median) + tests.
- [ ] **P5-2**: `getIssueFailurePositions` web function + hook.
- [ ] **P5-3**: "Where it happens" bar chart with median callout and single-interaction note.

**Exit gate**: the page shows on which interaction of the conversation the issue usually occurs.

### Phase 6 — Zoomable trend

- [ ] **P6-1**: Extend `IssueTrendBar` (or a page variant) for a wide canvas with zoom/pan and a page-local range selector; variable bucket size via `histogramByIssues`.
- [ ] **P6-2**: Optional source-split stacking.

**Exit gate**: the trend histogram is wide and zoomable on the page.

### Phase 7 — Drawer graduation + docs

- [ ] **P7-1**: Re-derive the drawer as a curated subset (identity, impact strip, trend, triage, "open full page"), moving heavy analysis to the page only.
- [ ] **P7-2**: Promote durable behavior into `dev-docs/issues.md` (Product Surface section: page vs drawer, triage fields, the new analytics) and update `docs/issues/` product docs.
- [ ] **P7-3**: Remove the feature flag once stable.

**Exit gate**: hybrid drawer+page shipped; durable knowledge promoted to `dev-docs/`; flag retired.
