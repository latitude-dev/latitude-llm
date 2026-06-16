# Signals

> **Documentation** — eventual durable homes: `dev-docs/signals.md` (new) and an updated `dev-docs/monitors.md`. Related current docs: `dev-docs/issues.md`, `dev-docs/scores.md`, `dev-docs/notifications.md`, `dev-docs/conversation-intelligence.md`, `dev-docs/evaluations.md`.
>
> **Depends on** — `specs/sandbox-runtime.md`, the execution contract for `llm_as_judge` and `script` trackers: a tracker run returns `Score(value, feedback?)` where `value` is signal-exhibition strength, and the host derives membership as `value >= tracker.threshold`. Phases 0–1 of that spec are built; Phase 2 (rule/script codegen + dry-run harness) is the substrate this spec consumes.
>
> **Supersedes (conceptually)** — `specs/monitors.md` and `specs/alerts.md`. Those specs still accurately describe what is *currently built*; this spec defines the model that replaces their framing. Do not retire them until the migration phases are underway.
>
> **Origin** — LAT-664 ("Consolidate monitor situation"), extended through spec review into the **trackers** model below. This revision reverses two stances of the original spec (no automatic discovery, separate occurrence ledger) — see [Decisions](#decisions).

## Contents

1. [Purpose](#purpose) — the problem and the consolidated model
2. [Why membership is materialized at write time](#why-membership-is-materialized-at-write-time) — the foundational argument
3. [Concepts](#concepts) — Signal, Tracker, Score, Monitor, Alert, Incident
4. [Discovery: sinks and promotion](#discovery-sinks-and-promotion)
5. [The matching pipeline](#the-matching-pipeline)
6. [Main flows](#main-flows)
7. [Data model](#data-model) — schemas, enums, and types
8. [UI](#ui)
9. [API / SDK / MCP](#api--sdk--mcp)
10. [Migration](#migration)
11. [Decisions](#decisions)
12. [Tasks](#tasks)

---

## Purpose

Latitude has two parallel tracking systems with overlapping names and separate UIs:

- **Issues** — auto-created buckets of failed or annotated scores, monitored invisibly.
- **Monitors** — user-configured alerts over **Saved Searches**.

This spec consolidates both around one small set of concepts:

```
                tracker runs at ingest        monitors aggregate         alerts fire on        records the
                (or annotation lands)         the score stream           conditions            firing
  Trace ──────▶ SIGNAL ─────────────────────▶ MONITOR ─────────────────▶ ALERT ──────────────▶ INCIDENT ──▶ notifications
                membership = its SCORES        (a metric over the
                (write-time materialized)       signal's scores/traces)
```

The one-line mental model for users and docs:

> Latitude groups your traces into **Signals** — buckets you define with a **Tracker** (an LLM judge, a script, or semantic similarity), plus the buckets Latitude discovers for you automatically from annotations. A signal's members are its **Scores**. Any signal can be watched with a **Monitor**; monitors have **Alerts**, and a fired alert opens an **Incident**, which is what notifies you.

Two structural decisions carry the whole spec. Both are stated here and argued in full under [Why membership is materialized at write time](#why-membership-is-materialized-at-write-time):

1. **A signal's occurrences ARE its scores.** There is no separate occurrence ledger. Every tracker run, every annotation, and every (future) custom push writes a `scores` row carrying `signal_id`. A signal's membership is the subset of those rows that *matched* (`value >= threshold`). This collapses today's inconsistency — issues count scores, saved searches count traces — into one counting unit, and reuses the entire scores pipeline.
2. **Membership is materialized at write time.** A tracker is evaluated against each in-scope trace once, on arrival, and the verdict is frozen as a score. This is forced by the cost model, not a preference.

## Why membership is materialized at write time

Both foundational decisions follow from a single constraint: counting and alerting over *semantic* membership is only affordable if each trace's verdict is computed once, on arrival, and remembered.

**1. Semantic search answers a different question than filters do.** A filter is a per-row yes/no — each row passes on its own merits, so filters stack for free. Semantic search with a vector index answers "the ~1,000 items *most similar in the entire corpus*". Combine them and the filter can only discard from those 1,000: "user frustration" + "last 7 days" returns *whichever of the corpus-wide top-1,000 happen to be recent* — maybe 30, maybe 0 — while thousands of genuinely frustrated traces from this week sit at #5,000 globally and are never returned. Counting correctly means scoring every trace in the window: a full scan (which is why semantic trace search already times out on large projects).

**2. Tracking over time multiplies that cost forever.** An alert on "last-5-minutes match count vs its historical average" needs μ and σ over *every historical bucket* — the verdict for every trace in the corpus — recomputed on every evaluation (288×/day), even though each trace's verdict is frozen the moment it arrives. The only fix is "score each trace once, on arrival, and remember it" — which **is** write-time materialization.

**3. "Occurrences are scores" is the cheap way to remember it — given the existing PG/CH split.** The objection to storing membership in `scores` is write amplification through the canonical mutable Postgres path. But `scores` is *already* a Postgres-canonical + ClickHouse-analytics split, and the rules already say immutable scores skip straight to ClickHouse. A pure-tracker match is immutable by construction (a value, no feedback, nothing to draft), so it goes **ClickHouse-only** and never touches Postgres. Mutable membership (judge feedback, human/flagger annotations) is bounded (sampled / human-paced) and takes the canonical path as it does today. So one ledger scales without a second table.

These consequences carry through the rest of the spec:

- Query-time semantic search remains an **exploration** tool: a ranked best-effort sample on the Traces page. No counts, histograms, or alerts over a semantic query — a banner says so, with "create a signal" as the path to set semantics.
- Anything needing **set** semantics — charts, baselines, alerts, "every matching trace" — must be a signal whose tracker decides membership per trace at ingest.
- History is immutable under definition edits: editing a tracker changes membership *forward only* (a definition-changed marker). The "editing a virtual signal rewrites its history" problem disappears.

## Concepts

### Signal

**A signal is a tracked bucket of traces.** Its members are the traces with a *matching* score for that signal. A signal has:

- an **origin**: `user` (built deliberately by a person) or `system` (auto-created by Latitude — see [Discovery](#discovery-sinks-and-promotion)). Origin is the differentiator between hand-built and discovered signals.
- an optional **`filters`** (a `FilterSet`): a cheap, row-local pre-gate restricting which traces the tracker is even run against ("only `service = checkout`", "only traces above p90 latency"). Empty/absent = all traces. `filters` is only meaningful alongside a tracker — it gates tracker execution.
- an optional **`tracker`** (a jsonb column, **one per signal**): the membership detector run at write time. A `NULL` tracker means a **sink** — no write-time detection, with membership coming only from annotations. This is how discovered signals work.
- **triage metadata**: priority and a single assignee, carried over from issues (multi-assignee deferred).
- a **lifecycle**: `resolved` / `ignored` / `escalating` etc., carried over from issues **unchanged for the MVP**. It stays on the signal row; it is not relocated onto a monitor.

Constraints:

- **Users cannot create a tracker-less signal.** A `user`-origin signal must have a tracker. Tracker-less (`NULL`) signals exist only as `system`-origin sinks. This deliberately keeps "plain filter slices" out of signals — those stay **saved searches**. (A broad `filters`-only signal would write a score per trace; banning user-created tracker-less signals removes that footgun entirely.)
- **One tracker per signal.** A bucket has at most one detector. A concept that needs two detectors — e.g. semantic *and* judge for "frustration" — is one signal that gets *promoted* from one tracker to another, or two signals. It is never one signal with two trackers.

### Tracker

**The write-time detector embedded on a signal** — `signals.tracker` (jsonb, discriminated by `type`), at most one per signal. Three types: `semantic_similarity`, `script`, and `llm_as_judge`. Their shapes are defined once in [Data model → Shared contracts](#shared-contracts-domainshared-domainscores).

- **`semantic_similarity`** and **`script`** are **pure** detectors — deterministic, no `feedback`. `script` runs through the sandbox runtime (`specs/sandbox-runtime.md`); `semantic_similarity` runs through the native batch anchor runner (the conversation-intelligence path), not the sandbox. The semantic detector value is `max(chunk · positiveAnchor)`, and a trace matches only when the best positive anchor also beats the best contrast anchor by `margin`. This multi-anchor + contrast + margin shape is proven in production for conversation-intelligence moment labels and is adopted wholesale, generalizing those labels' static per-kind gate into the uniform per-tracker `threshold`.
- **`llm_as_judge`** is **not** stored inline. Its config is an `evaluations` row linked by `evaluations.signal_id` (1:1); the tracker jsonb records only `{ type, threshold }`. The judge script, alignment state, and `optimize-evaluation` workflow stay in `@domain/evaluations` exactly as today. Users can author a judge tracker directly (judge criteria → compiled to a backing evaluation linked to the signal), and alignment ground truth then accrues as annotations arrive on the signal. The same tracker type *also* arises automatically via the sink → promotion path ([Discovery](#discovery-sinks-and-promotion)); both paths land on the same backing-evaluation shape.
- A tracker's **`threshold`** is the membership cutoff over the detector value, per `specs/sandbox-runtime.md` (semantic emits continuous similarity; judges emit ≈{0,1}; scripts emit whatever they compute). Threshold and definition edits apply **forward only** — a definition-changed marker appears on charts, and existing scores are never re-evaluated.

### Score — the membership ledger

**A signal's occurrences are its scores.** Every membership-bearing event writes a `scores` row carrying `signal_id`; nothing else records membership. A score's `source_type` is one of `tracker`, `flagger`, `user`, or `custom` (enum in [Data model](#shared-contracts-domainshared-domainscores)).

- **Membership is the matched subset.** A trace is a member of a signal when it has a score for that signal with `value >= threshold`. (A judge "exhibits" the behavior at `passed:false` under today's problem-detector polarity; this is normalized to exhibition at migration.) The signal's occurrence count is exactly that subset.
- **Non-matches are written too**, consistent with how evaluations already persist both `passed:true` *and* `passed:false`: a tracker writes a score on **every** run, matched or not. The matched rows are occurrences; the non-matched rows give exact pass-rate, denominators, and dashboards without read-time estimation. *(Lever, if pure-tracker non-match volume ever hurts: switch pure trackers to match-only and compute the denominator from `filters` over traces at read time. The MVP default is write-both.)*
- **The write path routes by mutability**, reusing the existing scores PG/CH split (`dev-docs/scores.md`):

  | Score | Mutable? | Store |
  | --- | --- | --- |
  | `tracker` / `llm_as_judge` (pass + fail; has `feedback`; sampled → bounded) | yes (feedback) | Postgres-canonical + ClickHouse, as today |
  | `tracker` / `semantic_similarity` · `script` (matched + non-matched; no feedback; runs per in-scope trace) | no | **ClickHouse-analytics only** (immutable, skip the canonical Postgres row) |
  | `user` / `flagger` annotation (draftable, editable) | yes | Postgres-canonical + ClickHouse, as today |

Pure-tracker scores carry `signal_id` at write time, so they are immutable on arrival and go straight to ClickHouse — they never push trace-volume writes through the canonical mutable Postgres path. This is the mechanism that makes "occurrences are scores" scale; see [Why membership is materialized at write time](#why-membership-is-materialized-at-write-time).

### Monitor

**A monitor watches one signal over time.** Monitors never own detection — that lives on the signal's tracker. A monitor owns:

- a **target**: a signal (`monitors.target_signal_id` = signal CUID). Saved-search and raw-stream targets remain available via the existing `target_*` columns; this spec focuses on signal targets. Saved searches stay the home for plain filter tracking — `SavedSearchMatchReader` is reused unchanged.
- a **metric** (`MonitorMetric`, already exists): `count` of matching scores (default), `errorRate`, or `avg`/`p95`/`sum` of `duration`/`cost`/`tokens`. Field aggregates read the matched traces (`score.trace_id → traces`); the score's own cost/tokens are the *judge's*, not the trace's.
- **mute** (`muted_at`): notifications off; evaluation and incident recording continue.

Every signal gets a **default monitor** provisioned at creation — the occurrences (`count`) monitor carrying the same alerts issues get today: a high-severity `metric.escalating` alert in `expected` mode plus an `event.regressed` alert.

### Alert

**A condition on a monitor.** Two flavors (Sentry-shaped, carried over from the monitors model):

- **Event alerts** — `event.matched` (a new matching score entered the signal) and `event.regressed` (a datapoint after the monitor's resolve anchor).
- **Metric alerts** — `metric.threshold` (absolute / multiplier / expected) and `metric.escalating` (sustained).

The two unrelated "is this escalating?" implementations — the issue seasonal detector over score counts, and the saved-search bucketed sustained-gate over trace-match counts — **merge into one** `metric.escalating` evaluator: every monitor target now yields the same *per-bucket count series → per-bucket threshold → open/close state machine* shape. The seasonal detector (`evaluateSeasonalEscalation`) survives as the threshold function of `expected` mode (knob: `sensitivity`); issue escalation stops being special — it is the default monitor's escalating alert in that mode.

### Incident

**Unchanged.** Same `alert_incidents` lifecycle (point vs sustained), backtracked `started_at`/`ended_at`, and notifications pipeline (`incident.event` / `incident.opened` / `incident.closed`). Incidents snapshot the firing alert's `condition`, and additionally snapshot the monitor's **target definition** at open time so closed incidents stay self-describing after edits.

## Discovery: sinks and promotion

Automatic discovery is **kept**, reframed: it produces **sink signals** (origin `system`, no tracker), not a separate entity. The flagger + annotation machinery is unchanged.

```
flaggers (trace-end) + human annotations
   └─ each writes an annotation score (source_type = 'flagger' | 'user')
   └─ discovery routes the score (centroid + hybrid search + locked serialization, UNCHANGED):
        ├─ to an existing sink signal      → +1 occurrence
        └─ or creates a new sink signal    → origin 'system', tracker NULL
   └─ once a sink has enough evidence, the user can PROMOTE it:
        └─ generate an llm_as_judge tracker from its accumulated annotations
           (today's "Monitor issue" → optimize-evaluation; deterministic workflow id
            evaluations:generate:${signalId})
        └─ the signal's accumulated annotation scores become the alignment ground truth
           (positives = annotations marked exhibits; negatives = passing-annotated-elsewhere
            traces; zero-annotation traces excluded — the alignment set is built from
            annotations, and the judge is re-run against it, exactly as today)
        └─ the signal now auto-detects forward; old annotation occurrences stay, the judge
           adds tracker-sourced ones
```

So a signal's life is **sink (annotation-fed) → optionally promoted to a tracker (detector-fed)**, with identity and occurrence history preserved across the promotion. This is the bridge between auto-discovery and the hand-built trackers; it reuses the entire existing discovery + `optimize-evaluation` + alignment machinery.

**Annotation assignment is allowed exactly on tracker-less (sink) signals.** A tracker-backed signal is detector-driven; you do not hand-assign traces into it. While annotating, the UI suggests existing sinks via hybrid search over `search_document` (lexical) + `centroid_embedding` (the existing discovery path); the user links explicitly or lets discovery route.

## The matching pipeline

Today's write-time machinery is evaluation-oriented (`EvaluationTrigger`: filter / turn / debounce / sampling decides when an evaluation runs). This generalizes into a single **signal matching pipeline** that runs every active *tracked* signal's detector against incoming traces; evaluations become one runner inside it.

- the **filters pre-gate** is shared (one pass per trace over all active signals' `filters`); out-of-gate traces never reach the tracker.
- the **sandbox runner** executes `script` trackers (and `llm_as_judge` trackers' generated scripts) in the shared sandboxed JS runtime.
- the **semantic runner** compares trace content-chunk embeddings (already produced at ingest for trace search and semantic moments) against Redis-cached anchor embeddings — one batch pass over a trace's chunks against all anchor sets.
- evaluation-specific options (`sampling`, `turn`, `debounce`) remain runner-level settings on the backing evaluation, not pipeline concepts.

A run writes a score (matched or not) with `signal_id`, `source_type = 'tracker'`, routed PG/CH per the [Score routing table](#score--the-membership-ledger). Sinks (`tracker IS NULL`) are not in this pipeline — they receive membership only via annotations.

## Main flows

`@domain/signals` is the evolved `@domain/issues` package. Existing machinery reused unchanged is marked `[reuse]`.

### A. Trace ingest → tracker → score

```
span ingestion → ClickHouse spans insert → TracesIngested (outbox)             [reuse]
└─ domain-events dispatcher                                                     [reuse]
   └─ signals:match (queue task, batched per project)
      └─ matchTracesToSignalsUseCase (@domain/signals)
         ├─ SignalRepository.listActiveTracked(projectId)            -- Redis-cached, org-prefixed
         ├─ filters pre-gate per signal (row-local, in-process)
         ├─ script  → sandbox runner
         ├─ judge   → evaluation runner (sampling/turn/debounce on the backing evaluation)
         └─ write score (matched or not) with signal_id, source_type='tracker'
              · pure (script): CH-analytics-only          · judge: Postgres-canonical + CH
      └─ publishes monitors:evaluate (leading-edge throttle, 5 min)             [reuse shape]

semantic trackers (separate hop joining content embeddings produced at ingest): [reuse]
trace_search_embeddings chunks written
└─ signals:semanticMatch (queue task per trace)
   └─ load project anchor sets (Redis-cached, moment-label pattern; includes system moment signals)
   └─ filters pre-gate; per signal value = max(chunk · positiveAnchor); matched when
        value ≥ threshold AND best-positive − best-contrast ≥ margin
   └─ write CH-analytics-only score (matched or not), source_type='tracker'
```

### B. Create a signal manually (user origin, must have a tracker)

```
UI: Signals page / "Create signal from this search" → builder (live preview required)
└─ createSignalUseCase { origin: 'user', tracker, filters? }
   ├─ semantic: embed + Redis-cache anchors
   ├─ script:   compile (sandbox ScriptCompileError rejects at save time)
   ├─ judge:    create backing evaluation (evaluations.signal_id); alignment accrues from annotations
   ├─ provisionDefaultMonitorUseCase (count monitor + metric.escalating 'expected' + event.regressed)
   └─ enqueue signals:backfill { signalId, window: 14d }   (pure trackers only)
```

### C. Annotation → sink routing (auto-discovery)

```
flagger (trace-end) / human annotation
└─ writes annotation score (source_type 'flagger'|'user'), draft/publish as today  [reuse]
└─ ScoreCreated → discovery (centroid + hybrid search + locked serialization)      [reuse]
     ├─ assign to existing sink signal  → +1 occurrence
     └─ create new sink signal { origin: 'system', tracker: NULL }
```

### D. Monitor evaluation → alert → incident → notification

```
triggers: monitors:evaluate (leading-edge throttle) + 5-min sweep cron            [reuse shape]
└─ evaluateMonitorUseCase (@domain/monitors)
   ├─ signal target → SignalScoreReader (CH score-analytics: count where signal_id=? AND passed;
   │    avg/sum/p95 over matched traces via score.trace_id → traces)               [new reader]
   ├─ compute metric series per bucket
   └─ per active alert, run the kind's state machine:
        event.matched / event.regressed / metric.threshold / metric.escalating     [reuse / merge]
└─ alert_incidents insert/close (condition + target_snapshot) → IncidentCreated    [reuse]
   → notifications (mute gate: monitor.mutedAt) → in-app / email / Slack            [reuse]
```

### E. Triage from the signal page

```
[Resolve] → resolveSignalUseCase: signal.resolved_at = now; close open sustained incidents (silent)
[Ignore]  → ignoreSignalUseCase:  signal.ignored_at = now (scores keep recording; nothing notifies)
[Delete]  → deleteSignalUseCase:  soft-delete signal + its monitors; archive backing evaluation;
              enqueue CH score cleanup for the signal
regression → flow D, event.regressed branch
```

### F. Promote a sink to a judge tracker

```
UI: sink signal page → "Start tracking with a judge"
└─ promoteSignalUseCase: set tracker = { type:'llm_as_judge', threshold }
   └─ start optimize-evaluation (workflow id evaluations:generate:${signalId})      [reuse]
      └─ build alignment set from the signal's annotation scores; generate + align the judge;
         persist with evaluations.signal_id
frontend polls getSignalAlignmentState (Temporal workflow.describe())               [reuse shape]
```

## Data model

**No new tables.** Every entity evolves a table that already exists: `issues` → `signals` (rename + columns), `scores` (rename + widened source), `evaluations` (rename), `monitors` (one target column), and the ClickHouse `scores` analytics table (one column). The original spec's `signal_occurrences` table is gone — "occurrences are scores". The unified `event.*`/`metric.*` alert model, `MonitorMetric`, and the `monitors.target_*` columns are **already built** (only `event.regressed` is genuinely new). `legend: ▸NEW ▸CHANGED ▸KEPT ▸DROPPED` is per-line below.

### Shared contracts (`@domain/shared`, `@domain/scores`)

These are the single source of truth for the enums and tracker types referenced throughout the spec.

```ts
// NEW (@domain/shared)
export const SIGNAL_ORIGINS = ["user", "system"] as const
//   user   — hand-built by a person; MUST have a tracker
//   system — auto-created sink / provisioned (may be tracker-less)

export const SIGNAL_TRACKER_TYPES = ["semantic_similarity", "script", "llm_as_judge"] as const
export type SignalTrackerType = (typeof SIGNAL_TRACKER_TYPES)[number]

// tracker config stored inline on the signal row (signals.tracker jsonb), discriminated by type.
// Proven in production for conversation-intelligence moment labels (multi-anchor + contrast +
// margin), adopted wholesale. Semantic detector value = max(chunk · positiveAnchor); membership is
// the uniform per-tracker `threshold`, generalizing moment labels' static per-kind gate:
export type SignalTracker =
  | { type: "semantic_similarity"; semantic: SemanticAnchors; threshold: number }
  | { type: "script";              source: string;            threshold: number }   // sandbox JS
  | { type: "llm_as_judge";        threshold: number }   // detector lives in evaluations.signal_id (1:1)

export type SemanticAnchors = {
  anchors: string[]                  // positive anchor phrases (1..n); best match wins
  contrastAnchors?: string[]         // a trace matches only if best-positive ALSO beats
                                     //   best-contrast by `margin`
  margin?: number                    // required positive-vs-contrast separation (default per constants)
  roles?: ("user" | "assistant")[]   // optionally restrict which turns are compared
}

// CHANGED (@domain/scores): replaces SCORE_SOURCES = ["evaluation","annotation","custom"]
export const SCORE_SOURCE_TYPES = ["tracker", "flagger", "user", "custom"] as const
export type ScoreSourceType = (typeof SCORE_SOURCE_TYPES)[number]
//   tracker — written by the signal's tracker at ingest    (source_id = signal id; judge may keep the evaluation id to preserve evaluation-source dashboards)
//   flagger — automatic flagger annotation                 (source_id = flagger key)
//   user    — human annotation (UI / API / queue)          (source_id = user id / sentinel)
//   custom  — public /scores push  [POST-MVP]              (source_id = caller tag)

// CHANGED (@domain/shared, alert-incident-kinds.ts): ALERT_INCIDENT_KINDS already contains
// event.matched / metric.threshold / metric.escalating (unified, target-on-monitor) plus the
// legacy issue.* / savedSearch.* kinds. The signals migration adds exactly ONE:
//   + "event.regressed"   // a datapoint after the signal's resolved_at clears it; point; no condition; severity high
// and retires issue.* / savedSearch.* once existing monitors migrate to signal targets.

// ALREADY EXISTS (@domain/shared, alert-incident-condition.ts) — reused verbatim:
//   MonitorMetric         = { kind:"count" } | { kind:"errorRate" } | { kind:"avg"|"p95"|"sum"; field:"duration"|"cost"|"tokens" }
//   AlertMetricThreshold  = absolute(value) | multiplier(factor, baseline) | expected(sensitivity)   // + direction above|below
//   metric.threshold / metric.escalating conditions carry { metric, threshold, direction?, window? }
```

### Postgres: `signals` (evolves `issues` in place — keep the rows)

```
signals                                  -- was `issues`
  id                  varchar(24) PK      ▸KEPT
  organization_id     varchar(24)         ▸KEPT  -- RLS org-isolation policy
  project_id          varchar(24)         ▸KEPT
  slug                varchar(128)        ▸KEPT  -- unique per project among non-deleted
  name                varchar(128)        ▸KEPT
  description         text                ▸KEPT
  origin              varchar(16)         ▸CHANGED  -- was `source` varchar(32); now SignalOrigin (user|system)
  tracker             jsonb null          ▸NEW   -- SignalTracker; NULL = sink (membership via annotations only)
  filters             jsonb null          ▸NEW   -- FilterSet pre-gate; only meaningful alongside a tracker
  priority            varchar(16) null    ▸KEPT  -- low|medium|high|urgent
  assignee_id         varchar(24) null    ▸KEPT  -- single assignee, as today (multi-assignee deferred)
  centroid            jsonb null          ▸CHANGED  -- was NOT NULL; now nullable (user-created tracker signals have none)
  centroid_embedding  vector(2048) null   ▸KEPT  -- derived from centroid; sink similarity routing (discovery)
  search_document     tsvector GENERATED  ▸KEPT  -- setweight(name 'A') || setweight(description 'B'); GIN
  clustered_at        timestamptz null    ▸CHANGED  -- was NOT NULL; nullable (only discovery sinks cluster)
  resolved_at         timestamptz null    ▸KEPT  -- lifecycle (MVP: stays on the signal row, not the monitor)
  ignored_at          timestamptz null    ▸KEPT  -- lifecycle
  escalated_at        timestamptz null    ▸KEPT  -- dormant; "escalating" derived from open alert_incidents
  deleted_at          timestamptz null    ▸NEW   -- issues were NOT soft-deleted; signals are (delete flow soft-deletes)
  created_at, updated_at                  ▸KEPT
  -- DROPPED: `uuid` (dormant legacy column)

  unique  (organization_id, project_id, slug)  WHERE deleted_at IS NULL     ▸CHANGED  -- now partial (soft-delete)
  gin     (search_document)                                                 ▸KEPT
  btree   (organization_id, project_id, ignored_at, resolved_at, created_at) WHERE deleted_at IS NULL   ▸KEPT
  btree   (organization_id, project_id)        WHERE deleted_at IS NULL AND tracker IS NOT NULL   ▸NEW  -- "list active tracked signals" (matching pipeline)
```

`semantic_similarity` anchor embeddings are **not** a column — embedded once on save and Redis-cached (org-prefixed key), exactly as moment-label anchors today. Nothing searches anchors via SQL.

### Postgres: `scores` (rename `issue_id`, widen the source)

```
scores
  id, organization_id, project_id                              ▸KEPT
  session_id varchar(128) / trace_id varchar(32) / span_id varchar(16)   ▸KEPT (nullable)
  source_type  varchar(32)   ▸CHANGED  -- was `source`; ScoreSourceType (tracker|flagger|user|custom)
  source_id    varchar(128)  ▸KEPT
  simulation_id varchar(24) null                               ▸KEPT
  signal_id    varchar(24) null   ▸CHANGED  -- was `issue_id`
  value double / passed bool / feedback text / metadata jsonb / error text / errored bool   ▸KEPT
  duration bigint / tokens bigint / cost bigint                ▸KEPT  (ns / count / microcents)
  drafted_at timestamptz null / annotator_id varchar(24) null  ▸KEPT
  created_at, updated_at                                       ▸KEPT
```

- **`passed` IS the materialized membership flag.** The tracker host derives `matched = (value >= tracker.threshold)` at write time and stores it as `passed`; `value` is kept for confidence/sort. So **membership reads need no runtime threshold**: a signal's occurrences are `scores WHERE signal_id = ? AND passed = true`. This is also why threshold edits apply forward-only — old rows keep their frozen `passed`.
- Index renames (same shapes, `issue`→`signal`): `scores_issue_lookup_idx` → `scores_signal_lookup_idx` (`WHERE signal_id IS NOT NULL`), `scores_issue_discovery_work_idx` → `scores_signal_discovery_work_idx`. The canonical idempotency unique index `scores_canonical_evaluation_trace_idx` flips its predicate `source='evaluation'` → `source_type='tracker'`, giving one tracker score per `(source_id, trace)`.
- `custom` source is **POST-MVP**: it requires the public `/scores` API to accept a caller-supplied `signal_id` (today it refuses caller ownership — `dev-docs/scores.md`).

### Postgres: `evaluations` (rename only)

```
evaluations
  signal_id  varchar(24) NOT NULL   ▸CHANGED  -- was `issue_id` NOT NULL; still required (a judge tracker always backs a signal)
  -- name, description, script, trigger, alignment, aligned_at, archived_at, deleted_at, timestamps  ▸KEPT
  index evaluations_signal_lookup_idx (organization_id, project_id, signal_id, deleted_at)   ▸CHANGED (rename)
```

### Postgres: `monitors` (one new target column)

The unified `target_*` + `metric` model already exists; signals just add a target column.

```
monitors
  id, organization_id, project_id, slug, name, description, system   ▸KEPT
  target_stream          varchar(32) null   ▸KEPT  -- MonitorStream (traces|spans|sessions)
  target_filter_set      jsonb null         ▸KEPT
  target_query           text null          ▸KEPT
  target_saved_search_id varchar(24) null   ▸KEPT
  target_signal_id       varchar(24) null   ▸NEW   -- a signal target; signal monitor = this set + metric set, others null
  metric                 jsonb null         ▸KEPT  -- MonitorMetric (already exists)
  is_default             boolean default false   ▸NEW   -- the auto-provisioned per-signal occurrences monitor
  muted_at, deleted_at, timestamps          ▸KEPT

  unique (project_id, slug) WHERE deleted_at IS NULL                          ▸KEPT
  btree  (organization_id, project_id)      WHERE deleted_at IS NULL          ▸KEPT
  partial unique (target_signal_id) WHERE is_default AND deleted_at IS NULL   ▸NEW  -- one default monitor per signal
  btree  (organization_id, target_signal_id) WHERE deleted_at IS NULL         ▸NEW  -- "monitors watching signal X" firing scan
```

### Postgres: `monitor_alerts` (no schema change)

Reused as-is. A signal monitor's alerts use the **unified** kinds — `event.matched`, `event.regressed` (new), `metric.threshold`, `metric.escalating` — with `source_type`/`source_id` **null** (the target is the monitor's `target_signal_id`). `condition` (the `metric.*` variants already carry `{ metric, threshold, direction?, window? }`) and `severity` carry over. The only change is the enum addition above; `event.regressed` joins `KINDS_WITHOUT_CONDITION` (point, no params) and is **not** user-creatable.

### Postgres: `alert_incidents` (no required change)

The unified model already resolves a signal incident's target by joining `monitor_alert_id → monitors.target_signal_id`; `source_type`/`source_id` stay null, `condition` snapshots the firing alert (metric included), and `entry_signals`/`exit_eligible_since`/backtracking carry over. **Optional hardening** (recommended, not required): add `target_snapshot jsonb` so a closed incident stays self-describing if its signal is later deleted — otherwise a deleted signal's closed incidents lose their target label.

### ClickHouse: `scores` analytics (one new column; append-only)

ClickHouse migrations are append-only (`ch:create`), so this is `ADD COLUMN`, not a rename:

```sql
ALTER TABLE scores ADD COLUMN signal_id FixedString(24) DEFAULT '';   -- NEW; backfill = old issue_id via one ALTER UPDATE, then issue_id deprecated
-- `source` (FixedString(32)) now also carries tracker|flagger|user (no migration; values are not enum-constrained).
--   bump skip index idx_source set(3) → set(4) to keep it selective for four values.
-- everything else unchanged: value Float32, passed Bool, errored Bool, duration/tokens/cost UInt64, created_at.
```

- **The CH `scores` table is the single signal counting/aggregate surface** monitors read; it loses its issue-trend special-casing. Occurrence count = `WHERE signal_id = ? AND passed`. Metric aggregates (`avg`/`p95`/`sum` of trace `duration`/`cost`/`tokens`) join the matched `trace_id` back to the traces analytics — the score's own duration/tokens/cost are the *judge's*, not the trace's.
- Pure-tracker scores (semantic/script) are written **CH-only** (immutable on arrival); judge/annotation scores follow today's Postgres-canonical → CH sync.

## UI

### Navigation

A **Signals** nav item replaces **Issues** (single list — hand-built and discovered signals together; `origin` distinguishes them and is a filter/column). Issue URLs (`/projects/$slug/issues/...`) redirect into the corresponding signal pages. **Monitors** stays, generalized to the cross-target operational view.

### Signals list

One table; `origin` (auto/manual), tracker type, priority, assignee, trend, monitors, and last incident are columns/filters on the same surface.

### Signal detail page

Definition (tracker + filters), monitor charts, alerts, incidents, and member traces in one context. Sinks show their annotation evidence and a **Promote** action; judge-backed signals show the linked evaluation/alignment sections (confusion matrix, realign).

### Creating a signal

One builder, three entry points (Signals list, "Create signal from this search", annotation flow), one rule: **never let users define membership blind** — the builder always shows a live preview (a bounded query-time evaluation over recent traces; for `semantic`, an exact scan over a recent window using existing content embeddings; for `script`/`llm_as_judge`, the sandbox dry-run harness against sample traces). The tracker picker offers all three types — **Semantic**, **Script**, and **LLM-as-judge**.

### Creating a monitor

Target = a signal; metric = Occurrences (count) or an aggregate; alerts = the existing card stack. UI/UX copied from today's monitors surface (the tools/users monitor flows).

### Monitors list

Today's dashboard generalized: one row per monitor with a **Target** column (deep-linked to the signal), status (Live / Muted / Resolved / Escalating), metric, and last incident.

## API / SDK / MCP

Signals are exposed as a public REST surface under `/v1/projects/{projectSlug}/signals`, following the **monitors** routes as the template (`defineApiEndpoint`, `createSignalsRoutes` factory, rich `.describe()` field docs that propagate to both the TS SDK and MCP tools; regen via `pnpm openapi:emit` / `pnpm mcp:emit` / SDK generate).

| Method | Path | Operation id |
| --- | --- | --- |
| GET / POST | `/` | `listSignals` / `createSignal` |
| GET / PATCH / DELETE | `/{signalSlug}` | `getSignal` / `updateSignal` / `deleteSignal` |
| GET | `/{signalSlug}/traces` | `listSignalTraces` |
| POST | `/{signalSlug}/resolve`, `/ignore`, `/promote` | `resolveSignal` / `ignoreSignal` / `promoteSignal` |

- `createSignal` accepts a `tracker` of any of the three types (`semantic_similarity`, `script`, `llm_as_judge`) and optional `filters`; rejects tracker-less creation (sinks are system-only).
- Monitors gain `signal` as a target type in their existing API.
- `custom`-source score push (the `/scores` API accepting `signal_id`) is **POST-MVP**.

## Migration

- **Issues → signals, in place.** Rename `issues` → `signals` (keep rows, centroid, embeddings); existing issues become `origin = 'system'` sinks (`tracker = NULL`) — their membership already comes from annotation/evaluation scores. Issue-linked evaluations become `llm_as_judge` trackers (`evaluations.signal_id`; the signal's `tracker` is set to `{ type:'llm_as_judge' }`). `scores.issue_id` → `signal_id`; `source` → `source_type` with the documented mapping.
- **System monitors** become signal monitors (the three `issue.*` system monitors remap to the new `ALERT_KINDS` over signal targets).
- **Semantic moments → default per-project signals** (soft requirement): the eight moment-label kinds (`MOMENT_LABEL_ANCHORS`) are provisioned as `origin = 'system'`, `tracker = { type:'semantic_similarity', semantic: <existing anchors>, threshold: <the kind's static gate> }`. The conversation-intelligence anchor matching becomes the semantic runner of the matching pipeline.
- **Flaggers** stay as the trace-end auto-annotation engine feeding sinks (flow C). Where a flagger overlaps a moment label (e.g. `frustration`), consolidate to **one** signal — prefer the semantic moment-anchor tracker as the canonical detector and retire the overlapping flagger into it (soft requirement). Do not convert all 11 flaggers to trackers for the MVP; most keep feeding sinks via discovery.

## Decisions

### What this revision changed (vs the original LAT-664 spec)

- **Two ledgers → one.** "Occurrences are scores"; the separate `signal_occurrences` table is removed. *(Reverses the original spec's two-ledger decision 6.)* Rationale: [Why membership is materialized at write time](#why-membership-is-materialized-at-write-time).
- **"No automatic discovery" → discovery kept**, reframed as sink signals (`origin = 'system'`, `tracker = NULL`) produced by the unchanged flagger + discovery machinery; centroid/embedding columns stay. *(Reverses the original spec's "no automatic discovery" decision 2.)* Detail: [Discovery](#discovery-sinks-and-promotion).

### Settled choices (each is detailed in the linked section)

1. **Membership is materialized at write time** — forced by the cost model. → [Why](#why-membership-is-materialized-at-write-time)
2. **A signal's occurrences ARE its scores** — membership = scores with `passed = true` (the host freezes `passed = value >= threshold` at write); pure-tracker scores route ClickHouse-only so the single ledger scales. → [Score](#score--the-membership-ledger)
3. **Automatic discovery is kept** as sink signals. → [Discovery](#discovery-sinks-and-promotion)
4. **One tracker per signal, stored as a jsonb column** (`signals.tracker`), not a separate table; three types (`semantic_similarity`, `script`, `llm_as_judge`); there is **no** `annotation_sink` tracker — a sink is simply a tracker-less signal. → [Tracker](#tracker)
5. **Trackers write every run** (matched and non-matched), mirroring how evaluations persist pass and fail today; occurrences are the matched subset. → [Score](#score--the-membership-ledger)
6. **Users cannot create tracker-less signals** — only `system`-origin sinks are tracker-less, which removes the pure-filter write-amplification footgun; `filters` is only a tracker pre-gate; plain filter tracking stays saved searches + monitors. → [Signal](#signal)
7. **Lifecycle stays on the signal row** for the MVP (resolve/ignore/escalating carried over from issues), not relocated onto the default monitor. → [Signal](#signal)
8. **`semantic_similarity` and `llm_as_judge` are user-creatable in the MVP; `script` is post-MVP** (nothing depends on it — see [Tasks](#tasks)). Judge trackers *also* arise automatically from the sink → promotion path, landing on the same backing-evaluation shape. **Custom-source scores** (`/scores` accepting `signal_id`) are POST-MVP.
9. **Signals per project are capped** per plan — bounds tracker matching cost and pure-tracker score write volume.

## Tasks

> **Status legend** — `[ ] pending`, `[~] in progress`, `[x] complete`.
>
> Each phase is an **independently shippable, behavior-preserving deploy**: production keeps working after every phase. Parallelism lives *within* a phase (tasks sharing dependencies run concurrently); phases themselves are mostly sequential, which is the deliberate price of safe incremental rollout. **MVP = Phases 1–4.** Every phase updates the relevant `dev-docs/*` as part of its definition of done (the "remember docs" requirement).
>
> **Incremental-schema note.** The data-model end state above is reached over several phases, not at once. `source_type`'s four values arrive in two steps (Phase 2 adds `tracker`; Phase 9 collapses `evaluation`→`tracker` and splits `annotation`→`user`/`flagger`). Monitoring unifies similarly — discovery-born signals keep the existing issue-event escalation path until Phase 5/9, while custom signals get the new signal-score path in Phase 4. Running two paths temporarily is intentional and non-breaking.

### Phase 1 — Rename Issues → Signals `[MVP]`

**Deps:** none.
**Ships:** the entire current system under the Signals name — discovery, monitors, alerts, notifications behave identically.
**Safe because:** it's a pure rename, no semantics change. Can be stacked PRs (schema+domain → API → web), each keeping the build green; no flag (it's a rename), but coordinate the SDK release.

- [ ] **P1-a** PG rename migration (Drizzle Kit): `issues`→`signals`; `scores.issue_id`→`signal_id`, `evaluations.issue_id`→`signal_id`; rename dependent indexes + `organizationRLSPolicy("signals")`. Column semantics unchanged.
- [ ] **P1-b** CH rename (`pnpm --filter @platform/db-clickhouse ch:create`, append-only): `ALTER TABLE scores ADD COLUMN signal_id FixedString(24) DEFAULT ''`; `ALTER TABLE scores UPDATE signal_id = issue_id WHERE issue_id != ''`; point `score-analytics-repository.ts` + `score-fields.ts` at `signal_id`; keep `issue_id` until Phase 9.
- [ ] **P1-c** Domain rename `@domain/issues`→`@domain/signals`: folder + package name + all imports; `Issue*`→`Signal*` types/ports/use-cases; events `IssueCreated/Regressed/Escalated`→`Signal*`, `ScoreAssignedToIssue`→`ScoreAssignedToSignal`. **Keep internal alert-kind strings `issue.*`** (persisted in `alert_incidents.kind`; renamed in Phase 9) — only relabel `ALERT_INCIDENT_KIND_LABEL`.
- [ ] **P1-d** Platform: `@platform/db-postgres` `issue-repository`→`signal-repository`, schema `issues.ts`→`signals.ts`, mappers.
- [ ] **P1-e** API: `apps/api/src/routes/issues.ts`→`signals.ts`, op ids `listIssues`→`listSignals` etc., mount `/projects/:projectSlug/signals`; keep `/issues` as a deprecated alias to the same handlers; `pnpm openapi:emit && pnpm mcp:emit` + SDK generate.
- [ ] **P1-f** Web: signals routes/pages/`-components`; `ProjectSidebar` nav; `/issues/...`→`/signals/...` redirect; `?issueId=` deep-link redirect.
- [ ] **P1-g** Copy: notification templates + `ALERT_INCIDENT_KIND_LABEL` Issue→Signal wording (email/Slack/in-app).
- [ ] **P1-h** Docs: `dev-docs/issues.md`→`dev-docs/signals.md`; fix references in `monitors.md`/`scores.md`/`reliability.md`; AGENTS.md skill glossary.

**Exit gate:** full suite green; `/issues` URLs + `?issueId=` deep links redirect; SDK back-compat alias resolves; zero behavioral diff.

### Phase 2 — Tracker substrate + custom semantic signals `[MVP]`

**Deps:** P1.
**Ships:** user-created `semantic_similarity` signals; write-time matching populates them; the signal page shows matched traces + occurrence trend. (Alerting on custom signals arrives in P4.)
**Safe because:** it's additive schema + new code behind the `signals` flag; discovery/monitors untouched.

- [ ] **P2-a** Contracts (`@domain/shared`, `@domain/scores`): `SIGNAL_ORIGINS`, `SIGNAL_TRACKER_TYPES`, `SignalTracker`/`SemanticAnchors` zod; rename score `source`→`source_type` and **add value `tracker`** (values `{tracker, evaluation, annotation, custom}`; the `evaluation`→`tracker` collapse + `annotation` split are P9).
- [ ] **P2-b** PG migration (additive): `signals.tracker jsonb null`, `filters jsonb null`, `origin varchar(16)` (backfill existing → `'system'`), `deleted_at` + partial-unique slug; make `centroid`/`clustered_at` nullable; add the `(org, project) WHERE deleted_at IS NULL AND tracker IS NOT NULL` "active tracked" index.
- [ ] **P2-c** Scores CH-only write path (`@domain/scores`): a tracker-score writer that freezes `passed = value ≥ tracker.threshold` and **inserts straight to CH analytics, skipping the canonical Postgres row** for pure trackers — the one genuinely new write path; reuse `syncScoreAnalyticsUseCase`'s CH insert + at-most-once-by-id guard; idempotent per `(signal, trace)`.
- [ ] **P2-d** Matching pipeline skeleton (`@domain/signals` + a `signals:match` worker off `TracesIngested` via the domain-events dispatcher): `matchTracesToSignalsUseCase`, `listActiveTracked(projectId)` Redis-cached (org-prefixed), shared `filters` pre-gate reusing row-local `FilterSet` evaluation. Generalized from `EvaluationTrigger`'s filter stage.
- [ ] **P2-e** Semantic runner (`signals:semanticMatch` per trace, off `trace_search_embeddings`): load per-signal anchor embeddings (Redis-cached, reuse the conversation-intelligence anchor-cache pattern), `value = max(chunk · positiveAnchor)`, match on `value ≥ threshold ∧ bestPos − bestContrast ≥ margin` → CH-only tracker score. Generalize `@domain/conversation-intelligence` anchor matching from fixed `MOMENT_LABEL_ANCHORS` to per-signal anchors.
- [ ] **P2-f** Backfill (`signals:backfill {signalId, window}`): `backfillSignalScoresUseCase` runs the detector over historical traces in batches → CH-only scores; enqueued on semantic-signal create.
- [ ] **P2-g** Builder UI (semantic): `apps/web` signals `-components` — `filters` + anchors/contrast + threshold (sensitivity); **live preview** = bounded exact scan over a recent window using existing content embeddings. Entry points: "New signal", "Create signal from this search".
- [ ] **P2-h** Signal CRUD API + MCP: `createSignal`/`updateSignal`/`deleteSignal` (reject tracker-less create for `origin=user`); MCP/SDK regen. Reuse the monitors route template.

**Exit gate:** create a semantic signal → new in-scope traces produce CH-only tracker scores → visible on the signal page; backfill works; existing signals/discovery unaffected.

### Phase 3 — User-created LLM-as-judge signals `[MVP]`

**Deps:** P2 (substrate only — **not** the semantic runner).
**Ships:** a builder option to author a judge signal (describe the behavior + optional example traces → generated judge), running on the **existing** evaluation execution path.
**Safe because:** it reuses the proven evaluation generation/alignment/execution stack; additive UI.

- [ ] **P3-a** Standalone evaluation creation (`@domain/evaluations`): allow creating an evaluation linked to a fresh signal (not only via issue promotion); set the signal's `tracker = { type:'llm_as_judge', threshold }` and `evaluations.signal_id`.
- [ ] **P3-b** Generation reuse: drive the existing `optimize-evaluation` workflow (`evaluations:generate:${signalId}`) from the builder; with example traces → aligned (reuse `collectAlignmentExamples` + `evaluateDraftAgainstExamples`); without → unaligned start, alignment accrues as annotations land.
- [ ] **P3-c** Builder UI (judge): description + optional example-trace picker (reuse the annotation-flow picker); preview via the sandbox dry-run harness; alignment polled via `workflow.describe()` (reuse `getSignalAlignmentState`).
- [ ] **P3-d** Execution linkage: verify the `EvaluationTrigger` path writes `signal_id`-bearing scores for a user-created (non-discovered) signal; polarity/`passed` normalized to exhibition.

**Exit gate:** create a judge signal → it runs on live traffic via `EvaluationTrigger` → writes signal-linked scores → alignment shows accruing/aligned.

### Phase 4 — Monitors on signals `[MVP]` (hard-req 4)

**Deps:** P2.
**Ships:** alerting on custom (and any) signals; users create monitors targeting a signal with a metric + alerts (tools/users monitor UX copied); each new signal gets a default monitor.
**Safe because:** it's additive monitor columns + a new reader; existing project-level system monitors keep covering discovery-born signals via the existing path.

- [ ] **P4-a** PG migration (additive): `monitors.target_signal_id`, `is_default` + the two indexes.
- [ ] **P4-b** `SignalScoreReader` (`@platform/db-clickhouse`): `count WHERE signal_id=? AND passed`; `avg`/`p95`/`sum` of trace `duration`/`cost`/`tokens` by joining matched `trace_id → traces`; `errorRate`; per-bucket series for the escalation machine. Mirrors `SavedSearchMatchReader`.
- [ ] **P4-c** Signal monitor evaluation: wire signal targets into `evaluateMonitorUseCase`, reusing the unified `event.matched`/`metric.threshold`/`metric.escalating` state machines (`run-*-alert.ts`) over the `SignalScoreReader` series; `metric.escalating` `expected` mode reuses `evaluateSeasonalEscalation`.
- [ ] **P4-d** `event.regressed` kind: add to `ALERT_INCIDENT_KINDS` (+ point lifecycle, no-condition, label, severity); fires on the first datapoint after the signal's `resolved_at` clears (mirror `issue.regressed`, signal-driven).
- [ ] **P4-e** Default monitor provisioning: `provisionDefaultSignalMonitorUseCase` on signal create (count + `metric.escalating` expected + `event.regressed`, `is_default=true`); reuse `provisionSystemMonitorsUseCase` patterns.
- [ ] **P4-f** Monitor-on-signal UI: create/edit (metric + alert card stack, copied from the tools/users monitor flow) on the signal page; monitors-list **Target** column deep-linking to the signal.
- [ ] **P4-g** Monitors API + MCP: signal target on create/update; regen.

**Exit gate:** create a monitor on a signal → metric series computes from signal scores → alert fires → incident + notification.

> **— MVP line: Phases 1–4 —**

### Phase 5 — Unify judge execution onto the tracker pipeline `[POST-MVP · internal]`

**Deps:** P2, P3.
**Ships:** judge execution moved from the standalone `EvaluationTrigger` path into the Phase-2 matching pipeline (shared `filters` pre-gate, one sandbox runner). No user-facing change.
**Safe because:** parity-tested behind a flag, then cut over; retires the temporary two-path state.

- [ ] **P5-a** Run judges through `matchTracesToSignalsUseCase`'s sandbox runner.
- [ ] **P5-b** Parity suite (every stored judge: old path vs pipeline → identical scores).
- [ ] **P5-c** Cut over; remove the standalone trigger path.

**Exit gate:** parity suite green; standalone trigger path removed; no behavioral diff.

### Phase 6 — Script (custom code) trackers `[POST-MVP · last]`

**Deps:** P2 (+ sandbox P2).
**Ships:** the `script` tracker type — raw user JS via the sandbox. Nothing depends on it.
**Safe because:** it's an additive type behind the flag.

- [ ] **P6-a** Finish `specs/sandbox-runtime.md` P2 (dry-run harness + threshold membership) if outstanding.
- [ ] **P6-b** `script` tracker in the matching pipeline (sandbox runner; CH-only pure scores; capability detection — a script calling `llm()` persists like a judge).
- [ ] **P6-c** Builder + MCP authoring: compile-on-save validation (`ScriptCompileError`), dry-run against sample traces, and **surface the sandbox globals** (`conversation`, `llm()`, `z`, `Score/Passed/Failed`) in the MCP tool description (soft-req 1).

**Exit gate:** create a `script` signal → it compiles on save, dry-runs against samples, and produces tracker scores in the pipeline.

### Phase 7 — Moments → default signals `[SOFT]`

**Deps:** P2.

- [ ] **P7-a** Provision the 8 `MOMENT_KINDS` as `origin=system` `semantic_similarity` signals (anchors = `MOMENT_LABEL_ANCHORS`, threshold = each kind's static gate) via the project-provision hook.
- [ ] **P7-b** The semantic runner subsumes the moment-label anchor pass (one matching path).

**Exit gate:** new projects provision the 8 moment signals; moment labeling runs through the semantic runner with no behavioral diff.

### Phase 8 — Flagger consolidation `[SOFT]`

**Deps:** P7.

- [ ] **P8-a** For flaggers overlapping a moment/semantic signal (e.g. `frustration`), make the semantic signal canonical and retire the flagger from `provisionFlaggers`.
- [ ] **P8-b** Non-overlapping flaggers keep feeding sinks via discovery (unchanged).

**Exit gate:** overlapping flaggers retired into their semantic signal; non-overlapping flaggers still feed sinks.

### Phase 9 — Taxonomy cleanup + legacy retirement `[POST-MVP]`

**Deps:** P1–P5.

- [ ] **P9-a** Finish `source_type`: remap `evaluation`→`tracker`, split `annotation`→`flagger` (sourceId=SYSTEM) / `user` (else) (PG + CH backfill).
- [ ] **P9-b** Retire `issue.*` / `savedSearch.*` alert kinds once all monitors run on signal targets (breaking SDK — major bump).
- [ ] **P9-c** Drop deprecated CH `issue_id` and any dormant columns.
- [ ] **P9-d** `/scores` accepts caller-supplied `signal_id` for `custom`-source trackers (the POST-MVP custom-source path).

**Exit gate:** `source_type` fully collapsed to the four-value enum; legacy `issue.*`/`savedSearch.*` kinds and `issue_id` removed; `custom`-source push live.
