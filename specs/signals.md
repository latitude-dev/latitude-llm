# Signals

> **Documentation**: eventual durable homes `dev-docs/signals.md` and an updated `dev-docs/monitors.md`; related current docs: `dev-docs/issues.md`, `dev-docs/scores.md`, `dev-docs/monitors.md`, `dev-docs/notifications.md`.
>
> **Supersedes (conceptually)**: `specs/monitors.md` and `specs/alerts.md`. Those specs remain accurate descriptions of what is *currently built*; this spec defines the model that replaces their framing. Do not retire them until the migration phases below are underway.
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

> Latitude groups your traces into **Signals**. Issues are signals Latitude creates for you from negative feedback; you can also define your own. Any signal — or saved search, or your raw traffic — can be watched with **Monitors**; monitors have **Alerts**, and a fired alert opens an **Incident**, which is what notifies you.

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

- Exactly **one definition** per signal (see `SignalType` below): a filter set, a semantic anchor + threshold, an aligned evaluation, a code rule, a sandboxed JS script, or a conversation-intelligence label.
- Signals carry **triage metadata** — priority and assignees — but **no lifecycle**. You create or delete signals; resolve/ignore semantics live on monitors.
- The **routing centroid** (today's issue centroid) is *not* a definition. It is internal machinery that routes new human feedback and failed scores to an existing signal (hybrid pgvector + tsvector search, unchanged from issue discovery). Users never configure it. This is what dissolves the earlier "multiple detectors per signal" idea: the centroid was the second detector in disguise.
- **Issues are signals** whose definition Latitude bootstraps: `origin = 'discovered'` (clustering pipeline) or `origin = 'annotation'` (the deliberate flow: explain the problem, point at 3–4 example traces, get a signal with a generated aligned evaluation).
- **Moment labels** (conversation intelligence) are provisioned as default per-project signals with `type = 'label'`.
- Every signal gets a **default monitor** (occurrences count) provisioned at creation.

### Saved search

**A virtual view over traces, kept as a concept.** The exploration bookmark on the Traces page: a stored `query + filterSet` evaluated at read time. Filter-only saved searches remain directly monitorable (filters are cheap and correct at query time — `SavedSearchMatchReader` machinery is reused unchanged). The upgrade path when a user wants history, charts, and triage is **Convert to signal**.

### Monitor

**A monitor watches one target over time.** Monitors never own filter definitions; they own:

- a **target**: a signal, a saved search, or a raw stream (all traces / spans / sessions — e.g. "avg latency of all traffic"). `target_id = NULL` on a `signal` target means "every signal in the project, evaluated independently" (class monitors — today's `source_id = NULL` system monitors).
- a **metric**: occurrence/event count (default), or an aggregate over the matched traces (avg/sum/p95 of duration, TTFT, cost, tokens, errors).
- **mute** (`muted_at`): notifications off; evaluation and incident recording continue.
- the **lifecycle**: *active* (default), *escalating* (derived: an open sustained incident exists), *resolved* (manual `resolved_at` anchor, or derived from a long quiet period). The first datapoint after `resolved_at` fires a `signal.regressed` event alert and clears the anchor.

"Resolve an issue" becomes resolving its default monitor; "ignore" becomes muting it. The signal page keeps one-click triage; it just writes to the monitor underneath.

### Alert

**A condition on a monitor.** Two flavors (Sentry-shaped, as in the original proposal):

- **Event alerts** fire on discrete events in the target stream: a new matching trace, a new signal discovered (class monitors), a regression.
- **Metric alerts** fire on the monitor's aggregated value: threshold (absolute / multiplier / expected), and sustained escalation.

Because every signal target is the same occurrence stream, today's two escalation evaluators (the issue seasonal detector and the saved-search bucket machine) merge into **one** `metric.escalating` evaluator. The seasonal grid becomes the `expected` threshold mode; `sensitivity` stays its single knob.

### Incident

**Unchanged.** Same `alert_incidents` lifecycle (point vs sustained), same backtracked `started_at`/`ended_at`, same notifications pipeline (`incident.event` / `incident.opened` / `incident.closed`). Incidents continue to snapshot the firing alert's `condition`, and additionally snapshot the monitor's **target definition** at open time so closed incidents stay self-describing after edits.

## Data model

### Shared enums (`@domain/shared`)

```ts
export const SIGNAL_ORIGINS = ["user", "annotation", "discovered", "system"] as const
export type SignalOrigin = (typeof SIGNAL_ORIGINS)[number]

export const SIGNAL_TYPES = ["filter", "semantic", "evaluation", "rule", "script", "label"] as const
export type SignalType = (typeof SIGNAL_TYPES)[number]

export const MONITOR_TARGET_TYPES = ["signal", "savedSearch", "traces", "spans", "sessions"] as const
export type MonitorTargetType = (typeof MONITOR_TARGET_TYPES)[number]

export const ALERT_KINDS = [
  // event alerts (point)
  "signal.created",    //  ← issue.new          (class monitors only)
  "signal.matched",    //  ← savedSearch.match  (a new trace entered the target stream)
  "signal.regressed",  //  ← issue.regressed    (a datapoint after monitor.resolved_at)
  // metric alerts
  "metric.threshold",  //  ← savedSearch.threshold (point; absolute | multiplier | expected)
  "metric.escalating", //  ← issue.escalating + savedSearch.escalating (sustained; unified)
] as const
export type AlertKind = (typeof ALERT_KINDS)[number]

// Severities, AlertCountThreshold (absolute | multiplier | expected) and
// AlertBaseline carry over verbatim from the current model.

export type MonitorMetric =
  | { kind: "count" }
  | { kind: "avg" | "sum" | "p95"; field: "duration" | "ttft" | "cost" | "tokens" | "errors" }
```

### Signal definition config (discriminated by `signals.type`)

```ts
export type SignalConfig =
  | { type: "filter";     query?: string; filterSet: FilterSet }   // verbatim saved_searches shape
  | { type: "semantic";   anchorText: string; minSimilarity: number }
  | { type: "evaluation" }                                          // definition = the evaluations rows
                                                                    // linked via evaluations.signal_id
  | { type: "rule";       rule: { kind: "regex" | "levenshtein" | "json-schema"; /* per-kind params */ } }
  | { type: "script";     script: string }                          // same sandboxed JS env as evaluations
  | { type: "label";      labelSlug: string }                       // conversation-intelligence moment
```

`minSimilarity` is part of the *definition*: changing it changes membership going forward (definition-changed marker on charts), never retroactively.

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
  type                varchar(32)            -- SignalType
  config              jsonb                  -- SignalConfig
  anchor_embedding    vector(2048) null      -- type='semantic' only: derived from config.anchorText,
                                             --   matched against TRACE CONTENT embeddings at ingest
  centroid            jsonb null             -- routing index (today's IssueCentroid, relocated):
  centroid_embedding  vector(2048) null      --   matched against FEEDBACK embeddings during discovery.
                                             --   Two columns because the two embeddings live in
                                             --   different semantic spaces.
  priority            varchar(16) null       -- IssuePriority, carried over (low/medium/high/urgent)
  assignees           varchar(24)[]          -- multi-assignee (annotation_queues precedent)
  search_document     tsvector GENERATED     -- name (A) + description (B); GIN
  deleted_at          timestamptz null
  created_at, updated_at

  unique (project_id, slug) WHERE deleted_at IS NULL
  btree  (organization_id, project_id, created_at) WHERE deleted_at IS NULL
  -- no ANN index on either vector column: project-scoped exact scan, as issues today
```

Removed vs `issues`: `uuid` (dormant), `escalated_at` / `resolved_at` / `ignored_at` (→ monitor), `assignee_id` (→ `assignees`), `source` (→ `origin`).

### Postgres: `monitors` (generalized, same table)

```
monitors
  id, organization_id, project_id, slug, name, description, system   -- unchanged
  target_type     varchar(32)            -- MonitorTargetType
  target_id       varchar(24) null       -- signal/savedSearch id; NULL = class ('signal') or whole stream
  metric          jsonb                  -- MonitorMetric, default { kind: 'count' }
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
                                         --   parameterless kinds (signal.created, signal.matched, signal.regressed)
  severity        varchar(16)
  deleted_at      timestamptz null       -- soft-delete preserved: incidents must stay attributable
  created_at, updated_at
```

`source_type` / `source_id` are removed — the target lives on the monitor.

### Postgres: `alert_incidents` (near-unchanged)

- `source_type` / `source_id` → `target_type` / `target_id` (values per the new enums; for class monitors `target_id` is the concrete signal that fired).
- `kind` values remapped per the table in the migration section.
- New: `target_snapshot jsonb null` — the monitor's `(target, metric)` and, for saved-search targets, the resolved `query + filterSet` at open time. Same rationale as the existing `condition` snapshot.
- Everything else (`monitor_alert_id`, `condition`, `entry_signals`, `exit_eligible_since`, backtracking) carries over.

### Postgres: renames only

- `scores.issue_id` → `scores.signal_id`. All draft/immutability/discovery semantics in `dev-docs/scores.md` survive verbatim.
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

Design notes:

- **Dedup unit is `(signal, trace)`**: a trace counts once per signal no matter how it matched or how late. Using `trace_started_at` (a deterministic property of the trace) as the time axis means a late matcher (an evaluation finishing minutes later, an annotation days later) produces a row with the *same sort key*, so ReplacingMergeTree collapses duplicates and histograms stay consistent without `FINAL` (reads use the standard dedup-safe aggregate shapes).
- Metrics are **denormalized** so "avg cost of checkout-failure traces" is a single-table aggregate on the monitor-evaluation hot path.
- Append-only; the only mutation is the rare `DELETE` by `signal_id` when a signal is hard-deleted, mirroring the score-deletion policy.

## UI

### Navigation

One **Signals** nav item replaces **Monitors** in the project sidebar. Issues remains the default landing view and keeps its URL space (`/projects/$slug/issues/...` redirects into the signal pages).

```
Traces
Signals                ← replaces "Monitors"
  ├─ Issues            ← default landing: signals with origin discovered|annotation (triage inbox)
  └─ All signals       ← every signal incl. user/system; configuration-centric table
Datasets
Settings
```

### Signals list

The **Issues** tab is today's issues table in spirit (status tabs derived from default-monitor state, bulk actions, triage columns). The **All signals** tab:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Signals                                                      [ New signal ] │
│  ┌────────┐┌─────────────┐                                                   │
│  │ Issues ││ All signals │                                                   │
│  └────────┘└─────────────┘                                                   │
│  ─────────────────────────────────────────────────────────────────────────── │
│  NAME                  TYPE        TREND (14d)   MONITORS   LAST INCIDENT    │
│  Checkout failures     filter      ▂▃▂▅▇▅▃▂      2          ● Ongoing · 2h   │
│  Angry users           semantic    ▁▁▂▂▁▂▁▁      1          Closed · 3d ago  │
│  PII in answers        evaluation  ▂▂▃▃▃▂▃▃      1          —                │
│  Refund requested 🔇   label       ▃▃▃▄▃▃▃▃      1 (muted)  —                │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Signal detail page — the center of gravity

Definition, monitor charts, alerts, incidents, and member traces in one context. The issue experience is this same shell: triage controls in the header, plus the AI summary / patterns / examples sections for discovered and annotation signals.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Signals / Checkout failures              [Resolve] [Ignore 🔇] [Edit] [⋯] │
│  filter · service = checkout AND status = error                              │
│  Priority: High ▾    Assignees: @ana @marc ▾                                 │
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

One builder, three entry points, one rule: **never let users define membership blind** — the builder always shows a live preview (a bounded query-time evaluation of the definition over recent traces; for `semantic`, an exact scan over a recent window).

```
  Traces page                 Signals list                Annotation flow
  "Create signal from         [ New signal ]              "Track this as a signal"
   this search"                     │                            │
        └───────────────┬───────────┘                            │
                        ▼                                        ▼
  ┌───────────────────────────────────────────┐   ┌──────────────────────────────────────┐
  │  New signal                               │   │  Track failure mode                  │
  │  Type:  ◉ Filter  ○ Semantic  ○ Rule      │   │  What is going wrong?                │
  │         ○ Script                          │   │  ┌────────────────────────────────┐  │
  │  ┌─────────────────────────────────────┐  │   │  │ The agent promises refunds we  │  │
  │  │ service = checkout AND status=error │  │   │  │ don't offer…                   │  │
  │  └─────────────────────────────────────┘  │   │  └────────────────────────────────┘  │
  │  ┌─────────────────────────────────────┐  │   │  Example traces (3–4):               │
  │  │ Preview: 1,284 matches, last 7 days │  │   │  ☑ trace #a1f3   ☑ trace #b274      │
  │  │ …sample rows…                       │  │   │  ☑ trace #c9d1   ☐ + add            │
  │  └─────────────────────────────────────┘  │   │                                      │
  │  Backfill last 14 days?  [✓]              │   │  → creates the signal and generates  │
  │  (filter/rule only)                       │   │    its aligned evaluation             │
  │              [ Create ]                   │   │              [ Create ]              │
  └───────────────────────────────────────────┘   └──────────────────────────────────────┘
```

### Traces page

- Saved searches keep their selector + save button. Each saved-search row offers **Create monitor** (filter-only searches) and **Convert to signal**.
- A semantic query shows a contract banner so the sample semantics are explicit: `Showing the most relevant results (ranked sample) — to track or count every match, create a signal.`

### Creating a monitor

```
┌───────────────────────────────────────────────┐
│  New monitor                                  │
│  Watch:   ◉ Signal        [Checkout fail… ▾]  │
│           ○ Saved search  [ … ▾]              │
│           ○ All traces / spans / sessions     │
│  Metric:  ◉ Occurrences   ○ Avg [cost ▾]      │
│  Alerts:  (optional, card stack as today)     │
│   • when value > [2]× [avg of last 7 days ▾]  │
│              [ Create ]                       │
└───────────────────────────────────────────────┘
```

## Main flows (callstacks)

Names follow existing conventions; `@domain/signals` is the new domain package (evolved from `@domain/issues`). Existing machinery reused unchanged is marked `[reuse]`.

### A. Trace ingest → matching → occurrences

```
span ingestion → ClickHouse spans insert → TracesIngested (outbox)            [reuse]
└─ domain-events dispatcher (apps/workers/src/workers/domain-events.ts)       [reuse]
   └─ signals:match (queue task, batched per project)
      └─ matchTracesToSignalsUseCase (@domain/signals)
         ├─ SignalRepository.listActiveDefinitions(projectId)        -- Redis-cached, org-prefixed key
         ├─ filter definitions  → FilterSet predicate in-process
         ├─ rule definitions    → compiled matcher (sandbox)
         ├─ script definitions  → sandboxed JS (same env as evaluations)
         ├─ label definitions   → conversation-intelligence classifier output   [reuse]
         └─ matches → SignalOccurrenceRepository.append (CH insert; idempotent via sort key)
      └─ publishes monitors:evaluate (leading-edge throttle, 5 min)            [reuse shape]

semantic definitions (separate hop — needs trace content embeddings):
trace_search_embeddings chunks written (existing search-indexing pipeline)     [reuse]
└─ signals:semanticMatch (queue task per trace)
   └─ matchTraceToSemanticSignalsUseCase
      ├─ load project semantic anchors (anchor_embedding exact scan — hundreds at most)
      ├─ max chunk-vs-anchor similarity ≥ config.minSimilarity → match
      └─ SignalOccurrenceRepository.append

evaluation definitions (third hop — existing evaluation triggers):             [reuse]
evaluation trigger fires → evaluation runs → failed non-errored score written
  with scores.signal_id (live issue-linked path today)
└─ after-commit: syncScoreAnalyticsUseCase                                     [reuse]
   └─ + SignalOccurrenceRepository.append (score-backed: score_id set)
```

### B. Deliberate signal creation from annotations

```
UI: annotate → "Track this as a signal" → explanation + 3–4 example traces
└─ createSignalFromAnnotationsUseCase (@domain/signals)
   ├─ persist annotation scores for the examples (canonical scores path)       [reuse]
   ├─ create signal { origin: 'annotation', type: 'evaluation', config: {} }
   ├─ seed routing centroid from the feedback embeddings (@domain/shared/centroid)  [reuse]
   ├─ append score-backed occurrences for the example traces
   ├─ provisionDefaultMonitorUseCase (occurrences monitor + default alerts)
   └─ start Temporal optimize-evaluation, workflow id evaluations:generate:${signalId}  [reuse]
      └─ generates + aligns the evaluation; persists with evaluations.signal_id
frontend polls getSignalAlignmentState (Temporal workflow.describe())           [reuse shape]
```

### C. Automatic discovery & feedback routing (today's pipeline, re-anchored)

```
failed non-errored unowned score published → ScoreCreated (transactional outbox)  [reuse]
└─ signals:discovery (deduped task; today issues:discovery)                       [reuse]
   ├─ centralized gate: selected signalId / evaluation-linked signal → direct claim
   └─ else Temporal signal-discovery workflow (today issue-discovery)             [reuse]
      ├─ embed feedback → hybrid search over signals (centroid_embedding + search_document)
      ├─ rerank → match existing signal, or bounded locked serialization → create
      │    signal { origin: 'discovered', type: 'evaluation' }  (+ default monitor)
      ├─ claim scores.signal_id → update routing centroid
      └─ syncScoreAnalyticsUseCase + SignalOccurrenceRepository.append (score-backed)
SignalCreated (outbox, on the create path)
└─ alert-incidents worker → class monitors with a signal.created alert → incident → notifications
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

### F. Convert saved search → signal (with backfill)

```
UI: saved-search row / traces page → "Convert to signal"
└─ convertSavedSearchToSignalUseCase
   ├─ create signal { origin: 'user', type: 'filter', config: copy of query+filterSet }
   ├─ provisionDefaultMonitorUseCase
   └─ enqueue signals:backfill { signalId, window: 14d }
      └─ backfillSignalOccurrencesUseCase: query-time evaluation of the filter over
         historical traces (batched) → SignalOccurrenceRepository.append
saved_searches row remains (still a bookmark)
```

## Migration (concept level)

| Today | Becomes |
| --- | --- |
| `issues` row | `signals` row (`source` annotation→`annotation`, flagger→`discovered`, custom→`user`; centroid columns relocated; `type='evaluation'`) |
| `issues.resolved_at` / `ignored_at` | default monitor `resolved_at` / `muted_at` |
| `scores.issue_id` | `scores.signal_id` (rename); backfills `signal_occurrences` from immutable issue-linked scores |
| `evaluations.issue_id` | `evaluations.signal_id` (rename) |
| `saved_searches` | unchanged |
| system monitors (`source_id = NULL`) | class monitors `target_type='signal'`, `target_id=NULL` |
| `monitor_alerts.kind` | `issue.new`→`signal.created` · `issue.regressed`→`signal.regressed` · `savedSearch.match`→`signal.matched` · `savedSearch.threshold`→`metric.threshold` · `issue.escalating`+`savedSearch.escalating`→`metric.escalating` |
| `monitor_alerts.source_*` | dropped; target moves to the owning monitor |
| `alert_incidents.source_*` | `target_*` (values remapped in place) |
| moment labels | provisioned `origin='system'`, `type='label'` signals per project |
| issue URLs / Monitors routes | redirect into signal pages |

## Open questions

1. **Ingest-time embedding cost.** Semantic signals require trace-content embeddings at ingest (the search-indexing pipeline already produces them, but its 30-day TTL and coverage/gating need review). Price per 1M traces, truncation, and per-plan gating must be settled before write-time semantic ships as a launch feature vs. fast-follow.
2. **Backfill policy.** Bounded backfill for filter/rule signals is in scope (flow F); semantic backfill means embedding the past — not offered initially. Exact window and quota TBD.
3. **Dual path for filter monitoring.** Saved-search monitors and filter signals can answer the same question. The UI must be opinionated (nudge conversion) so the old soup isn't recreated. Whether the saved-search row should link to the signal it spawned is open.
4. **Does automatic discovery stay fully on?** The clustering pipeline maps cleanly to `origin='discovered'` signals, but the deliberate annotation flow is the intended primary path. Keep both with today's denoising rules, or gate auto-creation down?
5. **Occurrence write amplification.** A broad filter signal writes one occurrence per matching trace. ClickHouse absorbs it, but per-project active-signal caps or match-rate guardrails are probably needed.
6. **Session-scoped signals.** The occurrence unit is a trace (`session_id` is on the row for future use); session-membership semantics are deferred.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`
>
> Phases to be broken into tasks once the proposal is ratified on LAT-664. Intended sequencing:

### Phase 0 - Foundations

- [ ] **P0-1**: `signal_occurrences` ClickHouse table + `SignalOccurrenceRepository`/`Reader`, backfilled from issue-linked scores; prove the unified `metric.escalating` evaluator over it.
- [ ] **P0-2**: Price ingest-time embedding for semantic signals (open question 1) and decide launch vs. fast-follow.

**Exit gate**: occurrence stream live for existing issues; one escalation evaluator passing the existing issue + saved-search test matrices.

### Phase 1 - Schema migration

- [ ] **P1-1**: `issues` → `signals`, `scores.signal_id`, `evaluations.signal_id`, monitor/alert/incident generalization, kind remaps, default-monitor provisioning + lifecycle anchors.

**Exit gate**: legacy paths running on the new schema behind the existing `monitors` flag pattern; no user-visible change.

### Phase 2 - Write-time matching

- [ ] **P2-1**: `signals:match` (filter/rule/script/label) + `signals:semanticMatch` + backfill task (flows A, F).

**Exit gate**: a filter signal created from a saved search tracks occurrences and alerts end-to-end.

### Phase 3 - Product surface

- [ ] **P3-1**: Signals nav + lists, signal detail shell, create flows (incl. annotation flow B), monitor/alert forms, redirects.

**Exit gate**: Monitors page retired; Issues experience preserved on the signal shell; LAT-664 closeable.
