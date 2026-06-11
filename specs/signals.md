# Signals

> **Documentation**: eventual durable homes `dev-docs/signals.md` and an updated `dev-docs/monitors.md`; related current docs: `dev-docs/issues.md`, `dev-docs/scores.md`, `dev-docs/monitors.md`, `dev-docs/notifications.md`, `dev-docs/conversation-intelligence.md`.
>
> **Supersedes (conceptually)**: `specs/monitors.md` and `specs/alerts.md`. Those specs remain accurate descriptions of what is *currently built*; this spec defines the model that replaces their framing. Do not retire them until the migration phases are underway.
>
> **Origin**: LAT-664 ("Consolidate monitor situation") — this spec consolidates the two proposals discussed there and the final comment posted on the issue.

## Purpose

Latitude currently has two parallel tracking systems with overlapping names and separate UIs: **Issues** (auto-created buckets of failed scores, invisibly monitored) and **Monitors** (user-configured alerts over **Saved Searches**). This spec restructures both around four concepts in a pipeline:

```
                 definitions create        monitors aggregate         alerts fire on        records the
                 occurrence rows           the occurrence stream      conditions            firing
  Trace ───────▶ SIGNAL ─────────────────▶ MONITOR ─────────────────▶ ALERT ──────────────▶ INCIDENT ──▶ notifications
                 (write-time matching)     (or saved searches /
                                            raw telemetry streams)
```

The one-line mental model for users and docs:

> Latitude groups your traces into **Signals** — buckets you define deliberately, from the Signals page or while annotating. Any signal — or saved search, or your raw traffic — can be watched with **Monitors**; monitors have **Alerts**, and a fired alert opens an **Incident**, which is what notifies you.

## Decisions

Settled during the design discussion (LAT-664 + spec review):

1. **Signal membership is materialized at write time** (see next section — forced, not a preference).
2. **No automatic issue discovery.** The clustering/discovery pipeline (similarity search + rerank + locked serialization auto-creating issues from scores) is removed. Signals are always created proactively by users — from the Signals page or from the annotation flow. Annotations are matched to *existing* signals via hybrid search suggestions; they never spawn signals on their own.
3. **No routing centroid.** With discovery gone, the per-signal decayed centroid machinery is removed. Suggesting existing signals while annotating uses hybrid search over signal names/descriptions (lexical tsvector + one derived embedding).
4. **No pure filter-type signals.** Plain filter slices are correct and cheap at query time, so they stay **saved searches + monitors**. Signals exist for matchers that *require* write-time evaluation (semantic, evaluation, rule, script). Filters appear on signals only as the **scope** pre-gate.
5. **No class monitors.** With user-created signals only, "a new signal was discovered" alerts are meaningless; today's `source_id = NULL` system monitors dissolve into each signal's default monitor. A monitor's `target_id` is required for signal/saved-search targets.
6. **Signals per project are capped** to a fixed number per plan (this also bounds occurrence write amplification and ingest matching cost).
7. **Scores are kept with a narrowed role** — they stop being the membership mechanism and remain the verdict ledger: evaluation pass/fail/error analytics, human-feedback ground truth for alignment, and the public `/scores` API (rationale under the occurrences table).

## Why signal membership is materialized at write time

This is the load-bearing decision of the spec. It is forced, not a preference.

**1. Semantic search answers a different question than filters do.** A filter is a per-row yes/no ("is this trace from the last 7 days?") — each row passes on its own merits, so filters stack for free. Semantic search with a vector index answers "the ~1,000 items *most similar in the entire corpus*". Combine them and the filter can only discard from those 1,000: searching "user frustration" + filtering "last 7 days" returns *whichever of the corpus-wide top-1,000 happen to be recent* — maybe 30 results, maybe 0 — while thousands of genuinely frustrated traces from this week sit at #5,000 in the global ranking and are never returned. Doing it correctly means scoring every trace in the window: a full scan, which is why semantic trace search already times out on large projects.

**2. Tracking over time multiplies that cost forever.** Example: a semantic search "user frustration" with an alert when the last-5-minutes match count exceeds 1σ above its historical average. The 5-minute count is cheap; but μ and σ require the match count of *every historical bucket* — the semantic verdict for every trace in the corpus — recomputed on every evaluation, 288 times a day, even though each trace's verdict is frozen the moment it arrives. The only fix is "score each trace once, on arrival, and remember the result", which **is** write-time materialization; every caching scheme converges to it. Approximations don't help: a σ computed from undercounted buckets makes alerts fire on index noise.

Consequences carried through the whole spec:

- Query-time semantic search remains an **exploration** tool: a ranked best-effort sample on the Traces page. No counts, no histograms, no alerts over a semantic query.
- Anything that needs **set** semantics — charts, baselines, alerts, "every matching trace" — must be a signal, whose membership is decided per trace at ingest and appended to an immutable occurrence stream.
- A materialized history is immutable under definition edits: editing a signal changes membership *going forward* only (the chart gets a definition-changed marker). The "editing a virtual signal rewrites its history" policy problem disappears.
- Occurrences become the universal counting unit (one occurrence = one matched trace), resolving today's inconsistency where issues count scores and saved searches count traces.

## Concepts

### Signal

**A signal is a tracked bucket of traces: one definition, evaluated per trace at ingest, materialized forever.**

- A signal's definition has two orthogonal parts:
  - a **scope**: an optional `FilterSet` restricting which traces are considered at all ("traces above the p90 latency", "traces tagged `foo`"). Row-local and cheap, evaluated first; empty scope = all traces.
  - a **matcher** (`SignalType`): the membership test run on in-scope traces — a semantic anchor set, an aligned evaluation, a structured code rule, or a sandboxed JS script.

  Any matcher composes with any scope: an evaluation that only runs on slow traces, a semantic anchor only checked against traces tagged `foo`. The scope doubles as a cost pre-gate: out-of-scope traces never reach the matchers. Pure filter slices are deliberately *not* signals (decision 4) — that job belongs to saved searches + monitors.
- Signals carry **triage metadata** — priority and assignees — but **no lifecycle**. You create or delete signals; resolve/ignore semantics live on monitors.
- Signals are **always created proactively** (decision 2): from the Signals page builder, from a saved search (pre-filling the scope and, for semantic searches, the anchor), or from the annotation flow ("explain the problem, point at 3–4 example traces, get a signal with a generated aligned evaluation"). Today's issues migrate into signals; no pipeline creates them automatically anymore.
- **Moment labels** (conversation intelligence) are provisioned as default per-project signals with `type = 'semantic'` — their existing anchor sets (`MOMENT_LABEL_ANCHORS`) carry over verbatim, since the semantic config adopts the same shape (multiple positive anchors + contrast anchors + threshold/margin).
- Every signal gets a **default monitor** provisioned at creation — the same monitoring issues get today: an occurrences monitor carrying a high-severity `metric.escalating` alert in `expected` mode (the seasonal heuristic, so a firing is a high-signal event rather than noise) plus the `signal.regressed` event alert.

### Saved search

**A virtual view over traces, kept as a concept — and the only home for pure filter tracking.** The exploration bookmark on the Traces page: a stored `query + filterSet` evaluated at read time. Saved searches are directly monitorable (filters are cheap and correct at query time — `SavedSearchMatchReader` machinery reused unchanged). When a user wants a *deeper* membership test (semantic, rule, evaluation, script), the path is **Create signal from this search**, which pre-fills the scope from the filters and the semantic anchor from a semantic prompt.

### Monitor

**A monitor watches one target over time.** Monitors never own filter definitions; they own:

- a **target**: a signal, a saved search, or a raw stream — `traces`, `spans`, or `sessions` as a whole (e.g. "avg latency of all traffic"). `target_id` is required for signal/saved-search targets; raw streams have none.
- a **metric**: event/occurrence count (default), or an aggregate over the matched traces — `avg` / `sum` / `p95` of `duration`, `ttft`, `cost`, `tokens`, or `errors`.
- **mute** (`muted_at`): notifications off; evaluation and incident recording continue.
- the **lifecycle**: *active* (default), *escalating* (derived: an open sustained incident exists), *resolved* (manual `resolved_at` anchor, or derived from a long quiet period). The first datapoint after `resolved_at` fires a `signal.regressed` event alert and clears the anchor.

"Resolve a signal" resolves its default monitor; "ignore" mutes it. The signal page keeps one-click triage; it just writes to the monitor underneath.

### Alert

**A condition on a monitor.** Two flavors (Sentry-shaped, as in the original proposal):

- **Event alerts** fire on discrete events in the target stream: a new matching trace, a regression.
- **Metric alerts** fire on the monitor's aggregated value: threshold (absolute / multiplier / expected), and sustained escalation.

Today "is this escalating?" is answered by two unrelated implementations that differ only in their input: the issue path runs the seasonal detector (`evaluateSeasonalEscalation`) over per-issue **score counts**, while the saved-search path runs a bucketed sustained-gate over query-time **trace-match counts** — and its `expected` threshold mode already calls the same seasonal detector internally. The logic shape is identical in both: *per-bucket count series → per-bucket threshold → open/close state machine*. Since every signal target now produces the same input (a bucket-count series over `signal_occurrences`), the two merge into **one** `metric.escalating` evaluator: read the series, compute the per-bucket threshold by mode (`absolute` / `multiplier` / `expected`), run one state machine. The seasonal detector survives as the threshold function of `expected` mode, with `sensitivity` as its single knob — and issue escalation stops being special: it is the default monitor's `metric.escalating` alert running in that mode.

### Incident

**Unchanged.** Same `alert_incidents` lifecycle (point vs sustained), same backtracked `started_at`/`ended_at`, same notifications pipeline (`incident.event` / `incident.opened` / `incident.closed`). Incidents continue to snapshot the firing alert's `condition`, and additionally snapshot the monitor's **target definition** at open time so closed incidents stay self-describing after edits.

## Data model

### Shared enums (`@domain/shared`)

```ts
export const SIGNAL_ORIGINS = ["user", "annotation", "system"] as const
export type SignalOrigin = (typeof SIGNAL_ORIGINS)[number]
// 'user'       — built from the Signals page or from a saved search
// 'annotation' — created through the annotation flow
// 'system'     — provisioned by Latitude (moment labels)

export const SIGNAL_TYPES = ["semantic", "evaluation", "rule", "script"] as const
export type SignalType = (typeof SIGNAL_TYPES)[number]

export const MONITOR_TARGET_TYPES = ["signal", "savedSearch", "traces", "spans", "sessions"] as const
export type MonitorTargetType = (typeof MONITOR_TARGET_TYPES)[number]
// 'signal' / 'savedSearch' — a specific entity (target_id required)
// 'traces' / 'spans' / 'sessions' — the project's whole raw stream (target_id null)

export const ALERT_KINDS = [
  // event alerts (point)
  "signal.matched",    //  ← savedSearch.match  (a new event entered the target stream)
  "signal.regressed",  //  ← issue.regressed    (a datapoint after monitor.resolved_at)
  // metric alerts
  "metric.threshold",  //  ← savedSearch.threshold (point; absolute | multiplier | expected)
  "metric.escalating", //  ← issue.escalating + savedSearch.escalating (sustained; unified)
] as const
export type AlertKind = (typeof ALERT_KINDS)[number]
// issue.new is retired with the discovery pipeline (decision 2/5): nothing is "discovered" anymore.

// Severities, AlertCountThreshold (absolute | multiplier | expected) and
// AlertBaseline carry over verbatim from the current model.

export type MonitorMetric =
  | { kind: "count" }                                  // events/occurrences per bucket (the default)
  | { kind: "avg" | "sum" | "p95";                     // aggregate over the matched traces' metrics
      field: "duration" | "ttft" | "cost" | "tokens" | "errors" }
```

### Signal definition config (discriminated by `signals.type`)

```ts
// The scope is a top-level column (signals.scope), not part of the matcher config:
// any matcher composes with any scope.
export type SignalConfig =
  | { type: "semantic";   semantic: SemanticAnchors }
  | { type: "evaluation" }      // definition = the evaluations rows linked via evaluations.signal_id
  | { type: "rule";       rule: SignalRule }
  | { type: "script";     script: string }   // user-authored JS, shared sandbox runtime

// Same shape as conversation intelligence's MOMENT_LABEL_ANCHORS — proven in production
// for moment labels, adopted wholesale (multi-anchor + contrast + threshold/margin):
export type SemanticAnchors = {
  anchors: string[]            // positive anchor phrases (1..n); best match wins
  contrastAnchors?: string[]   // negative anchors: a trace matches only if its best positive
                               //   similarity ALSO beats its best contrast similarity by `margin`
  threshold: number            // cosine-similarity cutoff: max(chunk · anchor) ≥ threshold ⇒ match.
                               //   This is the membership knob (was `minSimilarity`)
  margin?: number              // required positive-vs-contrast separation (default per constants)
  roles?: ("user" | "assistant")[]  // optionally restrict which conversation turns are compared
}

// Structured, user-friendly matcher over parts of the trace conversation.
// Compiled to a sandboxed script under the hood — rule, script, and evaluation
// matchers all execute in the same sandbox runtime; rule is just a generated script.
export type SignalRule = {
  combinator: "and" | "or"
  conditions: {
    part: "input" | "output" | "system" | "toolCall" | "any"   // which part of the convo to test
    check:
      | { kind: "contains";    value: string; caseSensitive?: boolean }
      | { kind: "regex";       pattern: string; flags?: string }
      | { kind: "levenshtein"; value: string; maxDistance: number }
      | { kind: "jsonSchema";  schema: Record<string, unknown> }   // tool args / structured outputs
    negate?: boolean
  }[]
}
```

Moment labels are `type = 'semantic'` signals provisioned with `origin = 'system'` and their existing anchor sets verbatim; there is no dedicated label type.

- `scope` reuses the shared `FilterSet`, including `gtePercentile` — so "traces above the p90 latency" is expressible today. Percentile operators are resolved against a periodically refreshed project estimate at ingest (slightly approximate at write time, exact during backfill).
- For `evaluation` signals the scope plays the role of today's `EvaluationTrigger.filter` — see "One matching pipeline" below; `sampling`/`turn`/`debounce` stay evaluation-level settings.
- Anchor and threshold edits change membership **going forward only** (definition-changed marker on charts), never retroactively.
- Semantic threshold UX: the MVP ships a fixed default threshold with a sensitivity control. A post-MVP refinement is an **iterative calibration loop** at creation time — show sample matches at the current threshold, ask "do these look right?", tighten/loosen, repeat until accepted.

### Postgres: `signals` (evolves `issues`)

```
signals
  id                  varchar(24) PK (CUID)
  organization_id     varchar(24)            -- RLS, org-isolation policy
  project_id          varchar(24)
  slug                varchar(128)           -- unique per project among non-deleted
  name                varchar(128)
  description         text
  origin              varchar(32)            -- SignalOrigin
  type                varchar(32)            -- SignalType (the matcher)
  config              jsonb                  -- SignalConfig (matcher parameters)
  scope               jsonb                  -- FilterSet pre-gate; {} = all traces; composes with any type
  priority            varchar(16) null       -- IssuePriority, carried over (low/medium/high/urgent)
  assignees           varchar(24)[]          -- multi-assignee (annotation_queues precedent)
  search_document     tsvector GENERATED     -- name (A) + description (B); GIN
  search_embedding    vector(2048) null      -- derived from name + description on save; used with
                                             --   search_document for hybrid existing-signal
                                             --   suggestions while annotating (decision 3)
  deleted_at          timestamptz null
  created_at, updated_at

  unique (project_id, slug) WHERE deleted_at IS NULL
  btree  (organization_id, project_id, created_at) WHERE deleted_at IS NULL
  -- no ANN index on search_embedding: project-scoped exact scan, as issues today
```

Removed vs `issues`: `uuid` (dormant), `centroid` + `centroid_embedding` (discovery is gone — decision 2/3), `escalated_at` / `resolved_at` / `ignored_at` (→ monitor), `assignee_id` (→ `assignees`), `source` (→ `origin`).

Semantic anchor embeddings are **not** a table column: anchors are embedded once on save and Redis-cached (org-prefixed key), exactly as moment-label anchors are today. Matching compares in-process at ingest; nothing ever searches anchors via SQL.

### Postgres: `monitors` (generalized, same table)

```
monitors
  id, organization_id, project_id, slug, name, description, system   -- unchanged
  target_type     varchar(32)            -- 'signal' | 'savedSearch' | 'traces' | 'spans' | 'sessions'
  target_id       varchar(24) null       -- required for 'signal'/'savedSearch'; NULL for raw streams
                                         --   ('traces'/'spans'/'sessions' = the whole project stream)
  metric          jsonb                  -- MonitorMetric: { kind: 'count' } (default) or
                                         --   { kind: 'avg'|'sum'|'p95', field: duration|ttft|cost|tokens|errors }
  is_default      boolean default false  -- the auto-provisioned per-signal monitor; triage writes here
  resolved_at     timestamptz null       -- manual resolve anchor; cleared by the next datapoint
  muted_at        timestamptz null       -- unchanged semantics
  deleted_at, created_at, updated_at

  partial unique (target_type, target_id) WHERE is_default AND deleted_at IS NULL
  btree (organization_id, target_type, target_id) WHERE deleted_at IS NULL   -- firing scan
```

### Postgres: `monitor_alerts` (same table; source columns dropped)

```
monitor_alerts
  id, organization_id, monitor_id
  kind            varchar(64)            -- AlertKind
  condition       jsonb null             -- AlertCountThreshold / escalating window / sensitivity; null for
                                         --   parameterless kinds (signal.matched, signal.regressed)
  severity        varchar(16)
  deleted_at      timestamptz null       -- soft-delete preserved: incidents must stay attributable
  created_at, updated_at
```

`source_type` / `source_id` are removed — the target lives on the monitor.

### Postgres: `alert_incidents` (near-unchanged)

- `source_type` / `source_id` → `target_type` / `target_id` (values per the new enums).
- `kind` values remapped per the migration table.
- New: `target_snapshot jsonb null` — the monitor's `(target, metric)` and, for saved-search targets, the resolved `query + filterSet` at open time. Same rationale as the existing `condition` snapshot.
- Everything else (`monitor_alert_id`, `condition`, `entry_signals`, `exit_eligible_since`, backtracking) carries over.

### Postgres: renames only

- `scores.issue_id` → `scores.signal_id`. All draft/immutability semantics in `dev-docs/scores.md` survive; the discovery-driven assignment paths are removed (assignment now comes from evaluation linkage or explicit annotation linking).
- `evaluations.issue_id` → `evaluations.signal_id`. Alignment stays "predicted vs actual signal membership".
- `saved_searches`: **untouched**.

### ClickHouse: `signal_occurrences` (new; via `pnpm --filter @platform/db-clickhouse ch:create`)

```sql
signal_occurrences
  organization_id        LowCardinality(String)
  project_id             LowCardinality(String)
  signal_id              FixedString(24)
  trace_id               FixedString(32)
  span_id                FixedString(16)   DEFAULT ''      -- sentinel convention
  session_id             FixedString(128)  DEFAULT ''
  score_id               FixedString(24)   DEFAULT ''      -- set when a judgment (eval/annotation) backs it
  trace_started_at       DateTime64(9, 'UTC')              -- time axis = the trace's own start time
  duration_ns            UInt64                            -- denormalized trace metrics so metric monitors
  tokens_total           UInt64                            --   aggregate without joining traces
  cost_total_microcents  UInt64
  error_count            UInt32
  ingested_at            DateTime64(3, 'UTC')              -- ReplacingMergeTree version

ENGINE    ReplacingMergeTree(ingested_at)        -- Replicated* in clustered/
PARTITION BY toYYYYMM(trace_started_at)
ORDER BY  (organization_id, project_id, signal_id, trace_started_at, trace_id)
```

**Why a new table instead of reusing (or replacing) `scores`.** Scores and occurrences answer different questions and have incompatible shapes:

- A **score** is a canonical *judgment*: `value`, `passed`, `feedback`, draft lifecycle, mutable Postgres row with per-source uniqueness, plus the alignment machinery built on it. A semantic or rule match has none of that — no verdict, no feedback, nothing to draft or edit.
- An **occurrence** is an append-only *membership fact* at trace volume. Forcing matches into `scores` would pollute evaluation analytics with verdict-less rows and push trace-volume writes through the canonical mutable Postgres path.
- The two link where they meet: `score_id` is set on occurrences produced by judgment-bearing matchers (evaluations, linked annotations).

**Scores stay, with a narrowed role** (decision 7). They stop being the membership mechanism — `signal_occurrences` is the only membership ledger — and keep three jobs occurrences structurally cannot do:

1. **Verdicts that don't match.** Occurrences record only matches; evaluation quality analytics (pass rate, error rate) and every confusion matrix also need the *passed* and *errored* runs — the rows that produce no occurrence.
2. **Human feedback as alignment ground truth.** Annotations need a mutable, draft-able row (raw text, edits, message anchors, annotator) — and alignment is literally "human `passed` verdicts vs evaluation `passed` verdicts on the same traces", both sides being score rows. No scores ⇒ no confusion matrix ⇒ no alignment metric ⇒ no trustworthy evaluation matchers.
3. **The public `/scores` API** for custom, user-pushed results (an existing machine-facing contract).

Shorthand: occurrences are the **membership ledger** ("this trace is in this signal"); scores are the **verdict ledger** ("this judge said pass/fail and why"). Every signal needs the first to be monitored; evaluation-type signals need the second to stay trustworthy. `scores.signal_id` survives as the label connecting verdicts to the signal they are evidence for — not as membership. The ClickHouse score-analytics table correspondingly loses its issue-trend/occurrence-counting role to `signal_occurrences` and remains only for evaluation/custom source dashboards.

Design notes:

- **Dedup unit is `(signal, trace)`**: a trace counts once per signal no matter how it matched or how late. Using `trace_started_at` (a deterministic property of the trace) as the time axis means a late matcher (an evaluation finishing minutes later, an annotation days later) produces a row with the *same sort key*, so ReplacingMergeTree collapses duplicates and histograms stay consistent without `FINAL` (reads use the standard dedup-safe aggregate shapes).
- Metrics are **denormalized** so "avg cost of checkout-failure traces" is a single-table aggregate on the monitor-evaluation hot path.
- Append-only; the only mutation is the rare `DELETE` by `signal_id` when a signal is hard-deleted, mirroring the score-deletion policy.

## UI

### Navigation

One **Signals** nav item replaces both **Monitors** and **Issues** in the project sidebar. With discovery gone there is no auto-populated inbox to separate from user-built signals — it's one list. Issue URLs (`/projects/$slug/issues/...`) redirect into the corresponding signal pages.

```
Traces
Signals              ← replaces "Monitors" and "Issues" (single list; nothing auto-appears)
Datasets
Settings
```

### Signals list

One table; triage (priority, assignee) and configuration (type, monitors) are columns/filters on the same surface.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  Signals                                                              [ New signal ] │
│  ──────────────────────────────────────────────────────────────────────────────────  │
│  NAME                  TYPE        PRIORITY  TREND (14d)   MONITORS   LAST INCIDENT  │
│  Refund hallucination  evaluation  high      ▂▃▂▅▇▅▃▂      2          ● Ongoing · 2h │
│  Angry users           semantic    medium    ▁▁▂▂▁▂▁▁      1          Closed · 3d    │
│  PII in answers        rule        high      ▂▂▃▃▃▂▃▃      1          —              │
│  Refund requested 🔇   semantic    —         ▃▃▃▄▃▃▃▃      1 (muted)  —              │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Signal detail page — the center of gravity

Definition, monitor charts, alerts, incidents, and member traces in one context. Annotation-born signals additionally show their linked evaluation/alignment sections.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Signals / PII in answers                 [Resolve] [Ignore 🔇] [Edit] [⋯] │
│  rule · output matches /\b\d{16}\b/ OR output contains "SSN"                  │
│  scope: service = checkout                                                    │
│  Priority: High ▾    Assignees: @ana @marc ▾                                  │
│  ─────────────────────────────────────────────────────────────────────────── │
│  MONITORS                                                    [ Add monitor ] │
│  ┌─ Occurrences (default) ────────┐  ┌─ Avg cost ─────────────────────┐      │
│  │ ▂▃▂▅▇▅▃▂   ⚑ definition edited │  │ ▃▃▄▅▅▆▆                        │      │
│  │ 2 alerts · 1 firing            │  │ no alerts                      │      │
│  └────────────────────────────────┘  └────────────────────────────────┘      │
│                                                                              │
│  ALERTS                                                        [ Add alert ] │
│  • Occurrences > 2× 24h baseline        (metric)   High    fired 2h ago      │
│  • Occurrences escalating (expected)    (metric)   High    never fired       │
│  • New matching trace                   (event)    Low     fired 4m ago      │
│                                                                              │
│  INCIDENTS                                                                   │
│  ● Ongoing   Occurrences > 2× baseline       opened 2h ago                   │
│  ○ Closed    Occurrences escalating          3d ago · lasted 6h              │
│                                                                              │
│  TRACES                                                                      │
│  …trace table reading signal_occurrences, paginated…                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

`[Resolve]` writes `resolved_at` on the default monitor; `[Ignore 🔇]` mutes it. Neither touches the signal row — but the page presents them as signal actions.

### Creating a signal

One builder, three entry points, one rule: **never let users define membership blind** — the builder always shows a live preview (a bounded query-time evaluation of the definition over recent traces; for `semantic`, an exact scan over a recent window using the existing content embeddings).

```
  Traces page                 Signals list                Annotation flow
  "Create signal from         [ New signal ]              "Track this as a signal"
   this search"                     │                            │
        └───────────────┬───────────┘                            │
                        ▼                                        ▼
  ┌───────────────────────────────────────────┐   ┌──────────────────────────────────────┐
  │  New signal                               │   │  Track failure mode                  │
  │  Scope (optional filters):                │   │  What is going wrong?                │
  │  ┌─────────────────────────────────────┐  │   │  ┌────────────────────────────────┐  │
  │  │ service = checkout AND tag has foo  │  │   │  │ The agent promises refunds we  │  │
  │  └─────────────────────────────────────┘  │   │  │ don't offer…                   │  │
  │  Type:  ◉ Semantic    ○ Evaluation        │   │  └────────────────────────────────┘  │
  │         ○ Rule        ○ Script            │   │  Example traces (3–4):               │
  │  ┌─────────────────────────────────────┐  │   │  ☑ trace #a1f3   ☑ trace #b274      │
  │  │ "user expresses frustration"        │  │   │  ☑ trace #c9d1   ☐ + add            │
  │  │ + add anchor · + contrast anchor    │  │   │                                      │
  │  └─────────────────────────────────────┘  │   │                                      │
  │  ┌─────────────────────────────────────┐  │   │                                      │
  │  │ Preview: 312 matches, last 7 days   │  │   │                                      │
  │  │ …sample rows…                       │  │   │                                      │
  │  └─────────────────────────────────────┘  │   │  → creates the signal and generates  │
  │  Backfill last 14 days?  [✓]              │   │    its aligned evaluation             │
  │              [ Create ]                   │   │              [ Create ]              │
  └───────────────────────────────────────────┘   └──────────────────────────────────────┘
```

### Traces page

- Saved searches keep their selector + save button. Each saved-search row offers **Create monitor** (the filter-tracking path) and **Create signal from this search** (scope pre-filled; semantic prompts become semantic anchors).
- A semantic query shows a contract banner so the sample semantics are explicit: `Showing the most relevant results (ranked sample) — to track or count every match, create a signal.`

### Creating a monitor

```
┌───────────────────────────────────────────────┐
│  New monitor                                  │
│  Watch:   ◉ Signal        [PII in answers ▾]  │
│           ○ Saved search  [ … ▾]              │
│           ○ All traces / spans / sessions     │
│  Metric:  ◉ Occurrences   ○ Avg [cost ▾]      │
│  Alerts:  (optional, card stack as today)     │
│   • when value > [2]× [avg of last 7 days ▾]  │
│              [ Create ]                       │
└───────────────────────────────────────────────┘
```

## One matching pipeline

Today's write-time execution machinery is evaluation-oriented: `EvaluationTrigger` (filter / turn / debounce / sampling) decides when an evaluation runs against an incoming trace. This spec generalizes it into a single **signal matching pipeline** that owns "run every active signal's definition against incoming traces"; evaluations become one *runner* inside it rather than the pipeline itself:

- the **scope gate** is shared (one pass per trace over all active signals' scopes);
- the **sandbox runner** executes rule (compiled), script (user-authored), and evaluation (LLM-judge) matchers in the shared sandboxed JS runtime;
- the **semantic runner** compares trace content-chunk embeddings (already produced at ingest for trace search and semantic moments) against the Redis-cached anchor embeddings;
- evaluation-specific options (`sampling`, `turn`, `debounce`) remain runner-level settings, not pipeline concepts.

## Main flows (callstacks)

Names follow existing conventions; `@domain/signals` is the new domain package (evolved from `@domain/issues`). Existing machinery reused unchanged is marked `[reuse]`.

### A. Trace ingest → matching → occurrences

```
span ingestion → ClickHouse spans insert → TracesIngested (outbox)            [reuse]
└─ domain-events dispatcher (apps/workers/src/workers/domain-events.ts)       [reuse]
   └─ signals:match (queue task, batched per project)
      └─ matchTracesToSignalsUseCase (@domain/signals)
         ├─ SignalRepository.listActiveDefinitions(projectId)        -- Redis-cached, org-prefixed key
         ├─ scope pre-gate: evaluate each signal's scope FilterSet against the trace
         │    (row-local, in-process); out-of-scope traces never reach the matcher
         ├─ type='rule'   → compiled script in the sandbox runner
         ├─ type='script' → user script in the sandbox runner
         └─ matches → SignalOccurrenceRepository.append (CH insert; idempotent via sort key)
      └─ publishes monitors:evaluate (leading-edge throttle, 5 min)            [reuse shape]

semantic matchers (separate hop — joins the content embeddings, which the ingest
  pipeline already produces for trace search and semantic moments):            [reuse]
trace_search_embeddings chunks written
└─ signals:semanticMatch (queue task per trace)
   └─ matchTraceToSemanticSignalsUseCase
      ├─ load project anchor sets (Redis-cached embeddings, moment-label pattern;
      │    includes system moment-label signals)
      ├─ scope pre-gate: skip signals whose scope the trace fails
      ├─ per signal: max(chunk · positiveAnchor) ≥ threshold
      │    AND best-positive − best-contrast ≥ margin → match
      └─ SignalOccurrenceRepository.append

evaluation matchers (third hop — the evaluation runner inside the pipeline; the
  signal's scope plays the role of EvaluationTrigger.filter):                  [reuse]
evaluation trigger fires → evaluation runs → failed non-errored score written
  with scores.signal_id
└─ after-commit: syncScoreAnalyticsUseCase                                     [reuse]
   └─ + SignalOccurrenceRepository.append (score-backed: score_id set)
```

### B. Deliberate signal creation from annotations

```
UI: annotate → "Track this as a signal" → explanation + 3–4 example traces
└─ createSignalFromAnnotationsUseCase (@domain/signals)
   ├─ persist annotation scores for the examples (canonical scores path)       [reuse]
   ├─ create signal { origin: 'annotation', type: 'evaluation', config: {} }
   ├─ derive search_embedding from name + description
   ├─ append score-backed occurrences for the example traces
   ├─ provisionDefaultMonitorUseCase (occurrences monitor + high-severity
   │    metric.escalating 'expected' alert + signal.regressed alert — same
   │    monitoring issues get today)
   └─ start Temporal optimize-evaluation, workflow id evaluations:generate:${signalId}  [reuse]
      └─ generates + aligns the evaluation; persists with evaluations.signal_id
frontend polls getSignalAlignmentState (Temporal workflow.describe())           [reuse shape]
```

### C. Annotating against existing signals (replaces issue discovery)

There is **no automatic discovery pipeline** (decision 2). When a user annotates, the UI *suggests* existing signals; the user links explicitly or creates a new signal.

```
UI: user writes annotation feedback
└─ suggestSignalsUseCase (@domain/signals)
   └─ hybrid search over project signals: search_document (lexical)
        + search_embedding (cosine over the embedded feedback) — exact scan, no rerank
user action:
  ├─ link to a suggested signal → published annotation score carries scores.signal_id
  │    └─ SignalOccurrenceRepository.append (score-backed)
  ├─ "Track this as a signal" → flow B
  └─ neither → the score stays unowned; nothing is created automatically
evaluation failures already carry signal_id at write time                       [reuse]
```

### D. Monitor evaluation → alert → incident → notification

```
triggers: monitors:evaluate (leading-edge throttle from occurrence/trace activity)
        + 5-min sweep cron (closes + low-traffic opens)                         [reuse shape]
└─ evaluateMonitorUseCase (@domain/monitors)
   ├─ resolve target reader:
   │    signal        → SignalOccurrenceReader (CH signal_occurrences)          [new]
   │    savedSearch   → SavedSearchMatchReader (CH traces, query+filterSet)     [reuse]
   │    traces/spans/sessions → telemetry readers                               [reuse]
   ├─ compute metric series (count / avg / sum / p95 per bucket)
   └─ per active alert, run the kind's state machine:
        signal.matched     → point incident per throttle window with ≥1 event   [reuse shape]
        signal.regressed   → datapoint after monitor.resolved_at → point incident,
                             clear resolved_at
        metric.threshold   → absolute (one-time) / multiplier (rising edge,
                             silent close) / expected                           [reuse]
        metric.escalating  → ONE bucketed sustained-gate evaluator over any
                             target series (replaces both the issue seasonal
                             path and the saved-search machine; 'expected' mode
                             wraps evaluateSeasonalEscalation)                  [merge]
└─ alert_incidents insert/close (condition + target_snapshot snapshots)
   → IncidentCreated / IncidentClosed (outbox)                                  [reuse]
   → notifications:request-incident-notifications (mute gate: monitor.mutedAt)  [reuse]
   → create-notification → in-app / email / Slack fan-out                       [reuse]
```

### E. Triage from the signal page

```
[Resolve] → resolveSignalUseCase
   ├─ default monitor: resolved_at = now
   └─ close open sustained incidents for its alerts (silent, as manual resolve today)
[Ignore]  → muteSignalUseCase → default monitor: muted_at = now
              (occurrences keep recording; nothing notifies)
[Delete]  → deleteSignalUseCase → soft-delete signal; soft-delete its monitors;
              archive linked evaluations; enqueue CH occurrence cleanup
regression → flow D, signal.regressed branch
```

### F. Create signal from a saved search (with backfill)

```
UI: saved-search row / traces page → "Create signal from this search"
└─ opens the signal builder pre-filled:
   ├─ scope            ← the search's filterSet
   ├─ semantic prompt  → semantic matcher (anchors seeded from the prompt)
   └─ lexical phrases  → rule matcher (contains conditions)
└─ createSignalUseCase { origin: 'user' } + provisionDefaultMonitorUseCase
└─ enqueue signals:backfill { signalId, window: 14d }   (rule/scope-evaluable matchers)
   └─ backfillSignalOccurrencesUseCase: evaluate the definition over historical
      traces in batches → SignalOccurrenceRepository.append
saved_searches row remains (still a bookmark; plain filter tracking stays
  saved search + monitor — decision 4)
```

## Migration (concept level)

| Today | Becomes |
| --- | --- |
| `issues` row | `signals` row (`source` annotation→`annotation`, flagger/custom→`user`; `type='evaluation'`; centroid dropped) |
| `issues.resolved_at` / `ignored_at` | default monitor `resolved_at` / `muted_at` |
| issue discovery pipeline (`issues:discovery`, `issue-discovery` workflow, locked serialization, centroids) | **removed** (decision 2/3); annotation flow gains suggestion + explicit linking (flow C) |
| `scores.issue_id` | `scores.signal_id` (rename); backfills `signal_occurrences` from immutable issue-linked scores |
| `evaluations.issue_id` | `evaluations.signal_id` (rename) |
| `saved_searches` | unchanged |
| system monitors (`source_id = NULL`) | **retired**; per-signal default monitors replace them (decision 5) |
| `monitor_alerts.kind` | `issue.new`→retired · `issue.regressed`→`signal.regressed` · `savedSearch.match`→`signal.matched` · `savedSearch.threshold`→`metric.threshold` · `issue.escalating`+`savedSearch.escalating`→`metric.escalating` |
| `monitor_alerts.source_*` | dropped; target moves to the owning monitor |
| `alert_incidents.source_*` | `target_*` (values remapped in place) |
| moment labels | provisioned `origin='system'`, `type='semantic'` signals per project (anchor sets carried over verbatim) |
| issue URLs / Monitors routes | redirect into signal pages |

## Open questions

1. **Backfill policy.** Bounded backfill for rule/scope-evaluable signals is in scope (flow F); semantic backfill is feasible within the content-embedding TTL window (embeddings already exist) but is deferred. Exact window and quota TBD.
2. **Per-plan signal caps.** Decided in principle (decision 6); exact numbers per plan TBD.
3. **Session-scoped signals.** The occurrence unit is a trace (`session_id` is on the row for future use); session-membership semantics are deferred — a known limitation, accepted as the price of the trace-grained model.
4. **Rule abstraction final shape.** The `SignalRule` config above is the starting point; the exact part-targeting granularity (per message? per tool call? message ranges?) needs a design pass with real examples before implementation.
5. **Semantic threshold calibration loop** (post-MVP): iterative create-time tuning — show matches, accept/tighten, repeat. MVP ships a fixed default.
