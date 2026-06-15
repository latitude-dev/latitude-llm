# Signals

> **Documentation**: eventual durable homes `dev-docs/signals.md` and an updated `dev-docs/monitors.md`; related current docs: `dev-docs/issues.md`, `dev-docs/scores.md`, `dev-docs/monitors.md`, `dev-docs/notifications.md`, `dev-docs/conversation-intelligence.md`.
>
> **Depends on**: `specs/sandbox-runtime.md` — the execution contract for evaluation/rule/script detectors: every detector returns `Score(value, feedback?)` with `value` = signal-exhibition strength, and the host derives membership as `value >= signals.threshold`.
>
> **Supersedes (conceptually)**: `specs/monitors.md` and `specs/alerts.md`. Those specs remain accurate descriptions of what is *currently built*; this spec defines the model that replaces their framing. Do not retire them until the migration phases are underway.
>
> **Origin**: LAT-664 ("Consolidate monitor situation") — this spec consolidates the two proposals discussed there and the final comment posted on the issue.

## Purpose

Latitude currently has two parallel tracking systems with overlapping names and separate UIs: **Issues** (auto-created buckets of failed scores, invisibly monitored) and **Monitors** (user-configured alerts over **Saved Searches**). This spec restructures both around four concepts in a pipeline:

```
                 signals create            monitors aggregate         alerts fire on        records the
                 occurrence rows           the occurrence stream      conditions            firing
  Trace ───────▶ SIGNAL ─────────────────▶ MONITOR ─────────────────▶ ALERT ──────────────▶ INCIDENT ──▶ notifications
                 (write-time matching)     (or saved searches, tools,
                                            raw telemetry streams)
```

The one-line mental model for users and docs:

> Latitude groups your traces into **Signals** — buckets you define deliberately (from the Signals page or while annotating) or that Latitude **discovers** from your traffic and proposes for review. Any signal — or saved search, tool, or your raw traffic — can be watched with **Monitors**; monitors have **Alerts**, and a fired alert opens an **Incident**, which is what notifies you.

Signal membership is **materialized at write time** — each trace is matched once at ingest and the verdict is remembered as an occurrence row. This is the load-bearing decision of the spec and it is forced, not a preference; the full rationale lives at the end ("Why signal membership is materialized at write time").

## Concepts

### Signal

**A signal is a tracked bucket of traces: one definition, evaluated per trace at ingest, materialized forever.**

- A signal's definition has two orthogonal parts:
  - a **scope**: an optional `FilterSet` restricting which traces are considered at all ("traces above the p90 latency", "traces tagged `foo`"). Row-local and cheap, evaluated first; empty scope = all traces.
  - a **matcher** (`SignalType`): the membership test run on in-scope traces — a semantic anchor set, an aligned evaluation, a structured code rule, or a sandboxed JS script.

  Any matcher composes with any scope: an evaluation that only runs on slow traces, a semantic anchor only checked against traces tagged `foo`. The scope doubles as a cost pre-gate: out-of-scope traces never reach the matchers. Pure filter slices are deliberately *not* signals (decision 4) — that job belongs to saved searches + monitors.
- Signals carry **triage metadata** — priority and assignees — but **no lifecycle**. You create or delete signals; resolve/ignore semantics live on monitors.
- Signals are created two ways (decision 2): **proactively by users** — from the Signals page builder, from a saved search (pre-filling scope and anchors — flow F), or from the annotation flow ("explain the problem, point at 3–4 example traces, get a signal with a generated aligned evaluation") — and **automatically by discovery**, which proposes signals mined from traffic (`origin = 'discovered'`, surfaced as `proposed` until confirmed — see "Discovery"). Either way a signal is a concrete, materializable definition; today's issues migrate into signals.
- **Moment labels** (conversation intelligence) are provisioned as default per-project signals with `type = 'semantic'` — their existing anchor sets (`MOMENT_LABEL_ANCHORS`) carry over verbatim, since the semantic config adopts the same shape (multiple positive anchors + contrast anchors + margin; each kind's static gate becomes the signal's `threshold`).
- Every signal gets a **default monitor** — provisioned at creation, or at *confirmation* for discovered signals (a `proposed` signal has no monitor and never notifies) — the same monitoring issues get today: an occurrences monitor carrying a high-severity `metric.escalating` alert in `expected` mode (the seasonal heuristic, so a firing is a high-signal event rather than noise) plus the `event.regressed` event alert.

### Saved search

**A virtual view over traces, kept as a concept — and the only home for pure filter tracking.** The exploration bookmark on the Traces page: a stored `query + filterSet` evaluated at read time. Saved searches are directly monitorable (filters are cheap and correct at query time — `SavedSearchMatchReader` machinery reused unchanged). When a user wants a *deeper* membership test (semantic, rule, evaluation, script), the path is **Create signal from this search**, which pre-fills the scope from the filters and the semantic anchor from a semantic prompt.

### Monitor

**A monitor watches one target over time.** Monitors never own filter definitions; they own:

- a **target**: a signal, a saved search, a **tool** (from the Tools dashboard — telemetry-emergent, addressed by name), or a raw stream — `traces`, `spans`, or `sessions` as a whole (e.g. "avg latency of all traffic"). `target_id` is required for signal/saved-search/tool targets; raw streams have none.
- a **metric**: event/occurrence count (default), or an aggregate over the matched traces — `avg` / `sum` / `p95` of `duration`, `ttft`, `cost`, `tokens`, or `errors`.
- **mute** (`muted_at`): notifications off; evaluation and incident recording continue.
- the **lifecycle**: *active* (default), *escalating* (derived: an open sustained incident exists), *resolved* (manual `resolved_at` anchor, or derived from a long quiet period). The first datapoint after `resolved_at` fires an `event.regressed` alert and clears the anchor.

Tool targets get **no default monitor** (the inventory is telemetry-emergent and can be large — tool monitors are opt-in) and no deletion cascade (tools aren't Postgres rows). Tool *metrics* belong here; *judgments* about tool behavior belong to signals — `SignalRule`'s `part: 'toolCall'`, or any matcher scoped with the `tools` filter field.

"Resolve a signal" resolves its default monitor; "ignore" mutes it. The signal page keeps one-click triage; it just writes to the monitor underneath.

### Alert

**A condition on a monitor.** Two flavors (Sentry-shaped, as in the original proposal):

- **Event alerts** fire on discrete events in the target stream: a new matching trace, a regression.
- **Metric alerts** fire on the monitor's aggregated value: threshold (absolute / multiplier / expected), and sustained escalation.

Today "is this escalating?" has two unrelated implementations that differ only in their input: the issue path runs the seasonal detector (`evaluateSeasonalEscalation`) over per-issue **score counts**; the saved-search path runs a bucketed sustained-gate over query-time **trace-match counts** (whose `expected` mode already calls the same detector). The logic shape is identical: *per-bucket count series → per-bucket threshold → open/close state machine*. Since every monitor target now yields that same input shape, the two merge into **one** `metric.escalating` evaluator; the seasonal detector survives as the threshold function of `expected` mode (knob: `sensitivity`), and issue escalation stops being special — it is just the default monitor's escalating alert in that mode.

### Incident

**Unchanged.** Same `alert_incidents` lifecycle (point vs sustained), same backtracked `started_at`/`ended_at`, same notifications pipeline (`incident.event` / `incident.opened` / `incident.closed`). Incidents continue to snapshot the firing alert's `condition`, and additionally snapshot the monitor's **target definition** at open time so closed incidents stay self-describing after edits.

## Data model

### Shared enums (`@domain/shared`)

```ts
export const SIGNAL_ORIGINS = ["user", "annotation", "discovered", "system"] as const
export type SignalOrigin = (typeof SIGNAL_ORIGINS)[number]
// 'user'       — built from the Signals page or from a saved search
// 'annotation' — created through the annotation flow
// 'discovered' — proposed automatically by the discovery pipeline (status 'proposed' until confirmed)
// 'system'     — provisioned by Latitude (moment labels)

export const SIGNAL_STATUSES = ["proposed", "confirmed"] as const
export type SignalStatus = (typeof SIGNAL_STATUSES)[number]
// 'proposed'  — a discovery candidate: definition + validation materialized, but no monitor, no
//               notifications, and excluded from the active-signal cap until a human (or an
//               auto-confirm policy) accepts it
// 'confirmed' — an active signal (the default for 'user' / 'annotation' / 'system' origins)

export const SIGNAL_TYPES = ["semantic", "evaluation", "rule", "script"] as const
export type SignalType = (typeof SIGNAL_TYPES)[number]

export const MONITOR_TARGET_TYPES = ["signal", "savedSearch", "tool", "traces", "spans", "sessions"] as const
export type MonitorTargetType = (typeof MONITOR_TARGET_TYPES)[number]
// 'signal' / 'savedSearch'        — a specific entity (target_id = its CUID)
// 'tool'                          — a telemetry-emergent entity (target_id = the tool name)
// 'traces' / 'spans' / 'sessions' — the project's whole raw stream (target_id null)

export const ALERT_KINDS = [
  // event alerts (point) — target-agnostic names: they apply to any target
  "event.matched",     //  ← savedSearch.match  (a new event entered the target stream)
  "event.regressed",   //  ← issue.regressed    (a datapoint after monitor.resolved_at)
  // metric alerts
  "metric.threshold",  //  ← savedSearch.threshold (point; absolute | multiplier | expected)
  "metric.escalating", //  ← issue.escalating + savedSearch.escalating (sustained; unified)
] as const
export type AlertKind = (typeof ALERT_KINDS)[number]
// issue.new is retired as an alert kind: discovery (see "Discovery") surfaces proposals through a
// notification kind, not through a monitor alert/incident — a proposal is not a firing.

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
// for moment labels, adopted wholesale (multi-anchor + contrast + margin). The detector's
// value is max(chunk · positiveAnchor); the membership cutoff is NOT config — it is the
// uniform per-signal signals.threshold knob (specs/sandbox-runtime.md):
export type SemanticAnchors = {
  anchors: string[]            // positive anchor phrases (1..n); best match wins
  contrastAnchors?: string[]   // negative anchors: a trace matches only if its best positive
                               //   similarity ALSO beats its best contrast similarity by `margin`
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

- Every matcher executes through the sandbox-runtime contract (semantic via its native batch runner): the run returns `Score(value, feedback?)` with `value` = exhibition strength, and membership is `value >= signals.threshold`. Generated judges are phrased *as the signal* ("does this trace exhibit X?") so judge-yes = high value; legacy quality-phrased evaluations invert values (`1 − value`) or regenerate at migration.
- `scope` reuses the shared `FilterSet`, including `gtePercentile` — so "traces above the p90 latency" is expressible today. Percentile operators are resolved against a periodically refreshed project estimate at ingest (slightly approximate at write time, exact during backfill).
- For `evaluation` signals the scope plays the role of today's `EvaluationTrigger.filter` — see "One matching pipeline" below; `sampling`/`turn`/`debounce` stay evaluation-level settings.
- Definition edits (anchors, threshold, scope) change membership **going forward only** (definition-changed marker on charts), never retroactively.
- Threshold UX: MVP ships a fixed default (`0.5`; rules/judges emit ≈{0,1} so it is degenerate for them) with a sensitivity control for semantic signals; an iterative create-time calibration loop (show matches → tighten/loosen → repeat) is a possible post-MVP refinement.

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
  status              varchar(16)            -- SignalStatus; 'proposed' gates monitoring/notifications
                                             --   and the active-signal cap; 'confirmed' is the default
  type                varchar(32)            -- SignalType (the matcher)
  config              jsonb                  -- SignalConfig (matcher parameters)
  scope               jsonb                  -- FilterSet pre-gate; {} = all traces; composes with any type
  threshold           float8 DEFAULT 0.5     -- membership cutoff over the detector value
                                             --   (specs/sandbox-runtime.md); generalizes semantic
                                             --   minSimilarity to every type; edits apply forward only
  priority            varchar(16) null       -- IssuePriority, carried over (low/medium/high/urgent)
  assignees           varchar(24)[]          -- multi-assignee (annotation_queues precedent)
  search_document     tsvector GENERATED     -- name (A) + description (B); GIN
  search_embedding    vector(2048) null      -- derived from name + description on save; used with
                                             --   search_document for hybrid existing-signal
                                             --   suggestions while annotating (decision 3)
  discovery           jsonb null             -- discovered signals only: RCA explanation, sample
                                             --   trace ids, validation stats, attention sources
  deleted_at          timestamptz null
  created_at, updated_at

  unique (project_id, slug) WHERE deleted_at IS NULL
  btree  (organization_id, project_id, created_at) WHERE deleted_at IS NULL
  btree  (project_id, status) WHERE deleted_at IS NULL   -- proposed-discovery review inbox
  -- no ANN index on search_embedding: project-scoped exact scan, as issues today
```

Removed vs `issues`: `uuid` (dormant), `centroid` + `centroid_embedding` (the centroid mechanism is gone — decision 3; discovery is rebuilt without centroids), `escalated_at` / `resolved_at` / `ignored_at` (→ monitor), `assignee_id` (→ `assignees`), `source` (→ `origin`). Added vs `issues`: `status`, `discovery`.

Semantic anchor embeddings are **not** a table column: anchors are embedded once on save and Redis-cached (org-prefixed key), exactly as moment-label anchors are today. Matching compares in-process at ingest; nothing ever searches anchors via SQL.

### Postgres: `monitors` (generalized, same table)

```
monitors
  id, organization_id, project_id, slug, name, description, system   -- unchanged
  target_type     varchar(32)            -- 'signal' | 'savedSearch' | 'tool' | 'traces' | 'spans' | 'sessions'
  target_id       varchar(128) null      -- entity CUID ('signal'/'savedSearch') or tool name ('tool');
                                         --   NULL only for raw streams (= the whole project stream).
                                         --   varchar(128), not 24: tool names are telemetry strings
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
                                         --   parameterless kinds (event.matched, event.regressed)
  severity        varchar(16)
  deleted_at      timestamptz null       -- soft-delete preserved: incidents must stay attributable
  created_at, updated_at
```

`source_type` / `source_id` are removed — the target lives on the monitor.

### Postgres: `alert_incidents` (near-unchanged)

- `source_type` / `source_id` → `target_type` / `target_id` (values per the new enums).
- `kind` values remapped from the legacy `issue.*` / `savedSearch.*` kinds (see the `ALERT_KINDS` mapping comments).
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
  value                  Float32                           -- the matching run's detector value (match
                                                           --   strength: sort/confidence UI for free)
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

**Occurrences vs scores** (decision 6). Occurrences are the **membership ledger** ("this trace is in this signal"); scores are the **verdict ledger** ("this judge said pass/fail and why"). A semantic or rule match has no verdict, no feedback, nothing to draft — forcing it into `scores` would pollute evaluation analytics and push trace-volume writes through the canonical mutable Postgres path. Scores stop being the membership mechanism and keep the three jobs occurrences structurally cannot do:

1. **Verdicts that don't match.** Occurrences record only matches; pass rates, error rates, and every confusion matrix also need the *passed* and *errored* runs — the rows that produce no occurrence.
2. **Human feedback as alignment ground truth.** Annotations need a mutable, draft-able row, and alignment is literally human verdicts vs evaluation verdicts on the same traces. The unified score shape across sources is deliberate: human and machine judges emit exactly the same output — a verdict on a trace — with `source` recording who judged; alignment works because both sides live in one table with one shape. For signal-linked rows, `value` is **signal-exhibition strength** (generated judges are exhibition-phrased; legacy quality-phrased evaluations invert at migration) and `passed` is derived as `value >= threshold` at write time.
3. **The public `/scores` API** for custom, user-pushed results (an existing machine-facing contract).

The two ledgers link where they meet: `score_id` is set on occurrences produced by judgment-bearing matchers, and `scores.signal_id` survives as the evidence label — not as membership. The ClickHouse score-analytics table loses its issue-trend role to `signal_occurrences` and remains for evaluation/custom source dashboards.

Design notes:

- **Dedup unit is `(signal, trace)`**: a trace counts once per signal no matter how it matched or how late. Using `trace_started_at` (a deterministic property of the trace) as the time axis means a late matcher (an evaluation finishing minutes later, an annotation days later) produces a row with the *same sort key*, so ReplacingMergeTree collapses duplicates and histograms stay consistent without `FINAL` (reads use the standard dedup-safe aggregate shapes).
- Metrics are **denormalized** so "avg cost of checkout-failure traces" is a single-table aggregate on the monitor-evaluation hot path.
- Append-only; the only mutation is the rare `DELETE` by `signal_id` when a signal is hard-deleted, mirroring the score-deletion policy.

## UI

### Navigation

A **Signals** nav item replaces **Issues**. It's one list — user-built, system, and discovered signals together — with a **status filter** that separates `proposed` discoveries (the review inbox) from active signals; issue URLs (`/projects/$slug/issues/...`) redirect into the corresponding signal pages. The **Monitors** item stays, generalized: the cross-target view of every active monitor in the project, whatever it watches.

```
Traces
Signals              ← replaces "Issues" (single list; nothing auto-appears)
Monitors             ← stays: all monitors across targets (signals, saved searches, tools, raw streams)
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
│           ○ Tool          [ … ▾]              │
│           ○ All traces / spans / sessions     │
│  Metric:  ◉ Occurrences   ○ Avg [cost ▾]      │
│  Alerts:  (optional, card stack as today)     │
│   • when value > [2]× [avg of last 7 days ▾]  │
│              [ Create ]                       │
└───────────────────────────────────────────────┘
```

### Monitors list

Today's monitors dashboard, generalized: one row per monitor across all targets, with a **Target** column (signal / saved search / tool / raw stream, deep-linked to the target's own page), status (Live / Muted / Resolved / Escalating), metric, and last incident. Per-target monitor management still lives on each target's detail page (signal page, tool page, saved-search row); this list is the project-wide operational overview — "what is being watched right now, and what's firing".

## One matching pipeline

Today's write-time execution machinery is evaluation-oriented: `EvaluationTrigger` (filter / turn / debounce / sampling) decides when an evaluation runs against an incoming trace. This spec generalizes it into a single **signal matching pipeline** that owns "run every active signal's definition against incoming traces"; evaluations become one *runner* inside it rather than the pipeline itself:

- the **scope gate** is shared (one pass per trace over all active signals' scopes);
- the **sandbox runner** executes rule (compiled), script (user-authored), and evaluation (LLM-judge) matchers in the shared sandboxed JS runtime;
- the **semantic runner** compares trace content-chunk embeddings (already produced at ingest for trace search and semantic moments) against the Redis-cached anchor embeddings;
- evaluation-specific options (`sampling`, `turn`, `debounce`) remain runner-level settings, not pipeline concepts.

## Discovery

**Discovery is an automated analyst that proposes signal *definitions* nobody had to think of first.** It is the one pipeline that creates signals without a user — but what it creates is an ordinary signal (a concrete matcher: materializable, countable, editable forward-only), not a fuzzy bucket. Discovery is the *producer*; the signal is the *product*. Everything a discovered failure needs in order to be believed — a prevalence count, a trend, an alert, a regression check after a fix — flows through the materialized signals substrate exactly as a hand-built signal's does. This is why discovery and write-time materialization are complementary, not opposed: the materialization discipline (see "Why signal membership is materialized at write time") is *what lets a discovered hypothesis be quantified at all*. A failure mode the analyst describes in prose becomes a number ("66% of support runs") only by compiling to a matcher and backfilling it.

This **supersedes the old discovery mechanism** — annotation feedback → embedding → per-signal decayed centroid → auto-created issue — which is retired in full (decision 3). That mechanism failed three ways, and each failure is fixed by a stage below:

- **It mapped one annotation to one issue.** Clustering over the thin stream of human verdicts barely clusters, so "discovery" degenerated into "every new annotation is a new issue." → Cohorts now form from *traffic* (stage 2), not from a single verdict.
- **Machine detection was capped at a handful of flaggers** (laziness, frustration, …). → Characterization is an open-ended LLM analyst (stage 3); flaggers become one attention source among many, not the ceiling on what can be found.
- **It ignored the signals already in the data** — moments, tool errors, structural shape. → Attention sourcing is multi-modal (stage 1). The flagship case — "every run returned success, so nothing surfaced in error monitoring" — is reachable *only* by the structural and semantic lenses, never by outcome signals.

### Two clocks

Matching and discovery must not share a clock. **Matching** known signals is cheap, per-trace, and write-time — the "One matching pipeline" above. **Discovery** is expensive, batch, and periodic — an analyst sweep over a window of traffic, impact-prioritized, sampled, and budgeted (its own budget; proposals do not consume the per-plan active-signal cap — decision 5). Discovery's expensive LLM work is bounded to *representatives* (stages 3 and 5); it never reads every trace. Quantification (stage 4) scales by compiling a cheap matcher and reusing the backfill path — not by an LLM call per trace.

### Attention sources (stage 1 — cheap, broad, blind to each other)

A multi-modal sweep gathers candidate traces from sources that each miss what the others catch:

- **moments** (conversation intelligence — frustration, correction, …): already-computed interesting points, currently unused for discovery;
- **outcome anomalies**: tool/exception errors, retries, abandonment, user-correction turns, evaluation failures, low scores;
- **resource outliers**: cost / latency / token tails;
- **structural anomalies**: deviation from the project's modal tool-call graph / control flow — the only lens that reaches failures with no error *and* no negative sentiment.

### The discovery loop

```
periodic discovery sweep (per project; impact-prioritized, sampled, budgeted)
└─ 1. attention sourcing   multi-modal: moments + outcome anomalies + outliers + structural
└─ 2. cohort formation     group flagged traces by behavioral similarity (content/behavior
                             embedding + structural fingerprint), NOT by annotation text —
                             this is where "at scale" lives and where 1:1 mapping dies
└─ 3. characterization     LLM analyst reads representatives per cohort → a SPECIFIC,
                             FALSIFIABLE hypothesis + a draft matcher (semantic | rule |
                             evaluation | script) + a severity guess
└─ 4. validation           compile matcher → backfill over a window → real prevalence +
                             precision vs the read samples; tighten until precise
                             [reuse backfillSignalOccurrencesUseCase + optimize-evaluation]
└─ 5. root cause analysis  agentic: affected-vs-unaffected differential, locate the
                             divergence span, READ the affected spans' system_instructions
                             + tool_definitions → name the cause (explanation, not a fix)
└─ 6. dedup + promotion    hybrid-search vs existing signals (search_document +
                             search_embedding); if novel AND above an impact bar
                             (volume × severity) → create a PROPOSED signal
└─ 7. notify / confirm     surface with prevalence + sample traces + RCA;
                             human confirms (or auto-confirm above a high-precision bar) →
                             signal goes active, default monitor provisioned, write-time
                             matching tracks it cheaply forever
```

The hinge is stage 3→4: the hypothesis must be precise enough to **compile into a matcher**, because a matcher is the only thing the materialized substrate can count. An imprecise "66%" destroys trust faster than silence, so stage 4's validate-against-held-out-samples loop *gates* promotion — discovery never notifies on an unvalidated number.

**Stage 2 is the one net-new primitive; everything else is reuse.** The clustering *machinery* already exists and generalizes directly: the decayed-centroid math (`@domain/shared/centroid.ts`), the divisive spherical-k-means hierarchical clusterer (`@domain/taxonomy` — which already clusters `session_moment_labels` embeddings into `taxonomy_observations.assigned_cluster_id`), and cosine similarity in both stores (pgvector `<=>`; ClickHouse `cosineDistance`, with an HNSW index on `message_embeddings`). What does *not* exist is a **behavioral representation of a trace**. Every embedding today is semantic-text: `trace_search_embeddings` (per-chunk, 2048-d voyage-4-large) and `session_semantic_moments.embedding` (per-moment) — there is no whole-trace embedding and no structural fingerprint. The traces/sessions tables carry only an **unordered set** of distinct tool names (`traces.tools`), not the ordered tool sequence or span-tree shape that "deviates from the modal control flow" requires. So stage 2 has two tiers: **content cohorts** ship on reuse (pool the existing chunk/moment embeddings + the taxonomy clusterer), while **structural cohorts** (the lever for the no-error case) need a new behavioral feature — an ordered tool-call sequence and/or span-tree fingerprint, reconstructable from `spans.parent_span_id` + `execute_tool` spans but not stored today.

RCA (stage 5) reads the **system prompt and tool definitions captured on the affected spans themselves** — `spans.system_instructions`, `spans.tool_definitions`, and the `execute_tool` spans' `tool_input` / `tool_output`. There is no prompt/agent registry in the platform (v2 is monitoring-only — Latitude does not run the agent), and none is needed: the prompt that produced a trace already lives in its telemetry. RCA's output is an **explanation** — "what is going wrong and why," with the divergence span and the prompt/tool context that caused it — not a suggested fix. Latitude does not run, own, or version the prompt, so it does not draft or apply remediation; acting on the diagnosis is the customer's.

### Candidate lifecycle

A discovered signal is an ordinary `signals` row with `origin = 'discovered'` and `status = 'proposed'`. A proposed signal:

- carries its full definition — so its prevalence is already materialized (that *is* stage 4's validation backfill);
- has **no default monitor** and **never notifies** — promotion to notifications happens only on confirm;
- does **not** consume the per-plan active-signal cap (decision 5) until confirmed;
- stores its discovery artifacts (RCA explanation, sample trace ids, validation stats, attention sources) in the `signals.discovery` jsonb column.

On **confirm** (human, or auto above a high-precision bar) the row flips to `status = 'confirmed'`, a default monitor is provisioned (as for any signal), and it becomes indistinguishable from a hand-built signal — including forward-only edits. On **dismiss** it is soft-deleted *and remembered*, so the next sweep suppresses the same cohort instead of re-proposing it. Start human-confirmed (the notification in the mock is high-stakes); graduate specific high-precision cohort types to auto-confirm as trust accrues.

### After confirmation: recurrence is tracked for free

Discovery ends at **detect + diagnose**; it does not author fixes (Latitude does not run or own the prompt). But once a discovered signal is confirmed, the materialized substrate already answers "did it get better?" with no extra machinery: the signal's going-forward occurrences are the prevalence over time, and if the customer addresses the failure on their side, the count falls — while any recurrence fires the default monitor's `event.regressed` alert. The value chain is **detect → diagnose → (customer acts) → measure**, and only the first two steps are new; measurement is the monitor that every signal already gets.

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
      ├─ per signal: value = max(chunk · positiveAnchor); matched when
      │    value ≥ signal.threshold AND best-positive − best-contrast ≥ margin
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
   │    metric.escalating 'expected' alert + event.regressed alert — same
   │    monitoring issues get today)
   └─ start Temporal optimize-evaluation, workflow id evaluations:generate:${signalId}  [reuse]
      └─ generates + aligns the evaluation; persists with evaluations.signal_id
frontend polls getSignalAlignmentState (Temporal workflow.describe())           [reuse shape]
```

### C. Annotating against existing signals (the human suggestion path)

Annotation is the *human* path; automatic discovery (flow G) is the machine path. When a user annotates, the UI *suggests* existing signals via hybrid search; the user links explicitly or creates a new signal — annotations never spawn signals on their own.

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
   │    tool          → ToolCallReader (CH execute_tool spans by tool_name;     [reuse shape]
   │                      per-bucket call/error counts + latency aggregates —
   │                      ToolAnalyticsRepository already computes these)
   │    traces/spans/sessions → telemetry readers                               [reuse]
   ├─ compute metric series (count / avg / sum / p95 per bucket)
   └─ per active alert, run the kind's state machine:
        event.matched      → point incident per throttle window with ≥1 event   [reuse shape]
        event.regressed    → datapoint after monitor.resolved_at → point incident,
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
regression → flow D, event.regressed branch
```

### F. Create signal from a saved search (with backfill)

```
UI: saved-search row / traces page → "Create signal from this search"
└─ opens the signal builder pre-filled:
   ├─ scope            ← the search's filterSet
   ├─ semantic prompt  → semantic matcher (anchors seeded from the prompt)
   └─ lexical phrases  → rule matcher (contains conditions)
└─ createSignalUseCase { origin: 'user' } + provisionDefaultMonitorUseCase
└─ enqueue signals:backfill { signalId, window: 14d }   (rule/script matchers only)
   └─ backfillSignalOccurrencesUseCase: evaluate the definition over historical
      traces in batches → SignalOccurrenceRepository.append
saved_searches row remains (still a bookmark; plain filter tracking stays
  saved search + monitor — decision 4)
```

### G. Automatic discovery (proposes signals from traffic)

The machine counterpart to flow C. Runs on the discovery clock (batch/periodic), not write-time. See "Discovery" for the conceptual loop; this is the callstack.

```
cron + leading-edge: signals:discover (per project; impact-prioritized, sampled, budgeted)
└─ runDiscoverySweepUseCase (@domain/signals)
   ├─ gatherAttentionTraces     moments + outcome anomalies + resource outliers + structural   [reuse]
   ├─ formCohorts               content cohorts: pool trace_search/moment embeddings → taxonomy
   │                              clusterer (spherical k-means)                                  [reuse]
   │                            structural cohorts: ordered tool-seq / span-tree fingerprint     [new]
   ├─ per cohort:
   │   ├─ characterizeCohort     LLM analyst → falsifiable hypothesis + draft matcher + severity
   │   ├─ validateCandidate      compile matcher → backfillSignalOccurrencesUseCase over window
   │   │                           → prevalence + precision vs samples; tighten loop            [reuse]
   │   ├─ analyzeRootCause       affected-vs-unaffected differential + read affected spans'
   │   │                           system_instructions + tool_definitions → explanation (no fix)
   │   └─ suggestSignalsUseCase  hybrid dedup vs existing signals (search_document + embedding)  [reuse]
   └─ above impact bar → createSignalUseCase { origin: 'discovered', status: 'proposed' }
        + persist signals.discovery (RCA explanation, sample trace ids, validation stats)
        → notifications:request-discovery-notification (a NEW notification kind — a proposal is
            not an incident; Slack / in-app)                                                     [new]
user action (signal page / notification):
  ├─ confirm  → confirmSignalUseCase: status='confirmed' + provisionDefaultMonitorUseCase
  └─ dismiss  → dismissSignalUseCase: soft-delete + remember cohort to suppress re-proposal
(recurrence after the customer acts is tracked for free by the default monitor's event.regressed)
```

## Why signal membership is materialized at write time

**1. Semantic search answers a different question than filters do.** A filter is a per-row yes/no ("is this trace from the last 7 days?") — each row passes on its own merits, so filters stack for free. Semantic search with a vector index answers "the ~1,000 items *most similar in the entire corpus*". Combine them and the filter can only discard from those 1,000: searching "user frustration" + filtering "last 7 days" returns *whichever of the corpus-wide top-1,000 happen to be recent* — maybe 30 results, maybe 0 — while thousands of genuinely frustrated traces from this week sit at #5,000 in the global ranking and are never returned. Doing it correctly means scoring every trace in the window: a full scan, which is why semantic trace search already times out on large projects.

**2. Tracking over time multiplies that cost forever.** Example: a semantic search "user frustration" with an alert when the last-5-minutes match count exceeds 1σ above its historical average. The 5-minute count is cheap; but μ and σ require the match count of *every historical bucket* — the semantic verdict for every trace in the corpus — recomputed on every evaluation, 288 times a day, even though each trace's verdict is frozen the moment it arrives. The only fix is "score each trace once, on arrival, and remember the result", which **is** write-time materialization; every caching scheme converges to it. Approximations don't help: a σ computed from undercounted buckets makes alerts fire on index noise.

Consequences carried through the whole spec:

- Query-time semantic search remains an **exploration** tool: a ranked best-effort sample on the Traces page. No counts, no histograms, no alerts over a semantic query.
- Anything that needs **set** semantics — charts, baselines, alerts, "every matching trace" — must be a signal, whose membership is decided per trace at ingest and appended to an immutable occurrence stream.
- A materialized history is immutable under definition edits: editing a signal changes membership *going forward* only (the chart gets a definition-changed marker). The "editing a virtual signal rewrites its history" policy problem disappears.
- Occurrences become the universal counting unit (one occurrence = one matched trace), resolving today's inconsistency where issues count scores and saved searches count traces.

## Decisions

Settled during the design discussion (LAT-664 + spec review):

1. **Signal membership is materialized at write time** (see "Why signal membership is materialized at write time" — forced, not a preference).
2. **Discovery proposes signal definitions; it does not auto-create monitored signals.** The new discovery pipeline (see "Discovery") is an automated analyst: multi-modal attention sourcing → behavioral cohorts → LLM characterization → matcher validation → RCA. It creates signals with `origin = 'discovered'`, `status = 'proposed'` — concrete, materializable definitions, not fuzzy buckets. A proposal has no monitor, never notifies, and is excluded from the active-signal cap until confirmed (by a human, or by an auto-confirm policy above a high-precision bar). Users still create signals directly too (Signals page, saved search, annotation flow). Annotations are matched to *existing* signals via hybrid search; they never spawn signals on their own.
3. **No centroid mechanism.** The old discovery mechanism — annotation feedback → embedding → per-signal decayed centroid auto-creating issues from scores — is removed entirely. Discovery is rebuilt on LLM characterization + materialized validation (decision 2), and suggesting existing signals while annotating uses hybrid search over signal names/descriptions (lexical tsvector + one derived embedding) — no centroids anywhere.
4. **No pure filter-type signals.** Plain filter slices are correct and cheap at query time, so they stay **saved searches + monitors**. Signals exist for matchers that *require* write-time evaluation (semantic, evaluation, rule, script). Filters appear on signals only as the **scope** pre-gate.
5. **Signals per project are capped** to a fixed number per plan (this also bounds occurrence write amplification and ingest matching cost).
6. **Scores are kept with a narrowed role** — they stop being the membership mechanism and remain the verdict ledger: evaluation pass/fail/error analytics, human-feedback ground truth for alignment, and the public `/scores` API (rationale under the occurrences table).
