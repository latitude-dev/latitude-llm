# Signals

> **Documentation** — eventual durable homes: `dev-docs/signals.md` (new) and an updated `dev-docs/monitors.md`. Related current docs: `dev-docs/issues.md`, `dev-docs/scores.md`, `dev-docs/notifications.md`, `dev-docs/conversation-intelligence.md`, `dev-docs/evaluations.md`.
>
> **Depends on** — `specs/sandbox-runtime.md`, the execution contract for evaluations: an evaluation run returns a normalized score (`value` ∈ [0,1]) and optional `feedback`; the host derives membership by thresholding `value` (`isScoreMatch`, default 0.5). Phases 0–1 of that spec are built; Phase 2 (rule/script codegen + dry-run harness) is the substrate this spec consumes.
>
> **Supersedes (conceptually)** — `specs/monitors.md` and `specs/alerts.md`. Those specs still accurately describe what is *currently built*; this spec defines the model that replaces their framing. Do not retire them until the migration phases are underway.
>
> **Origin** — LAT-664 ("Consolidate monitor situation"). The foundational choices (a signal's occurrences are its scores; membership is materialized at write time) are argued under [Why membership is materialized at write time](#why-membership-is-materialized-at-write-time).

## Contents

1. [Purpose](#purpose) — the problem and the consolidated model
2. [Why membership is materialized at write time](#why-membership-is-materialized-at-write-time) — the foundational argument
3. [Concepts](#concepts) — Signal, Evaluation, Score, Monitor, Alert, Incident
4. [Discovery and tracking](#discovery-and-tracking)
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
                evaluation runs per trace     monitors aggregate         alerts fire on        records the
                (or annotation lands)         the score stream           conditions            firing
  Trace ──────▶ SIGNAL ─────────────────────▶ MONITOR ─────────────────▶ ALERT ──────────────▶ INCIDENT ──▶ notifications
                membership = its SCORES        (a metric over the
                (write-time materialized)       signal's scores/traces)
```

The one-line mental model for users and docs:

> Latitude groups your traces into **Signals** — buckets you define with an **Evaluation** (a script Latitude runs on each trace, typically an LLM-as-judge it generates for you), plus the buckets Latitude discovers for you automatically from annotations. A signal's members are its **Scores**. Any signal can be watched with a **Monitor**; monitors have **Alerts**, and a fired alert opens an **Incident**, which is what notifies you.

Two structural decisions carry the whole spec. Both are stated here and argued in full under [Why membership is materialized at write time](#why-membership-is-materialized-at-write-time):

1. **A signal's occurrences ARE its scores.** There is no separate occurrence ledger. Every evaluation run, every annotation, and every (future) custom push writes a `scores` row carrying `signal_id`. A signal's membership is the subset of those rows that *matched* (`passed = false` — the signal's behavior is present in the trace). This collapses today's inconsistency — issues count scores, saved searches count traces — into one counting unit, and reuses the entire scores pipeline.
2. **Membership is materialized at write time.** A signal's evaluation is run against each in-scope trace once, on arrival, and the verdict is frozen as a score. This is forced by the cost model, not a preference.

## Why membership is materialized at write time

Both foundational decisions follow from a single constraint: counting and alerting over *semantic* membership is only affordable if each trace's verdict is computed once, on arrival, and remembered.

**1. Semantic search answers a different question than filters do.** A filter is a per-row yes/no — each row passes on its own merits, so filters stack for free. Semantic search with a vector index answers "the ~1,000 items *most similar in the entire corpus*". Combine them and the filter can only discard from those 1,000: "user frustration" + "last 7 days" returns *whichever of the corpus-wide top-1,000 happen to be recent* — maybe 30, maybe 0 — while thousands of genuinely frustrated traces from this week sit at #5,000 globally and are never returned. Counting correctly means scoring every trace in the window: a full scan (which is why semantic trace search already times out on large projects).

**2. Tracking over time multiplies that cost forever.** An alert on "last-5-minutes match count vs its historical average" needs μ and σ over *every historical bucket* — the verdict for every trace in the corpus — recomputed on every evaluation (288×/day), even though each trace's verdict is frozen the moment it arrives. The only fix is "score each trace once, on arrival, and remember it" — which **is** write-time materialization.

**3. "Occurrences are scores" reuses the existing scores pipeline — no second table.** Membership could have been a new `signal_occurrences` table; instead it rides `scores`, which already has the infrastructure signals need: a Postgres-canonical record plus a ClickHouse-analytics mirror that counts and aggregates over huge volumes. Counts and trend series come from ClickHouse; the canonical, editable record (drafts, feedback) lives in Postgres. So one ledger serves membership without inventing a second store.

These consequences carry through the rest of the spec:

- Query-time semantic search remains an **exploration** tool: a ranked best-effort sample on the Traces page. No counts, histograms, or alerts over a semantic query — a banner says so, with "create a signal" as the path to set semantics.
- Anything needing **set** semantics — charts, baselines, alerts, "every matching trace" — must be a signal whose evaluation decides membership per trace at ingest.
- History is immutable under definition edits: editing an evaluation changes membership *forward only* (a definition-changed marker). The "editing a virtual signal rewrites its history" problem disappears.

## Concepts

### Signal

**A signal is a tracked bucket of traces.** Its members are the traces with a *matching* score for that signal. A signal has:

- an **origin** (immutable, set at creation): `user` (built deliberately by a person) or `system` (auto-generated by Latitude's discovery — see [Discovery](#discovery-and-tracking)). Origin is the durable record of *how the signal was created*, independent of whether it has an evaluation, and it does **not** change when a discovered signal is later tracked with an evaluation. It is what gates annotation assignment — see [Discovery](#discovery-and-tracking).
- an optional **`filters`** (a `FilterSet`): a cheap, row-local pre-gate restricting which traces the evaluation is even run against ("only `service = checkout`", "only traces above p90 latency"). Empty/absent = all traces. `filters` is only meaningful alongside an evaluation — it gates evaluation execution.
- an optional **`evaluation`** (an `evaluations` row linked 1:1 via `evaluations.signal_id`, **one active per signal**): the membership detector, run at write time. With no linked evaluation there is no write-time detection — membership comes only from annotations. Having or not having an evaluation is a *state*, not a kind: a system-created signal starts with no evaluation and can later gain one (when tracked) while keeping `origin = 'system'`. Tell auto-generated from hand-built by `origin`, never by the presence of an evaluation.
- **triage metadata**: priority and a single assignee, carried over from issues (multi-assignee deferred).
- a **lifecycle**: `resolved` / `ignored` / `escalating` etc., carried over from issues **unchanged for the MVP**. It stays on the signal row; it is not relocated onto a monitor.

Constraints:

- **Users cannot create an evaluation-less signal.** A `user`-origin signal must have an evaluation; only `system`-origin signals may have none. Because `origin` is fixed at creation, a `system` signal that is later tracked keeps `origin = 'system'` — and stays annotation-assignable — even though it now has an evaluation. This deliberately keeps "plain filter slices" out of signals — those stay **saved searches**. (A broad `filters`-only signal would write a score per trace; banning user-created evaluation-less signals removes that footgun entirely.)
- **One evaluation per signal.** A bucket has exactly one *active* detector evaluation (archived predecessors are kept for lineage across re-tracking / re-optimization, but only one is live). A concept that needs two detectors — e.g. semantic *and* judge for "frustration" — is one signal re-tracked with a different evaluation, or two signals. It is never one signal with two active evaluations.

### Evaluation (the detector)

**A signal's membership detector is an `evaluations` row**, linked 1:1 via `evaluations.signal_id` — exactly one active evaluation per signal. **An evaluation is always a script** that runs in the shared QuickJS sandbox (`specs/sandbox-runtime.md`); there is no detector taxonomy and no second engine. Its shape is defined once in [Data model → Shared contracts](#shared-contracts-domainshared-domainscores).

- **One engine, three ways to author the same script.** Every evaluation produces one `script` artifact, and that is exactly what executes: write it from a declarative **`settings`** object (compiled **deterministically** by a settings→script compiler **built in Phase 2/PR2** — no such codegen pre-exists; the option shapes are defined as the builder grows), generate and align it with **GEPA** (`optimize-evaluation`), or hand-write a **raw** script (advanced). `settings` is optional (NULL for a raw or GEPA-generated script); `script` is always present.
- **A judge is just a script that calls `llm()`.** "LLM-as-judge" is not a distinct type — it is the common case of a generated script whose body calls `llm()` (`const result = await llm(\`…\`, { schema }); return result.passed ? Passed() : Failed()`), running on the sandbox behind the `evaluation-sandbox-runtime` flag exactly as today. The `optimize-evaluation` workflow and alignment state (`alignment`/`aligned_at`) apply to these judge scripts; both arise when a user authors a judge directly (criteria → generated/aligned script) and via the discovery → tracking path ([Discovery](#discovery-and-tracking)), and are NULL for scripts that never call `llm()`.
- **The script returns a score and optional reasoning; the host derives the verdict.** Each run yields `value` (a normalized score ∈ [0,1], for sort/confidence/display) and optional `feedback`; the host derives membership by thresholding `value` (`isScoreMatch` against `DEFAULT_SCRIPT_SCORE_THRESHOLD` = 0.5). Definition edits (script or settings) apply **forward only** — a definition-changed marker appears on charts, and existing scores are never re-evaluated.
- **Type is a property of the `settings`, not the script.** A script can mix `llm()`, deterministic checks, and (later) semantic similarity, so an arbitrary script has no single type. The type lives in the **`settings`** of templated evaluations and drives the builder form; raw and GEPA-generated scripts are simply custom. "How many evaluations use `llm()` / semantic / code" is a separate, **multi-valued capability** question — answered by inspecting what the script does, not by a single type label (post-MVP analytics).
- **Every score is stored the same way.** There is no per-type or per-capability storage split: every evaluation's scores go to Postgres (canonical) and ClickHouse (analytics), exactly like annotations (see [Score](#score--the-membership-ledger)).

> **Semantic similarity is a future capability, not an MVP type.** Today's conversation-intelligence anchor matching is *not* yet expressed as an evaluation. A future phase adds it — most likely as a `similarity()`/`embedding()` host function the script can call (with a possible native batch-runner optimization), its exact shape deferred until then (see [Tasks → Phase 7](#phase-7--semantic-similarity-evaluations-future)). Until then, every evaluation is a sandbox script as above.

### Score — the membership ledger

**A signal's occurrences are its scores.** Every membership-bearing event writes a `scores` row carrying `signal_id`; nothing else records membership. A score's `source_type` is one of `evaluation`, `flagger`, `user`, or `custom` (enum in [Data model](#shared-contracts-domainshared-domainscores)).

- **Membership is the matched subset.** A trace is a member of a signal when it has a score for that signal with `passed = false` — the original problem-detector convention, where `passed = false` means the signal's behavior is *present* (an occurrence) and `passed = true` means absent/not-exhibited. The host derives `passed` by thresholding the script's `value` (`isScoreMatch`), so membership reads gate `passed = false`. (Phase 2's engine cutover briefly inverted this to `passed = true` = present; that polarity inversion was **reverted** — see [Tasks → Phase 2](#phase-2--evaluation-substrate--script-evaluations-mvp).) The signal's occurrence count is exactly that subset, counted as **distinct `trace_id`** per signal — so a trace touched by successive evaluation generations (after the signal is re-tracked or re-optimized into a new evaluation id) counts once, matching the per-`(signal, trace)` monotone-membership guarantee in `specs/sandbox-runtime.md`.
- **Non-matches are written too**, consistent with how evaluations already persist both `passed:true` *and* `passed:false`: an evaluation writes a score on **every** run, matched or not. The matched rows are occurrences; the non-matched rows give exact pass-rate, denominators, and dashboards without read-time estimation.
- **Every score is stored the same way** — written to Postgres (the canonical, mutable source of truth) and synced to ClickHouse (the analytics mirror monitors count over), reusing the existing scores pipeline (`dev-docs/scores.md`). There is **no per-type or per-capability storage split**: judge scores, deterministic-script scores, and annotations all persist identically. The only nuance is the existing draft lifecycle — a *mutable* score (a drafted annotation) stays Postgres-only until published, then syncs; an evaluation run (or a confirmed annotation) is immutable and is written + synced on arrival.

  *(Scale lever, not the MVP: if deterministic scripts that run on every trace ever strain the canonical path, those recomputable, feedback-free scores could go ClickHouse-only — a future per-run optimization, never a rule about evaluation kinds.)*

### Monitor

**A monitor watches one signal over time.** Monitors never own detection — that lives on the signal's evaluation. A monitor owns:

- a **target**: a signal (`monitors.target_signal_id` = signal CUID). Saved-search and raw-stream targets remain available via the existing `target_*` columns; this spec focuses on signal targets. Saved searches stay the home for plain filter tracking — `SavedSearchMatchReader` is reused unchanged.
- a **metric** (`MonitorMetric`, already exists): `count` of matching scores (default), `errorRate`, or `avg`/`p95`/`sum` of `duration`/`cost`/`tokens`. Field aggregates read the matched traces (`score.trace_id → traces`); the score's own cost/tokens are the *evaluation's* (an llm judge's; zero for scripts that don't call `llm()`), not the trace's.
- **mute** (`muted_at`): notifications off; evaluation and incident recording continue.

Every signal gets a **default monitor** provisioned at creation — the occurrences (`count`) monitor carrying the same alerts issues get today: a high-severity `metric.escalating` alert in `expected` mode plus an `event.regressed` alert.

### Alert

**A condition on a monitor.** Two flavors (Sentry-shaped, carried over from the monitors model):

- **Event alerts** — `event.matched` (a new matching score entered the signal) and `event.regressed` (a datapoint after the monitor's resolve anchor).
- **Metric alerts** — `metric.threshold` (absolute / multiplier / expected) and `metric.escalating` (sustained).

The two unrelated "is this escalating?" implementations — the issue seasonal detector over score counts, and the saved-search bucketed sustained-gate over trace-match counts — **merge into one** `metric.escalating` evaluator: every monitor target now yields the same *per-bucket count series → per-bucket threshold → open/close state machine* shape. The seasonal detector (`evaluateSeasonalEscalation`) survives as the threshold function of `expected` mode (knob: `sensitivity`); issue escalation stops being special — it is the default monitor's escalating alert in that mode.

### Incident

**Unchanged.** Same `alert_incidents` lifecycle (point vs sustained), backtracked `started_at`/`ended_at`, and notifications pipeline (`incident.event` / `incident.opened` / `incident.closed`). Incidents snapshot the firing alert's `condition`, and additionally snapshot the monitor's **target definition** (the signal plus a summary of its evaluation — `type`/`settings`/`script`) at open time so closed incidents stay self-describing after an evaluation edit or signal delete.

## Discovery and tracking

Automatic discovery is **kept**, reframed: it produces **system-created signals** (`origin = 'system'`, immutable) that start with no evaluation, not a separate entity. The flagger + annotation machinery is unchanged.

```
flaggers (trace-end) + human annotations
   └─ each writes an annotation score (source_type = 'flagger' | 'user')
   └─ discovery routes the score (centroid + hybrid search + locked serialization, UNCHANGED):
        ├─ to an existing system-created signal      → +1 occurrence
        └─ or creates a new system-created signal    → origin 'system', no evaluation
   └─ once a system-created signal has enough evidence, the user can TRACK it (give it an evaluation):
        └─ generate an llm_as_judge evaluation from its accumulated annotations
           (today's "Monitor issue" → optimize-evaluation; deterministic workflow id
            evaluations:generate:${signalId})
        └─ the signal's accumulated annotation scores become the alignment ground truth
           (positives = annotations marked exhibits; negatives = passing-annotated-elsewhere
            traces; zero-annotation traces excluded — the alignment set is built from
            annotations, and the judge is re-run against it, exactly as today)
        └─ the signal now auto-detects forward; old annotation occurrences stay, the judge
           adds evaluation-sourced ones
```

So a system-created signal's life is **annotation-fed (no evaluation) → optionally tracked with an evaluation (detector-fed)**, with identity and occurrence history preserved across the transition. This is the bridge between auto-discovery and the hand-built evaluations; it reuses the entire existing discovery + `optimize-evaluation` + alignment machinery.

**Annotations can be added only to system-created signals (`origin = 'system'`) — for now.** This is gated on `origin`, not on whether the signal has an evaluation, so a system-created signal that's been tracked keeps accepting annotations (they become its judge's alignment ground truth); a `user`-origin signal is detector-defined and is never hand-annotated into. While annotating, the UI suggests existing system-created signals via hybrid search over `search_document` (lexical) + `centroid_embedding` (the existing discovery path); the user links explicitly or lets discovery route.

## The matching pipeline

Today's write-time machinery is evaluation-oriented (`EvaluationTrigger`: filter / turn / debounce / sampling decides when an evaluation runs). This generalizes into a single **signal matching pipeline** that runs every active signal's evaluation against incoming traces — every evaluation is a script, so there is one runner.

- the **filters pre-gate** is shared (one pass per trace over all active signals' `filters`); out-of-gate traces never reach the evaluation.
- the **sandbox runner** executes the evaluation's `script` in the shared sandboxed JS (QuickJS) runtime — the single execution path for every evaluation (judge scripts call `llm()`; deterministic scripts don't).
- evaluation-specific options (`sampling`, `turn`, `debounce`) are settings on the evaluation row, not pipeline concepts.

A run writes a score (matched or not) with `signal_id`, `source_type = 'evaluation'`, `source_id` = the evaluation id, persisted to Postgres + ClickHouse like any score (see [Score](#score--the-membership-ledger)). Signals with no evaluation are not in this pipeline — their membership comes only from annotations.

*(A future phase adds semantic-similarity detection — likely a `similarity()`/`embedding()` host function the script calls, possibly with a native batch-runner optimization for that case; see [Tasks → Phase 7](#phase-7--semantic-similarity-evaluations-future).)*

## Main flows

`@domain/signals` is the evolved `@domain/issues` package. Existing machinery reused unchanged is marked `[reuse]`.

### A. Trace ingest → evaluation → score

```
span ingestion → ClickHouse spans insert → TracesIngested (outbox)             [reuse]
└─ domain-events dispatcher                                                     [reuse]
   └─ signals:match (queue task, batched per project)
      └─ matchTracesToSignalsUseCase (@domain/signals)
         ├─ listActiveDetectors(projectId)   -- signals with an active evaluation (join evaluations); Redis-cached, org-prefixed
         ├─ filters pre-gate per signal (row-local, in-process)
         ├─ run the evaluation's script  → sandbox runner (sampling/turn/debounce are evaluation settings)
         └─ write score (matched or not) with signal_id, source_type='evaluation', source_id=evaluationId
              · Postgres-canonical + ClickHouse, like any score
      └─ publishes monitors:evaluate (leading-edge throttle, 5 min)             [reuse shape]
```

### B. Create a signal manually (user origin, must have an evaluation)

```
UI: Signals page / "Create signal from this search" → builder (live preview required)
└─ createSignalUseCase { origin: 'user', evaluation: { settings | script }, filters? }
   ├─ compile settings→script (or accept a raw script); sandbox ScriptCompileError rejects at save time
   ├─ judge path: generate the script via optimize-evaluation; alignment accrues from annotations
   ├─ detect capability from the script (does it call llm()?) → execution lane + backfill eligibility (not storage; storage is uniform)
   ├─ provisionDefaultMonitorUseCase (count monitor + metric.escalating 'expected' + event.regressed)
   └─ enqueue signals:backfill { signalId, window: 14d }   (deterministic scripts only)
```

### C. Annotation → discovery routing (system-created signals)

```
flagger (trace-end) / human annotation
└─ writes annotation score (source_type 'flagger'|'user'), draft/publish as today  [reuse]
└─ ScoreCreated → discovery (centroid + hybrid search + locked serialization)      [reuse]
     ├─ assign to existing system-created signal  → +1 occurrence
     └─ create new system-created signal { origin: 'system', no evaluation }
```

### D. Monitor evaluation → alert → incident → notification

```
triggers: monitors:evaluate (leading-edge throttle) + 5-min sweep cron            [reuse shape]
└─ evaluateMonitorUseCase (@domain/monitors)
   ├─ signal target → SignalScoreReader (CH score-analytics: count where signal_id=? AND passed = false;
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
[Delete]  → deleteSignalUseCase:  soft-delete signal (deleted_at) + its monitors; archive its
              evaluation (auto write-stop via the active-detector scan). No CH cleanup —
              deleted-signal scores linger and are excluded read-side via the PG lifecycle.
regression → flow D, event.regressed branch
```

### F. Track a system-created signal with a judge evaluation

```
UI: system-created signal page → "Start tracking with a judge"
└─ trackSignalUseCase: create the signal's evaluation (a generated judge script that calls llm())
   └─ start optimize-evaluation (workflow id evaluations:generate:${signalId})      [reuse]
      └─ build alignment set from the signal's annotation scores; generate + align the judge;
         persist with evaluations.signal_id
frontend polls getSignalAlignmentState (Temporal workflow.describe())               [reuse shape]
```

## Data model

**No new tables.** Every entity evolves a table that already exists: `issues` → `signals` (rename + columns), `scores` (rename + split source), `evaluations` (rename + a `settings` column — the detector now lives here, always as a script), `monitors` (one target column), and the ClickHouse `scores` analytics table (one column). Occurrences are scores — there is no separate occurrence table. The unified `event.*`/`metric.*` alert model, `MonitorMetric`, and the `monitors.target_*` columns are **already built** (only `event.regressed` is genuinely new). `legend: ▸NEW ▸CHANGED ▸KEPT ▸DROPPED` is per-line below.

### Shared contracts (`@domain/shared`, `@domain/scores`)

These are the single source of truth for the enums and evaluation shape referenced throughout the spec.

```ts
// NEW (@domain/shared)
export const SIGNAL_ORIGINS = ["user", "system"] as const
//   user   — hand-built by a person; MUST have an evaluation; never annotation-assignable
//   system — auto-generated by discovery; annotation-assignable, even after it's tracked with an evaluation
// `origin` is set at creation and never changes — the durable "auto-generated?" marker, distinct from the
// mutable "has no evaluation yet" state, and the gate for annotation assignment.
// (POST-MVP: once system-PROVISIONED detector signals exist — e.g. moments, Phase 7 — split `system` into
//  `discovered` vs `provisioned` so provisioned detector signals are not annotation-assignable.)

// An evaluation is ALWAYS a script (evaluations.script) that runs in the QuickJS sandbox
// (specs/sandbox-runtime.md). There is no `type` or `capability` column on the row:
//   - the script returns { value (score 0..1), feedback? }; the host derives membership by thresholding value (isScoreMatch, default 0.5).
//   - type lives in `settings` (templated evals → forms); what a script does (llm/semantic/code) is
//     detected when needed (execution lane, analytics) — not a stored column.
//   - storage is uniform: every score → Postgres (canonical) + ClickHouse (analytics); no store-routing.

// `settings` is the OPTIONAL declarative config a user edits in the builder; it compiles to `script`
// (deterministic codegen for rule-like options, or GEPA generation for a judge) and is NULL when the
// script is hand-written (advanced). Concrete shapes are defined as the builder grows — kept open
// here; the judge case is the first:
export type EvaluationSettings =
  | { kind: "judge"; criteria: string }   // → a script that calls llm(), generated + aligned via optimize-evaluation
  // future kinds that compile to a script: deterministic rule comparators; semantic similarity (Phase 7)

// (Semantic-similarity anchors — positive/contrast/margin/roles — are deferred to Phase 7, where the
//  semantic detector is added as a host function the script can call.)

// CHANGED (@domain/scores): renames SCORE_SOURCES `source`→`source_type` and splits annotation→flagger/user.
// `evaluation` is KEPT (a signal's detector is an evaluation), so existing evaluation-sourced scores need
// no remap or backfill.
export const SCORE_SOURCE_TYPES = ["evaluation", "flagger", "user", "custom"] as const
export type ScoreSourceType = (typeof SCORE_SOURCE_TYPES)[number]
//   evaluation — written by the signal's evaluation at ingest   (source_id = evaluation id)
//   flagger    — automatic flagger annotation                   (source_id = flagger key)
//   user       — human annotation (UI / API / queue)            (source_id = user id / sentinel)
//   custom     — public /scores push  [POST-MVP]                (source_id = caller tag)

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
  origin              varchar(16)         ▸CHANGED  -- was `source` varchar(32); now SignalOrigin (user|system); immutable; gates annotation assignment (system = auto-generated)
  filters             jsonb null          ▸NEW   -- FilterSet pre-gate; only meaningful alongside an evaluation
  priority            varchar(16) null    ▸KEPT  -- low|medium|high|urgent
  assignee_id         varchar(24) null    ▸KEPT  -- single assignee, as today (multi-assignee deferred)
  centroid            jsonb null          ▸CHANGED  -- was NOT NULL; now nullable (user-created evaluation-backed signals have none)
  centroid_embedding  vector(2048) null   ▸KEPT  -- derived from centroid; similarity routing for discovery (system-created signals)
  search_document     tsvector GENERATED  ▸KEPT  -- setweight(name 'A') || setweight(description 'B'); GIN
  clustered_at        timestamptz null    ▸CHANGED  -- was NOT NULL; nullable (only discovered signals cluster)
  resolved_at         timestamptz null    ▸KEPT  -- lifecycle (MVP: stays on the signal row, not the monitor)
  ignored_at          timestamptz null    ▸KEPT  -- lifecycle
  escalated_at        timestamptz null    ▸KEPT  -- dormant; "escalating" derived from open alert_incidents
  deleted_at          timestamptz null    ▸NEW   -- issues were NOT soft-deleted; signals are (delete flow soft-deletes)
  created_at, updated_at                  ▸KEPT
  -- DROPPED: `uuid` (dormant legacy column)

  unique  (organization_id, project_id, slug)  WHERE deleted_at IS NULL     ▸CHANGED  -- now partial (soft-delete)
  gin     (search_document)                                                 ▸KEPT
  btree   (organization_id, project_id, ignored_at, resolved_at, created_at) WHERE deleted_at IS NULL   ▸KEPT
```

The detector is no longer a `signals` column — it is the linked `evaluations` row (one active per signal; a system-created signal may have none). "List active detectors" for the matching pipeline reads `evaluations` (the supporting partial index lives there — see below) and joins back to `signals` to apply signal-level lifecycle gating (`deleted_at`; `resolved`/`ignored` signals still record per [Triage](#e-triage-from-the-signal-page), so they are not excluded here).

(Semantic-similarity anchors and their Redis-cached embeddings are deferred to [Phase 7](#phase-7--semantic-similarity-evaluations-future); the MVP detector is always a sandbox script.)

### Postgres: `scores` (rename `issue_id`, widen the source)

```
scores
  id, organization_id, project_id                              ▸KEPT
  session_id varchar(128) / trace_id varchar(32) / span_id varchar(16)   ▸KEPT (nullable)
  source_type  varchar(32)   ▸CHANGED  -- was `source`; ScoreSourceType (evaluation|flagger|user|custom)
  source_id    varchar(128)  ▸KEPT
  simulation_id varchar(24) null                               ▸KEPT
  signal_id    varchar(24) null   ▸CHANGED  -- was `issue_id`
  value double / passed bool / feedback text / metadata jsonb / error text / errored bool   ▸KEPT
  duration bigint / tokens bigint / cost bigint                ▸KEPT  (ns / count / microcents)
  drafted_at timestamptz null / annotator_id varchar(24) null  ▸KEPT
  created_at, updated_at                                       ▸KEPT
```

- **`passed` IS the materialized membership flag.** The host derives it at write time by thresholding the script's `value` (`isScoreMatch` against `DEFAULT_SCRIPT_SCORE_THRESHOLD` = 0.5; `Passed()`/`Failed()` set `value` = 1/0, so `passed = value >= 0.5`), and it is stored verbatim; `value` is kept for confidence/sort. So **membership reads need no runtime threshold**: a signal's occurrences are the distinct traces in `scores WHERE signal_id = ? AND passed = false`. This is also why definition edits apply forward-only — old rows keep their frozen `passed`.
- Index renames (same shapes, `issue`→`signal`): `scores_issue_lookup_idx` → `scores_signal_lookup_idx` (`WHERE signal_id IS NOT NULL`), `scores_issue_discovery_work_idx` → `scores_signal_discovery_work_idx`. The canonical idempotency unique index `scores_canonical_evaluation_trace_idx` keeps its meaning — only the column renames `source` → `source_type`; the value stays `'evaluation'`, giving one evaluation score per `(source_id = evaluation id, trace)`. Occurrence counts dedupe to distinct `trace_id` per signal, so a trace touched by successive evaluation generations (re-tracking or re-optimization mints a new evaluation id) counts once.
- `custom` source is **POST-MVP**: it requires the public `/scores` API to accept a caller-supplied `signal_id` (today it refuses caller ownership — `dev-docs/scores.md`).

### Postgres: `evaluations` (rename + polymorphism — the detector lives here)

```
evaluations
  signal_id    varchar(24) NOT NULL   ▸CHANGED  -- was `issue_id` NOT NULL; the evaluation backs exactly one signal (1:1 active)
  settings     jsonb null             ▸NEW      -- EvaluationSettings; optional declarative config that compiles to `script`; NULL for a raw / GEPA-generated script
  script       text NOT NULL          ▸KEPT     -- every evaluation IS a sandbox script; the canonical executable (unchanged: still NOT NULL)
  alignment    jsonb null             ▸CHANGED  -- was NOT NULL; set only once aligned (judge scripts that call llm()); NULL otherwise
  aligned_at   timestamptz null       ▸CHANGED  -- was NOT NULL; judge-only
  -- name, description, trigger (filter/turn/debounce/sampling), archived_at, deleted_at, timestamps  ▸KEPT
  index evaluations_signal_lookup_idx (organization_id, project_id, signal_id, deleted_at)            ▸CHANGED (rename)
  partial unique (signal_id) WHERE deleted_at IS NULL AND archived_at IS NULL                          ▸NEW  -- one ACTIVE detector per signal
  btree  (organization_id, project_id, signal_id) WHERE deleted_at IS NULL AND archived_at IS NULL     ▸NEW  -- "list active detectors" for the matching pipeline
```

No `type` or `capability` column: every evaluation is a script. Type lives in `settings` (templated evals); what a script does (llm/semantic/code) is detected from it when needed (execution lane, analytics). Invariants: `script` is always present; `settings` is optional (compiles to `script` when set); `alignment`/`aligned_at` are set only for aligned judge scripts (those that call `llm()`), NULL otherwise. The active-detector partial-unique index requires a one-time migration that **dedupes today's multiple-evaluations-per-issue rows** (keep the most-recently-aligned as active, archive the rest) before it can be created.

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

The unified model already resolves a signal incident's target by joining `monitor_alert_id → monitors.target_signal_id`; `source_type`/`source_id` stay null (note: this is `AlertIncidentSourceType`, a **different** enum from the score `ScoreSourceType` renamed above — do not conflate), `condition` snapshots the firing alert (metric included), and `entry_signals`/`exit_eligible_since`/backtracking carry over. **Optional hardening** (recommended, not required): add `target_snapshot jsonb` capturing the signal plus a summary of its evaluation (`type`/`settings`/`script`) so a closed incident stays self-describing if its signal or evaluation is later edited or deleted — otherwise a deleted signal's closed incidents lose their target label.

### ClickHouse: `scores` analytics (one new column; append-only)

ClickHouse migrations are append-only (`ch:create`), so this is `ADD COLUMN`, not a rename:

```sql
ALTER TABLE scores ADD COLUMN signal_id FixedString(24) DEFAULT '';   -- NEW; backfill = old issue_id via one ALTER UPDATE, then issue_id deprecated
-- `source` (FixedString(32)) now also carries flagger|user (it already carries 'evaluation' today, so no historical remap).
--   bump skip index idx_source set(3) → set(4) to keep it selective for four values.
-- everything else unchanged: value Float32, passed Bool, errored Bool, duration/tokens/cost UInt64, created_at.
```

- **The CH `scores` table is the single signal counting/aggregate surface** monitors read; it loses its issue-trend special-casing. Occurrence count = `countDistinct(trace_id) WHERE signal_id = ? AND passed = false`. Metric aggregates (`avg`/`p95`/`sum` of trace `duration`/`cost`/`tokens`) join the matched `trace_id` back to the traces analytics — the score's own duration/tokens/cost are the *evaluation's* (zero for scripts that don't call `llm()`), not the trace's.
- All scores follow the existing Postgres-canonical → ClickHouse sync (drafted annotations sync once published). No CH-only split in the MVP.

## UI

### Navigation

A **Signals** nav item replaces **Issues** (single list — hand-built and discovered signals together; `origin` distinguishes them and is a filter/column). Issue URLs (`/projects/$slug/issues/...`) redirect into the corresponding signal pages. **Monitors** stays, generalized to the cross-target operational view.

### Signals list

One table; `origin` (auto/manual), priority, assignee, trend, monitors, and last incident are columns/filters on the same surface.

### Signal detail page

Definition (evaluation + filters), monitor charts, alerts, incidents, and member traces in one context. System-created signals with no evaluation show their annotation evidence and a **Track** action; judge evaluations (scripts that call `llm()`) additionally show the alignment sections (confusion matrix, realign).

### Creating a signal

One builder, three entry points (Signals list, "Create signal from this search", annotation flow), one rule: **never let users define membership blind** — the builder always shows a live preview via the sandbox dry-run harness against sample traces. The builder edits a declarative `settings` form (or, for advanced users, a raw `script`); either way it produces the evaluation's `script`, generating a judge that calls `llm()` via `optimize-evaluation` when that's the chosen form.

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
| POST | `/{signalSlug}/resolve`, `/ignore`, `/track` | `resolveSignal` / `ignoreSignal` / `trackSignal` |

- `createSignal` accepts an `evaluation` — its `settings` (default, compiled to a script; judge `criteria` is the first settings form) or a raw `script` (advanced) — plus optional `filters`; rejects evaluation-less creation (only system-created signals may have no evaluation).
- Monitors gain `signal` as a target type in their existing API.
- `custom`-source score push (the `/scores` API accepting `signal_id`) is **POST-MVP**.

## Migration

- **Issues → signals, in place.** Rename `issues` → `signals` (keep rows, centroid, embeddings); existing issues become `origin = 'system'` (auto-generated, annotation-assignable as today) — those with no linked evaluation keep none, those with a generated evaluation keep it; either way `origin` stays `system`. Issue-linked evaluations stay as they are (they are already judge scripts that call `llm()`): set `evaluations.signal_id` and **dedupe to one active per signal** (keep the most-recently-aligned active, archive the rest) so the active-detector unique index can be created. `scores.issue_id` → `signal_id` (Phase 1); `source` → `source_type` (Phase 2/PR1, PG only — the CH column stays `source`; `evaluation` is kept; `annotation` splits into `flagger`/`user` in Phase 6).
- **System monitors** become signal monitors (the three `issue.*` system monitors remap to the new `ALERT_KINDS` over signal targets).
- **Flaggers** stay as the trace-end auto-annotation engine feeding system-created signals (flow C), unchanged.
- **Semantic moments** stay as the conversation-intelligence anchor matching they are today; folding them into signal evaluations (and consolidating overlapping flaggers) is deferred to [Phase 7](#phase-7--semantic-similarity-evaluations-future), once semantic detection is added.

## Decisions

### Settled choices (each is detailed in the linked section)

1. **Membership is materialized at write time** — forced by the cost model. → [Why](#why-membership-is-materialized-at-write-time)
2. **A signal's occurrences ARE its scores** — membership = scores with `passed = false` (the host derives `passed` by thresholding the script's `value` via `isScoreMatch`), counted as distinct traces per signal; all scores reuse the existing Postgres + ClickHouse scores pipeline, so the single ledger needs no new table. → [Score](#score--the-membership-ledger)
3. **Automatic discovery is kept** as system-created (`origin = 'system'`) signals. Annotation assignment is gated on `origin` (immutable), not on whether the signal has an evaluation — so a tracked system-created signal keeps accepting annotations. → [Discovery](#discovery-and-tracking)
4. **One evaluation per signal, on the existing `evaluations` table, always a script** — not a separate detector entity, not a jsonb column on the signal, no `type`/`capability` columns. A `settings` object optionally compiles to the `script`; the script is what executes. Exactly one *active* evaluation per signal (archived predecessors kept for lineage); a system-created signal may have none. → [Evaluation](#evaluation-the-detector)
5. **Evaluations write every run** (matched and non-matched), mirroring how judges persist pass and fail today; occurrences are the matched subset. **All scores are stored the same way** — Postgres-canonical + ClickHouse mirror, no per-type or per-capability split. → [Score](#score--the-membership-ledger)
6. **Users cannot create evaluation-less signals** — only `system`-origin signals may have no evaluation, which removes the pure-filter write-amplification footgun; `filters` is only an evaluation pre-gate; plain filter tracking stays saved searches + monitors. → [Signal](#signal)
7. **Lifecycle stays on the signal row** for the MVP (resolve/ignore/escalating carried over from issues), not relocated onto the default monitor. → [Signal](#signal)
8. **Script evaluations are the MVP detector; the judge is a generated script that calls `llm()`.** Both arise from the builder (settings → script, or raw script) and from the discovery → tracking path. **There is no tunable threshold**: the script returns `Passed`/`Failed`, so the cutoff is written into the script; `value` is only confidence/sort. **Semantic similarity is a future capability** ([Phase 7](#phase-7--semantic-similarity-evaluations-future)) — likely a `similarity()`/`embedding()` host function the script can call (with a possible native batch-runner optimization), shape deferred. **Custom-source scores** (`/scores` accepting `signal_id`) are POST-MVP.
9. **No per-project signal cap.** Evaluation matching cost and score write volume are bounded by the shared selection pre-gate (sampling / turn / filter) and the single `signals:match` pipeline, not by an arbitrary count limit.

## Tasks

> **Status legend** — `[ ] pending`, `[~] in progress`, `[x] complete`.
>
> Each phase is an **independently shippable, behavior-preserving deploy**: production keeps working after every phase. Parallelism lives *within* a phase (tasks sharing dependencies run concurrently); phases themselves are mostly sequential, which is the deliberate price of safe incremental rollout. **MVP = Phases 1–4.** Every phase updates the relevant `dev-docs/*` as part of its definition of done (the "remember docs" requirement).
>
> **Incremental-schema note.** The data-model end state above is reached over several phases, not at once. `source_type` is a one-step rename (`source`→`source_type`, PG only — the CH column stays `source`); the `evaluation` value is **kept** (no remap), and `annotation` splits into `flagger`/`user` in Phase 6 — there is no add-then-collapse round trip. Monitoring unifies similarly — discovery-born signals keep the existing issue-event escalation path until Phase 5/6, while custom signals get the new signal-score path in Phase 4. Running two paths temporarily is intentional and non-breaking. **The exception is Phase 2's engine cutover** ([below](#phase-2--evaluation-substrate--script-evaluations-mvp)), which is not an incremental additive step (no feature flag, brief accepted downtime); its membership-polarity inversion was subsequently **reverted** back to the original `passed = false` = present convention.

### Phase 1 — Rename Issues → Signals `[MVP]`

**Deps:** none.
**Ships:** the entire current system under the Signals name — discovery, monitors, alerts, notifications behave identically.
**Shape:** a **single atomic PR** (not stacked) — a TS-source workspace can't half-rename a package and compile, so the package rename and all ~50 importers land together; coordinate the SDK release (major bump).
**Safe because:** semantics are unchanged. The only non-trivial parts are the two corrections below; everything else is a mechanical identifier/path rename gated by `pnpm typecheck` + a residue grep.

> **Corrections to the original "pure rename" framing** (verified in code; full rationale in `dev-docs/signals.md`):
> 1. **Event identifiers are not a free rename.** An event name (`IssueCreated`, `ScoreAssignedToIssue`, …) is one identifier in four places — the `EventPayloads` TS key, the type-checked `eventName` literal, the persisted `outbox_events.event_name` dispatch token, and the total handler-map key. Renaming requires moving all four **together** (type-consistent), **migrating stored values**, **and** a temporary legacy-name alias at the `domain-events` dispatcher — the outbox + BullMQ `domain-events` queue hold in-flight rows the migration can't reach, and unhandled names dead-letter (= lost alerts).
> 2. **In-place PG `RENAME` causes brief downtime** (migrations run as a one-shot task before a rolling service deploy, so old tasks query the renamed table for the rollover window). This is **accepted** — no long-term issues. ClickHouse, being append-only, EXPANDs (ADD `signal_id`, keep `issue_id`) instead.
> 3. **KEEP wire-level tokens** (rename surrounding code, keep the string + a TODO): BullMQ queue/topic `"issues"` + ops + dedupe-key prefixes, Temporal workflow type names, Redis lock keys (`org:*:issues:*`, `issue:${id}`), export `kind:"issues"`, the `issue.*` alert kinds + source type `'issue'` (these are *retired*, not renamed, in later phases), and the CH `issue_id` column. Renaming them needs a coordinated drain, not a rename, and buys nothing user-visible.

- [ ] **P1-a** PG **in-place RENAME** migration (hand-written via `pg:generate:custom` — Drizzle has no `RENAME COLUMN` precedent and interactive rename detection is unavailable in CI): `ALTER TABLE issues RENAME TO signals`; `scores`/`evaluations` `RENAME COLUMN issue_id → signal_id`; `ALTER INDEX … RENAME`; `ALTER POLICY issues_organization_policy → signals_organization_policy`. Plus the **outbox value migration** for correction (1): `UPDATE outbox_events SET event_name = 'Signal…' WHERE event_name = 'Issue…' AND published = false` (×6) and `aggregate_type 'issue'→'signal'`. Verify `snapshot.json` + data-preservation on a copy.
- [ ] **P1-b** CH **EXPAND** (`pnpm --filter @platform/db-clickhouse ch:create`, append-only): `ALTER TABLE scores ADD COLUMN signal_id FixedString(24) DEFAULT ''`; `ALTER TABLE scores UPDATE signal_id = issue_id WHERE issue_id != ''`; rebuild the `scores_hourly_buckets` MV keyed on `signal_id` (DROP VIEW→DROP TABLE→CREATE→full re-aggregate backfill); `score-fields.ts` adds `score.signalId`; `score-analytics-repository.ts` reads `if(signal_id != '', signal_id, issue_id)` during the async mutation. **Keep `issue_id` until Phase 9.**
- [ ] **P1-c** Domain rename `@domain/issues`→`@domain/signals`: folder + package name + tsconfig path alias + all imports; `Issue*`→`Signal*` types/ports/use-cases; `IssueId` brand → `SignalId` (`@domain/shared/id.ts`); `Score.issueId`→`signalId` (`@domain/scores`); also rename `EvaluationIssueRepository` in `@domain/evaluations`. **Events:** rename `EventPayloads` keys + literals + handler-map keys + payload types together, **and** add the `EVENT_NAME_ALIASES` shim at the dispatcher (`apps/workers/src/workers/domain-events.ts`) per correction (1). **Keep alert-kind strings `issue.*`** (persisted; *retired* later) — only relabel `ALERT_INCIDENT_KIND_LABEL`.
- [ ] **P1-d** Platform: `@platform/db-postgres` `issue-repository`→`signal-repository`, schema `issues.ts`→`signals.ts`, mappers, seeds, export `IssueRepositoryLive`→`SignalRepositoryLive`. Plus the rest of the importers (workers, workflows, `@domain/{notifications,monitors,integrations,email}`, web server-fns) — flip import path + symbol; KEEP wire-token strings.
- [ ] **P1-e** API: `apps/api/src/routes/issues.ts`→`signals.ts`; parameterize the Fern-group + op-id factory so one definition set mounts at `/projects/:projectSlug/signals` (group `signals`, op-ids `listSignals…`) **and** `/projects/:projectSlug/issues` (group `issues`, op-ids `listIssues…`, `deprecated:true`, TODO to remove). `pnpm generate:sdk` (emits openapi/mcp + Fern TS+Python) → both `client.signals.*` and deprecated `client.issues.*` generate.
- [ ] **P1-f** Web: signals routes/pages/`-components` (`issues/`→`signals/`, `$issueId`→`$signalId`, `issue-*`→`signal-*`), `domains/issues`→`signals`, `useIssue*`/`getIssue*`→`useSignal*`/`getSignal*`; `ProjectSidebar` nav; `/issues/...`→`/signals/...` redirect (sibling layout route) + legacy `?issueId=` `beforeLoad` redirect kept. **Keep search-param key strings** (`issuesSearch` etc.) so redirect-preserved bookmarks resolve.
- [ ] **P1-g** Copy: notification templates + `ALERT_INCIDENT_KIND_LABEL` Issue→Signal wording (email/Slack/in-app); keep variable names (`issueUrl`/`issueId`) and saved-search branches.
- [ ] **P1-h** Docs: `dev-docs/issues.md`→`dev-docs/signals.md` (record corrections 1–3); fix references in `monitors.md`/`scores.md`/`reliability.md`/`notifications.md`/`evaluations.md`; `specs/issue-details-page.md`; AGENTS.md skill glossary; **public Mintlify `docs/` pages + redirects**.

**Exit gate:** full suite green; `/issues` URLs + `?issueId=` deep links redirect; both `client.issues.*` (deprecated) and `client.signals.*` SDK groups resolve; an emitted score still routes through the renamed dispatch (incl. a legacy `IssueCreated`-named outbox row via the alias) and opens an `alert_incidents` row; PG migration data-preserving; `grep -rl "@domain/issues"` empty. Brief rollover downtime is the only behavioral diff.

> **Post-deploy cleanup (later phase):** remove `EVENT_NAME_ALIASES`, the `/issues` API alias + `issues` SDK group, the CH `issue_id` column, and retire the `issue.*` alert kinds (Phase 9).

### Phase 2 — Evaluation substrate + script evaluations `[MVP]`

> **Revised to a big-bang cutover (no feature flag).** The original flag-gated, additive framing was superseded during implementation. Phase 2 is delivered as **three self-contained PRs**: **PR1 — engine cutover**, **PR2 — user-created signals** (CRUD API + MCP + codegen + backfill), **PR3 — builder UI**. Phase 5 (unify judge execution onto the matching pipeline) is **folded into PR1**.

> **REVERTED: the PR1 membership-polarity inversion.** PR1 shipped a one-time flip of membership to `passed = true` = *behavior present*. This was **reverted** because annotation scores overload `passed` as a **sentiment** attribute: the annotation UI writes thumbs-up = `passed = true` = positive and thumbs-down = `passed = false` = negative, and that annotation write path was never changed by PR1. PR1's data migration nonetheless flipped historical annotation rows, so existing negative annotations rendered as positive and positive as negative. The polarity cutover is therefore reverted to the original problem-detector convention (`passed = false` = present; the host derives membership by thresholding `value` via `isScoreMatch`), while the orthogonal `source_type` rename and the `signals:match` worker are **kept**. A proper polarity model that does not conflict with annotation sentiment is deferred to a future phase.

**Deps:** P1.

**Membership polarity is the original problem-detector convention.** A signal's occurrences are its matching scores, where **`passed = false` means the signal's behavior is PRESENT in the trace** (an occurrence) and `passed = true` means absent/not-exhibited. This holds for **every** source: judge, flagger, human annotation. The sandbox script returns `value` (+ optional `feedback`); the host derives `passed` by thresholding `value` (`isScoreMatch` against `DEFAULT_SCRIPT_SCORE_THRESHOLD` = 0.5 — `Passed()`/`Failed()` set `value` = 1/0, so `passed = value >= 0.5`). Every evaluation run stamps `signal_id` (matched or not); occurrence reads count "`signal_id` present" and gate `passed = false`.

#### PR1 — Engine cutover `[x] complete` (polarity inversion reverted)

- [x] **Sandbox `value` contract** (polarity inversion reverted): the script returns `value` (+ optional `feedback`) and does **not** return a `passed` field; the host derives membership by thresholding `value` via `isScoreMatch` against `DEFAULT_SCRIPT_SCORE_THRESHOLD` = 0.5 (`Passed()`/`Failed()` set `value` = 1/0). The removed host threshold is restored.
- [x] **Polarity reverted to `passed = false` = present**: baseline judge prompt (`baseline-prompt.ts`) + GEPA proposer + alignment/optimization scoring restored to the problem-detector convention; flagger/annotation write paths + discovery eligibility (`check-eligibility`) + the alignment-examples positive/negative selection back to present = `passed = false`. The annotation sentiment write path (thumbs-up = `passed = true`) is left unchanged.
- [x] **`legacy_polarity` dropped**: the `evaluations.legacy_polarity` column and the execution-boundary verdict inversion are removed — there is no legacy-polarity flag anymore.
- [x] **`signals:match` replaces `run-live-evaluation`'s scheduling** for ALL origins (KEPT): a new `signals:match` worker off `TracesIngested` (gated `!isSandbox`, debounced like trace-end) owns evaluation selection (sampling/turn/filter) and re-feeds the existing `live-evaluations:execute` queue. `trace-end` drops its evaluation fan-out (keeps live-queues / flaggers / saved-search / trace-search / conversation-intelligence). The writer always stamps `signal_id`; membership = the `passed = false` subset.
- [x] **`scores.source` → `source_type`** (KEPT): real in-place PG `RENAME COLUMN` + domain field + every DB query. **ClickHouse column stays `source`** (it is in the sort key — a rename means a full table rebuild; the `score.source` filter-DSL key, a saved-search contract, also stays). **Public `/scores` wire key stays `source`** (mapped to `source_type` at the API boundary — no SDK break). Value `annotation` is kept (the `flagger`/`user` split is Phase 6).
- [x] **Read-side membership restored**: per-signal occurrence/trace ClickHouse reads are back to "`signal_id` present"; the `scores_signal_discovery_work_idx` predicate is back to `passed = false`.
- [x] **Cutover migration reverted**: new forward PG `UPDATE` + CH `ALTER UPDATE` migrations re-flip `passed` back on historical `evaluation` + `annotation` scores (`errored` excluded), and the `scores_hourly_buckets` MV is rebuilt to the no-passed-filter form (synchronous re-flip so the rebuild backfills the reverted rows). Seed occurrence scores restored to the original polarity.

#### PR2 — User-created signals (API + MCP + backfill) `[ ] pending`

- [ ] Contracts: `SIGNAL_ORIGINS`, `EvaluationSettings` zod (`@domain/shared`).
- [ ] Additive PG migration: `signals` — `origin` (backfill `'system'`), `filters`, `deleted_at`, nullable `centroid`/`clustered_at`, partial-unique slug; `evaluations` — `settings`, nullable `alignment`/`aligned_at`, dedupe-then-active-detector partial-unique index `(signal_id) WHERE deleted_at IS NULL AND archived_at IS NULL` + lookup btree. Make `toCentroidEmbedding` + the API evaluation response mapper null-safe; handle the un-renamed `issues_centroid_embedding_consistency_check` constraint (survived Phase 1's rename, untracked by Drizzle).
- [ ] **Settings → script codegen** (`@domain/sandbox`, **net-new**): the original "consume the existing sandbox-runtime *SignalRule* codegen" claim is **refuted** — no such codegen exists yet; PR2 **builds** `compileSettingsToScript` + compile-on-save validation (`ScriptCompileError` → 422), single-sourcing the judge template so capability detection (`llm(`) and parity hold.
- [ ] **`evaluations.script_hash`** column, filled for all evaluations — the writer reads it for the score's `metadata.evaluationHash` instead of the now-nullable `alignment.evaluationHash` (moved here from PR1: only needed once `alignment` becomes nullable).
- [ ] `createSignal`/`updateSignal`/`deleteSignal` use-cases + API routes (monitors template) + MCP/SDK regen; reject evaluation-less `origin=user`. `deleteSignal` = PG **soft-delete** + archive the linked evaluation (auto write-stop via the active-detector scan); **no CH cleanup** — deleted-signal scores are excluded read-side via PG lifecycle. **No per-project signal cap.** Default-monitor provisioning stays Phase 4.
- [ ] `signals:backfill` worker + `backfillSignalScoresUseCase`: deterministic scripts only (judges collect forward); sandbox traces excluded; `windowStartIso` resolved once; idempotent per `(evaluation, trace)`.

#### PR3 — Builder UI `[ ] pending`

- [ ] `apps/web` create-signal modal: name/description + `filters` editor + raw-script editor (judge form is Phase 3) + a **live dry-run preview** (compile + run a script against sample traces, **no persist**). Entry points: "New signal" (signals list), "Create signal from this search" (saved-search surface).

**Exit gate (PR1):** existing evaluations run through `signals:match` with correct `passed = false` = present membership (host derives `passed` via `isScoreMatch`); occurrence reads count the `passed = false` distinct-trace subset; discovery + monitors still work; whole-workspace typecheck green. **Exit gate (PR2/PR3):** users create/manage script & judge signals via API/MCP/UI; new in-scope traces produce evaluation scores visible on the signal page; backfill works.

### Phase 3 — User-created LLM-as-judge signals `[MVP]`

**Deps:** P2.
**Ships:** a builder option to author a judge signal (describe the behavior + optional example traces → generated judge script that calls `llm()`), running on the **existing** evaluation execution path.
**Safe because:** it reuses the proven evaluation generation/alignment/execution stack; additive UI. **Mostly pre-existing** — `llm_as_judge` already ships as a templated sandbox script (behind `evaluation-sandbox-runtime`) and GEPA already generates scripts, so P3-a/P3-b/P3-d are largely wiring; only **P3-c** (judge builder UI) is genuinely new.

- [ ] **P3-a** Standalone evaluation creation (`@domain/evaluations`): allow creating a judge evaluation (a script that calls `llm()`) linked to a fresh signal, not only via the discovery → tracking path; set `evaluations.signal_id`.
- [ ] **P3-b** Generation reuse: drive the existing `optimize-evaluation` workflow (`evaluations:generate:${signalId}`) from the builder; with example traces → aligned (reuse `collectAlignmentExamples` + `evaluateDraftAgainstExamples`); without → unaligned start, alignment accrues as annotations land.
- [ ] **P3-c** Builder UI (judge): description + optional example-trace picker (reuse the annotation-flow picker); preview via the sandbox dry-run harness; alignment polled via `workflow.describe()` (reuse `getSignalAlignmentState`).
- [ ] **P3-d** Execution linkage: verify the `EvaluationTrigger` path writes `signal_id`-bearing scores for a user-created (non-discovered) signal; polarity/`passed` normalized to exhibition.

**Exit gate:** create a judge signal → it runs on live traffic via `EvaluationTrigger` → writes signal-linked scores → alignment shows accruing/aligned.

### Phase 4 — Monitors on signals `[MVP]` (hard-req 4)

**Deps:** P2.
**Ships:** alerting on custom (and any) signals; users create monitors targeting a signal with a metric + alerts (tools/users monitor UX copied); each new signal gets a default monitor.
**Safe because:** it's additive monitor columns + a new reader; existing project-level system monitors keep covering discovery-born signals via the existing path.

- [ ] **P4-a** PG migration (additive): `monitors.target_signal_id`, `is_default` + the two indexes.
- [ ] **P4-b** `SignalScoreReader` (`@platform/db-clickhouse`): `count WHERE signal_id=? AND passed = false`; `avg`/`p95`/`sum` of trace `duration`/`cost`/`tokens` by joining matched `trace_id → traces`; `errorRate`; per-bucket series for the escalation machine. Mirrors `SavedSearchMatchReader`.
- [ ] **P4-c** Signal monitor evaluation: wire signal targets into `evaluateMonitorUseCase`, reusing the unified `event.matched`/`metric.threshold`/`metric.escalating` state machines (`run-*-alert.ts`) over the `SignalScoreReader` series; `metric.escalating` `expected` mode reuses `evaluateSeasonalEscalation`.
- [ ] **P4-d** `event.regressed` kind: add to `ALERT_INCIDENT_KINDS` (+ point lifecycle, no-condition, label, severity); fires on the first datapoint after the signal's `resolved_at` clears (mirror `issue.regressed`, signal-driven).
- [ ] **P4-e** Default monitor provisioning: `provisionDefaultSignalMonitorUseCase` on signal create (count + `metric.escalating` expected + `event.regressed`, `is_default=true`); reuse `provisionSystemMonitorsUseCase` patterns.
- [ ] **P4-f** Monitor-on-signal UI: create/edit (metric + alert card stack, copied from the tools/users monitor flow) on the signal page; monitors-list **Target** column deep-linking to the signal.
- [ ] **P4-g** Monitors API + MCP: signal target on create/update; regen.

**Exit gate:** create a monitor on a signal → metric series computes from signal scores → alert fires → incident + notification.

> **— MVP line: Phases 1–4 —**

### Phase 5 — Unify judge execution onto the evaluation matching pipeline `[FOLDED INTO PR1 · complete]`

> **Folded into Phase 2 / PR1.** The big-bang cutover pulled this unification forward: the new `signals:match` worker (PR1·1e) is the single trigger for ALL evaluation execution, replacing both `trace-end`'s evaluation fan-out and the standalone `run-live-evaluation` scheduling. The proven `live-evaluations:execute → runLiveEvaluationUseCase` body is re-fed unchanged (so the original P5-a/P5-b "run judges through a new runner + parity suite" mechanism is moot — only the *trigger* moved, not the execution path); P5-c (retire the standalone scheduling path) is what shipped.

- [x] **P5-c** One trigger (`signals:match`) feeds all evaluation execution; the standalone `EvaluationTrigger` *scheduling* path is retired. (~~P5-a/P5-b~~ moot — execution path unchanged.)

### Phase 6 — Taxonomy cleanup + legacy retirement `[POST-MVP]`

**Deps:** P1–P5.

- [ ] **P6-a** Finish `source_type`: split `annotation`→`flagger` (sourceId=SYSTEM) / `user` (else) (PG + CH backfill). (`evaluation` is unchanged — no remap, no evaluation-sourced backfill.)
- [ ] **P6-b** Retire `issue.*` / `savedSearch.*` alert kinds once all monitors run on signal targets (breaking SDK — major bump).
- [ ] **P6-c** Drop deprecated CH `issue_id` and any dormant columns.
- [ ] **P6-d** `/scores` accepts caller-supplied `signal_id` for `custom`-source evaluations (the POST-MVP custom-source path).

**Exit gate:** `source_type` is the four-value enum (`annotation` split into `flagger`/`user`); legacy `issue.*`/`savedSearch.*` kinds and `issue_id` removed; `custom`-source push live.

### Phase 7 — Semantic similarity evaluations `[FUTURE]`

**Deps:** P2 (+ the sandbox runtime). Not part of the MVP — sequenced after the script substrate is proven; this is where we "worry about improving the script to include semantic similarity".
**Ships:** semantic similarity as a capability an evaluation script can use, then folds the existing conversation-intelligence anchor matching (moments) and overlapping flaggers into signal evaluations.
**Open design (resolve before building):** how semantic executes — most likely a `similarity()`/`embedding()` **host function the script calls** (mirroring the `llm()` host bridge, `installHostLlm` in `@platform/sandbox-quickjs`), with a possible **native batch-runner optimization** for the pure-similarity case (one pass over a trace's chunk embeddings against all anchor sets, instead of a per-trace isolate). Needs a coordinated `specs/sandbox-runtime.md` edit — a new capability beyond `{pure, llm}` and an **embeddings-ready execution lane** (a `similarity()`-calling script needs chunk embeddings that exist only on the later `trace_search_embeddings` hop, not at trace-end) — plus a precedence rule for a script that calls both `similarity()` and `llm()`.

- [ ] **P7-a** Add the `similarity()`/`embedding()` sandbox host function + its capability and embeddings-ready execution lane (coordinated `sandbox-runtime.md` edit); surface the globals in the builder/MCP authoring.
- [ ] **P7-b** Decide + (if warranted) implement the native batch-runner optimization for pure-similarity evaluations.
- [ ] **P7-c** Moments → signal evaluations: express the 8 `MOMENT_KINDS` as `origin=system` semantic evaluations (anchors + their static gates), so moment labeling runs through the one matching pipeline.
- [ ] **P7-d** Flagger consolidation: where a flagger overlaps a semantic signal (e.g. `frustration`), make the semantic evaluation canonical and retire the overlapping flagger; non-overlapping flaggers keep feeding system-created signals via discovery.

**Exit gate:** an evaluation script can call `similarity()`; moments run as semantic evaluations through the matching pipeline; overlapping flaggers retired, others unchanged.
