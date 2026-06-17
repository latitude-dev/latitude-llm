# Signals

> **Documentation** — eventual durable homes: `dev-docs/signals.md` (new) and an updated `dev-docs/monitors.md`. Related current docs: `dev-docs/issues.md`, `dev-docs/scores.md`, `dev-docs/notifications.md`, `dev-docs/conversation-intelligence.md`, `dev-docs/evaluations.md`.
>
> **Depends on** — `specs/sandbox-runtime.md`, the execution contract for `llm_as_judge` and `script` evaluations: an evaluation run returns a `Passed`/`Failed` verdict (with optional confidence `value` and `feedback`), and that verdict IS membership — there is no host-side threshold. Phases 0–1 of that spec are built; Phase 2 (rule/script codegen + dry-run harness) is the substrate this spec consumes.
>
> **Supersedes (conceptually)** — `specs/monitors.md` and `specs/alerts.md`. Those specs still accurately describe what is *currently built*; this spec defines the model that replaces their framing. Do not retire them until the migration phases are underway.
>
> **Origin** — LAT-664 ("Consolidate monitor situation"), extended through spec review. This revision folds membership detection into **polymorphic evaluations** (superseding an interim *trackers* model — see [Decisions](#decisions)) and reverses two stances of the original spec (no automatic discovery, separate occurrence ledger).

## Contents

1. [Purpose](#purpose) — the problem and the consolidated model
2. [Why membership is materialized at write time](#why-membership-is-materialized-at-write-time) — the foundational argument
3. [Concepts](#concepts) — Signal, Evaluation, Score, Monitor, Alert, Incident
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
                evaluation runs per trace     monitors aggregate         alerts fire on        records the
                (or annotation lands)         the score stream           conditions            firing
  Trace ──────▶ SIGNAL ─────────────────────▶ MONITOR ─────────────────▶ ALERT ──────────────▶ INCIDENT ──▶ notifications
                membership = its SCORES        (a metric over the
                (write-time materialized)       signal's scores/traces)
```

The one-line mental model for users and docs:

> Latitude groups your traces into **Signals** — buckets you define with an **Evaluation** (a script Latitude runs on each trace, typically an LLM-as-judge it generates for you), plus the buckets Latitude discovers for you automatically from annotations. A signal's members are its **Scores**. Any signal can be watched with a **Monitor**; monitors have **Alerts**, and a fired alert opens an **Incident**, which is what notifies you.

Two structural decisions carry the whole spec. Both are stated here and argued in full under [Why membership is materialized at write time](#why-membership-is-materialized-at-write-time):

1. **A signal's occurrences ARE its scores.** There is no separate occurrence ledger. Every evaluation run, every annotation, and every (future) custom push writes a `scores` row carrying `signal_id`. A signal's membership is the subset of those rows that *matched* (`passed = true`). This collapses today's inconsistency — issues count scores, saved searches count traces — into one counting unit, and reuses the entire scores pipeline.
2. **Membership is materialized at write time.** A signal's evaluation is run against each in-scope trace once, on arrival, and the verdict is frozen as a score. This is forced by the cost model, not a preference.

## Why membership is materialized at write time

Both foundational decisions follow from a single constraint: counting and alerting over *semantic* membership is only affordable if each trace's verdict is computed once, on arrival, and remembered.

**1. Semantic search answers a different question than filters do.** A filter is a per-row yes/no — each row passes on its own merits, so filters stack for free. Semantic search with a vector index answers "the ~1,000 items *most similar in the entire corpus*". Combine them and the filter can only discard from those 1,000: "user frustration" + "last 7 days" returns *whichever of the corpus-wide top-1,000 happen to be recent* — maybe 30, maybe 0 — while thousands of genuinely frustrated traces from this week sit at #5,000 globally and are never returned. Counting correctly means scoring every trace in the window: a full scan (which is why semantic trace search already times out on large projects).

**2. Tracking over time multiplies that cost forever.** An alert on "last-5-minutes match count vs its historical average" needs μ and σ over *every historical bucket* — the verdict for every trace in the corpus — recomputed on every evaluation (288×/day), even though each trace's verdict is frozen the moment it arrives. The only fix is "score each trace once, on arrival, and remember it" — which **is** write-time materialization.

**3. "Occurrences are scores" is the cheap way to remember it — given the existing PG/CH split.** The objection to storing membership in `scores` is write amplification through the canonical mutable Postgres path. But `scores` is *already* a Postgres-canonical + ClickHouse-analytics split, and the rules already say immutable scores skip straight to ClickHouse. A pure-evaluation match is immutable by construction (a value, no feedback, nothing to draft), so it goes **ClickHouse-only** and never touches Postgres. Mutable membership (judge feedback, human/flagger annotations) is bounded (sampled / human-paced) and takes the canonical path as it does today. So one ledger scales without a second table.

These consequences carry through the rest of the spec:

- Query-time semantic search remains an **exploration** tool: a ranked best-effort sample on the Traces page. No counts, histograms, or alerts over a semantic query — a banner says so, with "create a signal" as the path to set semantics.
- Anything needing **set** semantics — charts, baselines, alerts, "every matching trace" — must be a signal whose evaluation decides membership per trace at ingest.
- History is immutable under definition edits: editing an evaluation changes membership *forward only* (a definition-changed marker). The "editing a virtual signal rewrites its history" problem disappears.

## Concepts

### Signal

**A signal is a tracked bucket of traces.** Its members are the traces with a *matching* score for that signal. A signal has:

- an **origin**: `user` (built deliberately by a person) or `system` (auto-created by Latitude — see [Discovery](#discovery-sinks-and-promotion)). Origin is the differentiator between hand-built and discovered signals.
- an optional **`filters`** (a `FilterSet`): a cheap, row-local pre-gate restricting which traces the evaluation is even run against ("only `service = checkout`", "only traces above p90 latency"). Empty/absent = all traces. `filters` is only meaningful alongside an evaluation — it gates evaluation execution.
- an optional **`evaluation`** (an `evaluations` row linked 1:1 via `evaluations.signal_id`, **one active per signal**): the membership detector, run at write time. No linked evaluation means a **sink** — no write-time detection, with membership coming only from annotations. This is how discovered signals work.
- **triage metadata**: priority and a single assignee, carried over from issues (multi-assignee deferred).
- a **lifecycle**: `resolved` / `ignored` / `escalating` etc., carried over from issues **unchanged for the MVP**. It stays on the signal row; it is not relocated onto a monitor.

Constraints:

- **Users cannot create an evaluation-less signal.** A `user`-origin signal must have an evaluation. Evaluation-less signals exist only as `system`-origin sinks. This deliberately keeps "plain filter slices" out of signals — those stay **saved searches**. (A broad `filters`-only signal would write a score per trace; banning user-created evaluation-less signals removes that footgun entirely.)
- **One evaluation per signal.** A bucket has exactly one *active* detector evaluation (archived predecessors are kept for lineage across promotion / re-optimization, but only one is live). A concept that needs two detectors — e.g. semantic *and* judge for "frustration" — is one signal *promoted* from one evaluation type to another, or two signals. It is never one signal with two active evaluations.

### Evaluation (the detector)

**A signal's membership detector is an `evaluations` row**, linked 1:1 via `evaluations.signal_id` — exactly one active evaluation per signal. **An evaluation is always a script** that runs in the shared QuickJS sandbox (`specs/sandbox-runtime.md`); there is no detector taxonomy and no second engine. Its shape is defined once in [Data model → Shared contracts](#shared-contracts-domainshared-domainscores).

- **One engine, three ways to author the same script.** Every evaluation produces one `script` artifact, and that is exactly what executes: write it from a declarative **`settings`** object (compiled **deterministically** — the sandbox-runtime *SignalRule* codegen; the option shapes are defined as the builder grows), generate and align it with **GEPA** (`optimize-evaluation`), or hand-write a **raw** script (advanced). `settings` is optional (NULL for a raw or GEPA-generated script); `script` is always present.
- **A judge is just a script that calls `llm()`.** "LLM-as-judge" is not a distinct type — it is the common case of a generated script whose body calls `llm()` (`const result = await llm(\`…\`, { schema }); return result.passed ? Passed() : Failed()`), running on the sandbox behind the `evaluation-sandbox-runtime` flag exactly as today. The `optimize-evaluation` workflow and alignment state (`alignment`/`aligned_at`) apply to these judge scripts; both arise when a user authors a judge directly (criteria → generated/aligned script) and via the sink → promotion path ([Discovery](#discovery-sinks-and-promotion)), and are NULL for scripts that never call `llm()`.
- **Membership is the script's own verdict — there is no host-side threshold.** The script returns `Passed`/`Failed` and the host stores that as `passed`; any cutoff is written *into the script*. `value` ∈ [0,1] is kept only as optional confidence for sort/UX. Definition edits (script or settings) apply **forward only** — a definition-changed marker appears on charts, and existing scores are never re-evaluated.
- **Storage is detected from the script, never stored as a type.** A script that calls `llm()` is non-deterministic and costed → its scores take the Postgres-canonical path; a deterministic script (no `llm()`) is reproducible → its scores route ClickHouse-only. This `pure`/`llm` distinction is the sandbox-runtime *capability*, **detected from the compiled script** at save time, not a column on the row (see [Score](#score--the-membership-ledger)).

> **Semantic similarity is a future capability, not an MVP type.** Today's conversation-intelligence anchor matching is *not* yet expressed as an evaluation. A future phase adds it — most likely as a `similarity()`/`embedding()` host function the script can call (with a possible native batch-runner optimization), its exact shape deferred until then (see [Tasks → Phase 7](#phase-7--semantic-similarity-evaluations-future)). Until then, every evaluation is a sandbox script as above.

### Score — the membership ledger

**A signal's occurrences are its scores.** Every membership-bearing event writes a `scores` row carrying `signal_id`; nothing else records membership. A score's `source_type` is one of `evaluation`, `flagger`, `user`, or `custom` (enum in [Data model](#shared-contracts-domainshared-domainscores)).

- **Membership is the matched subset.** A trace is a member of a signal when it has a score for that signal with `passed = true`. (A judge "exhibits" the behavior at `passed:false` under today's problem-detector polarity; this is normalized to exhibition at migration.) The signal's occurrence count is exactly that subset, counted as **distinct `trace_id`** per signal — so a trace touched by successive evaluation generations (after a promotion or re-optimization minted a new evaluation id) counts once, matching the per-`(signal, trace)` monotone-membership guarantee in `specs/sandbox-runtime.md`.
- **Non-matches are written too**, consistent with how evaluations already persist both `passed:true` *and* `passed:false`: an evaluation writes a score on **every** run, matched or not. The matched rows are occurrences; the non-matched rows give exact pass-rate, denominators, and dashboards without read-time estimation. *(Lever, if pure-evaluation non-match volume ever hurts: switch pure evaluations to match-only and compute the denominator from `filters` over traces at read time. The MVP default is write-both — this is the settled persistence policy; `specs/sandbox-runtime.md`'s persistence table is reconciled to it.)*
- **The write path routes by `capability`** (`pure` vs `llm`, **detected from the compiled script** — does it call `llm()`? — not a stored column), reusing the existing scores PG/CH split (`dev-docs/scores.md`):

  | Score | Capability | Mutable? | Store |
  | --- | --- | --- | --- |
  | `evaluation` — a script that calls `llm()` (judge; pass + fail; has `feedback`; sampled → bounded) | `llm` (detected) | yes (non-deterministic, feedback) | Postgres-canonical + ClickHouse, as today |
  | `evaluation` — a deterministic script, no `llm()` (matched + non-matched; no feedback; runs per in-scope trace) | `pure` (detected) | no (reproducible) | **ClickHouse-analytics only** (immutable, skip the canonical Postgres row) |
  | `user` / `flagger` annotation (draftable, editable) | — | yes | Postgres-canonical + ClickHouse, as today |

Pure-capability evaluation scores carry `signal_id` at write time, so they are immutable on arrival and go straight to ClickHouse — they never push trace-volume writes through the canonical mutable Postgres path. This is the mechanism that makes "occurrences are scores" scale; see [Why membership is materialized at write time](#why-membership-is-materialized-at-write-time).

### Monitor

**A monitor watches one signal over time.** Monitors never own detection — that lives on the signal's evaluation. A monitor owns:

- a **target**: a signal (`monitors.target_signal_id` = signal CUID). Saved-search and raw-stream targets remain available via the existing `target_*` columns; this spec focuses on signal targets. Saved searches stay the home for plain filter tracking — `SavedSearchMatchReader` is reused unchanged.
- a **metric** (`MonitorMetric`, already exists): `count` of matching scores (default), `errorRate`, or `avg`/`p95`/`sum` of `duration`/`cost`/`tokens`. Field aggregates read the matched traces (`score.trace_id → traces`); the score's own cost/tokens are the *evaluation's* (an llm judge's; zero for pure detectors), not the trace's.
- **mute** (`muted_at`): notifications off; evaluation and incident recording continue.

Every signal gets a **default monitor** provisioned at creation — the occurrences (`count`) monitor carrying the same alerts issues get today: a high-severity `metric.escalating` alert in `expected` mode plus an `event.regressed` alert.

### Alert

**A condition on a monitor.** Two flavors (Sentry-shaped, carried over from the monitors model):

- **Event alerts** — `event.matched` (a new matching score entered the signal) and `event.regressed` (a datapoint after the monitor's resolve anchor).
- **Metric alerts** — `metric.threshold` (absolute / multiplier / expected) and `metric.escalating` (sustained).

The two unrelated "is this escalating?" implementations — the issue seasonal detector over score counts, and the saved-search bucketed sustained-gate over trace-match counts — **merge into one** `metric.escalating` evaluator: every monitor target now yields the same *per-bucket count series → per-bucket threshold → open/close state machine* shape. The seasonal detector (`evaluateSeasonalEscalation`) survives as the threshold function of `expected` mode (knob: `sensitivity`); issue escalation stops being special — it is the default monitor's escalating alert in that mode.

### Incident

**Unchanged.** Same `alert_incidents` lifecycle (point vs sustained), backtracked `started_at`/`ended_at`, and notifications pipeline (`incident.event` / `incident.opened` / `incident.closed`). Incidents snapshot the firing alert's `condition`, and additionally snapshot the monitor's **target definition** (the signal plus a summary of its evaluation — `type`/`settings`/`script`) at open time so closed incidents stay self-describing after an evaluation edit or signal delete.

## Discovery: sinks and promotion

Automatic discovery is **kept**, reframed: it produces **sink signals** (origin `system`, no evaluation), not a separate entity. The flagger + annotation machinery is unchanged.

```
flaggers (trace-end) + human annotations
   └─ each writes an annotation score (source_type = 'flagger' | 'user')
   └─ discovery routes the score (centroid + hybrid search + locked serialization, UNCHANGED):
        ├─ to an existing sink signal      → +1 occurrence
        └─ or creates a new sink signal    → origin 'system', no evaluation
   └─ once a sink has enough evidence, the user can PROMOTE it:
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

So a signal's life is **sink (annotation-fed) → optionally promoted to an evaluation (detector-fed)**, with identity and occurrence history preserved across the promotion. This is the bridge between auto-discovery and the hand-built evaluations; it reuses the entire existing discovery + `optimize-evaluation` + alignment machinery.

**Annotation assignment is allowed exactly on evaluation-less (sink) signals.** An evaluation-backed signal is detector-driven; you do not hand-assign traces into it. While annotating, the UI suggests existing sinks via hybrid search over `search_document` (lexical) + `centroid_embedding` (the existing discovery path); the user links explicitly or lets discovery route.

## The matching pipeline

Today's write-time machinery is evaluation-oriented (`EvaluationTrigger`: filter / turn / debounce / sampling decides when an evaluation runs). This generalizes into a single **signal matching pipeline** that runs every active signal's evaluation against incoming traces — every evaluation is a script, so there is one runner.

- the **filters pre-gate** is shared (one pass per trace over all active signals' `filters`); out-of-gate traces never reach the evaluation.
- the **sandbox runner** executes the evaluation's `script` in the shared sandboxed JS (QuickJS) runtime — the single execution path for every evaluation (judge scripts call `llm()`; deterministic scripts don't).
- evaluation-specific options (`sampling`, `turn`, `debounce`) are settings on the evaluation row, not pipeline concepts.

A run writes a score (matched or not) with `signal_id`, `source_type = 'evaluation'`, `source_id` = the evaluation id, routed PG/CH by **capability** (detected from the script) per the [Score routing table](#score--the-membership-ledger). Sinks (no linked evaluation) are not in this pipeline — they receive membership only via annotations.

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
              · deterministic script (no llm()): CH-analytics-only   · script calls llm(): Postgres-canonical + CH
      └─ publishes monitors:evaluate (leading-edge throttle, 5 min)             [reuse shape]
```

### B. Create a signal manually (user origin, must have an evaluation)

```
UI: Signals page / "Create signal from this search" → builder (live preview required)
└─ createSignalUseCase { origin: 'user', evaluation: { settings | script }, filters? }
   ├─ compile settings→script (or accept a raw script); sandbox ScriptCompileError rejects at save time
   ├─ judge path: generate the script via optimize-evaluation; alignment accrues from annotations
   ├─ detect capability from the compiled script (calls llm() → Postgres path; else CH-only)
   ├─ provisionDefaultMonitorUseCase (count monitor + metric.escalating 'expected' + event.regressed)
   └─ enqueue signals:backfill { signalId, window: 14d }   (deterministic scripts only)
```

### C. Annotation → sink routing (auto-discovery)

```
flagger (trace-end) / human annotation
└─ writes annotation score (source_type 'flagger'|'user'), draft/publish as today  [reuse]
└─ ScoreCreated → discovery (centroid + hybrid search + locked serialization)      [reuse]
     ├─ assign to existing sink signal  → +1 occurrence
     └─ create new sink signal { origin: 'system', no evaluation }
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
[Delete]  → deleteSignalUseCase:  soft-delete signal + its monitors; archive its evaluation;
              enqueue CH score cleanup for the signal
regression → flow D, event.regressed branch
```

### F. Promote a sink to a judge evaluation

```
UI: sink signal page → "Start tracking with a judge"
└─ promoteSignalUseCase: create the signal's evaluation (a generated judge script that calls llm())
   └─ start optimize-evaluation (workflow id evaluations:generate:${signalId})      [reuse]
      └─ build alignment set from the signal's annotation scores; generate + align the judge;
         persist with evaluations.signal_id
frontend polls getSignalAlignmentState (Temporal workflow.describe())               [reuse shape]
```

## Data model

**No new tables.** Every entity evolves a table that already exists: `issues` → `signals` (rename + columns), `scores` (rename + split source), `evaluations` (rename + a `settings` column — the detector now lives here, always as a script), `monitors` (one target column), and the ClickHouse `scores` analytics table (one column). The original spec's `signal_occurrences` table is gone — "occurrences are scores". The unified `event.*`/`metric.*` alert model, `MonitorMetric`, and the `monitors.target_*` columns are **already built** (only `event.regressed` is genuinely new). `legend: ▸NEW ▸CHANGED ▸KEPT ▸DROPPED` is per-line below.

### Shared contracts (`@domain/shared`, `@domain/scores`)

These are the single source of truth for the enums and evaluation shape referenced throughout the spec.

```ts
// NEW (@domain/shared)
export const SIGNAL_ORIGINS = ["user", "system"] as const
//   user   — hand-built by a person; MUST have an evaluation
//   system — auto-created sink / provisioned (may have no evaluation)

// An evaluation is ALWAYS a script (evaluations.script) that runs in the QuickJS sandbox
// (specs/sandbox-runtime.md). There is no `type` or `capability` enum on the row:
//   - the script returns a Passed/Failed verdict — that IS membership; no host-side threshold.
//   - `pure` vs `llm` (store-routing) is DETECTED from the script (does it call llm()?) — the
//     sandbox-runtime capability — not a stored column.

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
// `evaluation` is KEPT (every detector — judge, semantic, script — is an evaluation), so there is no
// evaluation↔tracker remap and no historical-score backfill.
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
  origin              varchar(16)         ▸CHANGED  -- was `source` varchar(32); now SignalOrigin (user|system)
  filters             jsonb null          ▸NEW   -- FilterSet pre-gate; only meaningful alongside an evaluation
  priority            varchar(16) null    ▸KEPT  -- low|medium|high|urgent
  assignee_id         varchar(24) null    ▸KEPT  -- single assignee, as today (multi-assignee deferred)
  centroid            jsonb null          ▸CHANGED  -- was NOT NULL; now nullable (user-created evaluation-backed signals have none)
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
```

The detector is no longer a `signals` column — it is the linked `evaluations` row (one active per signal; a sink has none). "List active detectors" for the matching pipeline reads `evaluations` (the supporting partial index lives there — see below) and joins back to `signals` to apply signal-level lifecycle gating (`deleted_at`; `resolved`/`ignored` signals still record per [Triage](#e-triage-from-the-signal-page), so they are not excluded here).

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

- **`passed` IS the materialized membership flag.** The detector reports it directly — a sandbox script returns `Passed`/`Failed`, and the semantic native runner applies its `settings` cutoff (`threshold` + `margin`) — and it is stored verbatim; `value` is kept only for confidence/sort. So **membership reads need no runtime threshold**: a signal's occurrences are the distinct traces in `scores WHERE signal_id = ? AND passed = true`. This is also why definition edits apply forward-only — old rows keep their frozen `passed`.
- Index renames (same shapes, `issue`→`signal`): `scores_issue_lookup_idx` → `scores_signal_lookup_idx` (`WHERE signal_id IS NOT NULL`), `scores_issue_discovery_work_idx` → `scores_signal_discovery_work_idx`. The canonical idempotency unique index `scores_canonical_evaluation_trace_idx` keeps its meaning — only the column renames `source` → `source_type`; the value stays `'evaluation'`, giving one evaluation score per `(source_id = evaluation id, trace)`. Occurrence counts dedupe to distinct `trace_id` per signal, so a trace touched by successive evaluation generations (promotion / re-optimization mint a new evaluation id) counts once.
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
  btree  (organization_id, project_id, signal_id) WHERE deleted_at IS NULL AND archived_at IS NULL     ▸NEW  -- "list active detectors" (matching pipeline; replaces the dropped signals.tracker index)
```

No `type` or `capability` column: every evaluation is a script, and `pure`/`llm` is detected from the script (does it call `llm()`?). Invariants: `script` is always present; `settings` is optional (compiles to `script` when set); `alignment`/`aligned_at` are set only for aligned judge scripts (those that call `llm()`), NULL otherwise. The active-detector partial-unique index requires a one-time migration that **dedupes today's multiple-evaluations-per-issue rows** (keep the most-recently-aligned as active, archive the rest) before it can be created.

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

- **The CH `scores` table is the single signal counting/aggregate surface** monitors read; it loses its issue-trend special-casing. Occurrence count = `countDistinct(trace_id) WHERE signal_id = ? AND passed`. Metric aggregates (`avg`/`p95`/`sum` of trace `duration`/`cost`/`tokens`) join the matched `trace_id` back to the traces analytics — the score's own duration/tokens/cost are the *evaluation's* (zero for pure detectors), not the trace's.
- Pure-capability evaluation scores (deterministic scripts — no `llm()`) are written **CH-only** (immutable on arrival); `llm`-capability scripts (judges) and annotation scores follow today's Postgres-canonical → CH sync.

## UI

### Navigation

A **Signals** nav item replaces **Issues** (single list — hand-built and discovered signals together; `origin` distinguishes them and is a filter/column). Issue URLs (`/projects/$slug/issues/...`) redirect into the corresponding signal pages. **Monitors** stays, generalized to the cross-target operational view.

### Signals list

One table; `origin` (auto/manual), priority, assignee, trend, monitors, and last incident are columns/filters on the same surface.

### Signal detail page

Definition (evaluation + filters), monitor charts, alerts, incidents, and member traces in one context. Sinks show their annotation evidence and a **Promote** action; judge evaluations (scripts that call `llm()`) additionally show the alignment sections (confusion matrix, realign).

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
| POST | `/{signalSlug}/resolve`, `/ignore`, `/promote` | `resolveSignal` / `ignoreSignal` / `promoteSignal` |

- `createSignal` accepts an `evaluation` — its `settings` (default, compiled to a script; judge `criteria` is the first settings form) or a raw `script` (advanced) — plus optional `filters`; rejects evaluation-less creation (sinks are system-only).
- Monitors gain `signal` as a target type in their existing API.
- `custom`-source score push (the `/scores` API accepting `signal_id`) is **POST-MVP**.

## Migration

- **Issues → signals, in place.** Rename `issues` → `signals` (keep rows, centroid, embeddings); existing issues become `origin = 'system'` sinks (no evaluation) — their membership already comes from annotation/evaluation scores. Issue-linked evaluations stay as they are (they are already judge scripts that call `llm()`): set `evaluations.signal_id` and **dedupe to one active per signal** (keep the most-recently-aligned active, archive the rest) so the active-detector unique index can be created. `scores.issue_id` → `signal_id`; `source` → `source_type` (rename only — `evaluation` is kept; `annotation` splits into `flagger`/`user`).
- **System monitors** become signal monitors (the three `issue.*` system monitors remap to the new `ALERT_KINDS` over signal targets).
- **Flaggers** stay as the trace-end auto-annotation engine feeding sinks (flow C), unchanged.
- **Semantic moments** stay as the conversation-intelligence anchor matching they are today; folding them into signal evaluations (and consolidating overlapping flaggers) is deferred to [Phase 7](#phase-7--semantic-similarity-evaluations-future), once semantic detection is added.

## Decisions

### What this revision changed (vs the original LAT-664 spec)

- **Detection model: an evaluation is always a script, no `Tracker` concept.** The interim *trackers* model (a `signals.tracker` jsonb union of `semantic_similarity`/`script`/`llm_as_judge`) is dropped: a signal's detector is a row in the existing `evaluations` table whose `script` runs on the QuickJS sandbox — one engine, no detector taxonomy. A judge is just a script that calls `llm()`; semantic similarity is a future capability (a host function the script can call), not an MVP type. *(Supersedes the trackers revision; the original LAT-664 spec had neither concept.)* Detail: [Evaluation](#evaluation-the-detector).
- **Two ledgers → one.** "Occurrences are scores"; the separate `signal_occurrences` table is removed. *(Reverses the original spec's two-ledger decision 6.)* Rationale: [Why membership is materialized at write time](#why-membership-is-materialized-at-write-time).
- **"No automatic discovery" → discovery kept**, reframed as sink signals (`origin = 'system'`, no evaluation) produced by the unchanged flagger + discovery machinery; centroid/embedding columns stay. *(Reverses the original spec's "no automatic discovery" decision 2.)* Detail: [Discovery](#discovery-sinks-and-promotion).

### Settled choices (each is detailed in the linked section)

1. **Membership is materialized at write time** — forced by the cost model. → [Why](#why-membership-is-materialized-at-write-time)
2. **A signal's occurrences ARE its scores** — membership = scores with `passed = true` (the detector reports `passed` directly; no host threshold), counted as distinct traces per signal; pure-capability evaluation scores route ClickHouse-only so the single ledger scales. → [Score](#score--the-membership-ledger)
3. **Automatic discovery is kept** as sink signals. → [Discovery](#discovery-sinks-and-promotion)
4. **One evaluation per signal, on the existing `evaluations` table, always a script** — not a separate detector entity, not a jsonb column on the signal, no `type`/`capability` columns. A `settings` object optionally compiles to the `script`; the script is what executes. Exactly one *active* evaluation per signal (archived predecessors kept for lineage); a sink is a signal with no evaluation. → [Evaluation](#evaluation-the-detector)
5. **Evaluations write every run** (matched and non-matched), mirroring how judges persist pass and fail today; occurrences are the matched subset. Storage routes by **capability** (`pure` → ClickHouse-only; `llm` → Postgres-canonical + CH), **detected from the script** (does it call `llm()`?), not a stored column. → [Score](#score--the-membership-ledger)
6. **Users cannot create evaluation-less signals** — only `system`-origin sinks have no evaluation, which removes the pure-filter write-amplification footgun; `filters` is only an evaluation pre-gate; plain filter tracking stays saved searches + monitors. → [Signal](#signal)
7. **Lifecycle stays on the signal row** for the MVP (resolve/ignore/escalating carried over from issues), not relocated onto the default monitor. → [Signal](#signal)
8. **Script evaluations are the MVP detector; the judge is a generated script that calls `llm()`.** Both arise from the builder (settings → script, or raw script) and from the sink → promotion path. **There is no tunable threshold**: the script returns `Passed`/`Failed`, so the cutoff is written into the script; `value` is only confidence/sort. **Semantic similarity is a future capability** ([Phase 7](#phase-7--semantic-similarity-evaluations-future)) — likely a `similarity()`/`embedding()` host function the script can call (with a possible native batch-runner optimization), shape deferred. **Custom-source scores** (`/scores` accepting `signal_id`) are POST-MVP.
9. **Signals per project are capped** per plan — bounds evaluation matching cost and pure-evaluation score write volume.

## Tasks

> **Status legend** — `[ ] pending`, `[~] in progress`, `[x] complete`.
>
> Each phase is an **independently shippable, behavior-preserving deploy**: production keeps working after every phase. Parallelism lives *within* a phase (tasks sharing dependencies run concurrently); phases themselves are mostly sequential, which is the deliberate price of safe incremental rollout. **MVP = Phases 1–4.** Every phase updates the relevant `dev-docs/*` as part of its definition of done (the "remember docs" requirement).
>
> **Incremental-schema note.** The data-model end state above is reached over several phases, not at once. `source_type` is a one-step rename (`source`→`source_type`); the `evaluation` value is **kept** (no remap), and `annotation` splits into `flagger`/`user` in Phase 6 — there is no add-then-collapse round trip. Monitoring unifies similarly — discovery-born signals keep the existing issue-event escalation path until Phase 5/6, while custom signals get the new signal-score path in Phase 4. Running two paths temporarily is intentional and non-breaking.

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

### Phase 2 — Evaluation substrate + script evaluations `[MVP]`

**Deps:** P1.
**Ships:** user-created **script** evaluations (raw script, or a `settings` form compiled to a script) that run on the QuickJS sandbox; write-time matching populates the signal; the signal page shows matched traces + occurrence trend. (Alerting on custom signals arrives in P4.)
**Safe because:** it's additive schema + new code behind the `signals` flag; the sandbox runtime is already built (`sandbox-runtime.md` Phases 0–1); discovery/monitors untouched.

- [ ] **P2-a** Contracts (`@domain/shared`, `@domain/scores`): `SIGNAL_ORIGINS`, `EvaluationSettings` (the optional declarative config that compiles to `script`) zod; rename score `source`→`source_type` and split `annotation`→`flagger`/`user` (the `evaluation` value is **kept** — no remap). No `type`/`capability` enums on the row — capability is detected from the script.
- [ ] **P2-b** PG migration (additive): on `signals` — `filters jsonb null`, `origin varchar(16)` (backfill existing → `'system'`), `deleted_at` + partial-unique slug; make `centroid`/`clustered_at` nullable. On `evaluations` — add `settings jsonb null`; relax `alignment`/`aligned_at` to nullable (judge-only); `script` stays NOT NULL; add the active-detector partial-unique index `(signal_id) WHERE deleted_at IS NULL AND archived_at IS NULL` + its lookup btree (replaces the dropped `signals.tracker` index). **Pre-migration:** dedupe multiple-evaluations-per-issue rows (keep most-recently-aligned active, archive the rest) before creating the unique index.
- [ ] **P2-c** Scores write path (`@domain/scores`): an evaluation-score writer that stores the script's reported `passed` verdict; for a **deterministic** script (no `llm()` — detected capability) it **inserts straight to CH analytics, skipping the canonical Postgres row** (the one genuinely new write path); reuse `syncScoreAnalyticsUseCase`'s CH insert + at-most-once-by-id guard; idempotent per `(evaluation, trace)`.
- [ ] **P2-d** Matching pipeline skeleton (`@domain/signals` + a `signals:match` worker off `TracesIngested` via the domain-events dispatcher): `matchTracesToSignalsUseCase`, `listActiveDetectors(projectId)` (signals join active evaluations) Redis-cached (org-prefixed), shared `filters` pre-gate reusing row-local `FilterSet` evaluation, then the **sandbox runner** executes the evaluation's `script`. Generalized from `EvaluationTrigger`.
- [ ] **P2-e** Settings → script codegen (`@domain/sandbox`/`@domain/signals`): consume the sandbox-runtime *SignalRule* codegen so a `settings` form compiles deterministically to a stored `script` + content hash; compile-on-save validation (`ScriptCompileError` rejects at save time).
- [ ] **P2-f** Backfill (`signals:backfill {signalId, window}`): `backfillSignalScoresUseCase` runs the script over historical traces in batches → CH-only scores; enqueued on deterministic-script create.
- [ ] **P2-g** Builder UI (script): `apps/web` signals `-components` — `filters` + a raw-script editor and/or the `settings` form; **live preview** = sandbox dry-run harness against sample traces. Entry points: "New signal", "Create signal from this search".
- [ ] **P2-h** Signal CRUD API + MCP: `createSignal`/`updateSignal`/`deleteSignal` (reject evaluation-less create for `origin=user`); MCP/SDK regen. Reuse the monitors route template.

**Exit gate:** create a script signal → new in-scope traces produce evaluation scores → visible on the signal page; deterministic scripts route CH-only; backfill works; existing signals/discovery unaffected.

### Phase 3 — User-created LLM-as-judge signals `[MVP]`

**Deps:** P2.
**Ships:** a builder option to author a judge signal (describe the behavior + optional example traces → generated judge script that calls `llm()`), running on the **existing** evaluation execution path.
**Safe because:** it reuses the proven evaluation generation/alignment/execution stack; additive UI. **Mostly pre-existing** — `llm_as_judge` already ships as a templated sandbox script (behind `evaluation-sandbox-runtime`) and GEPA already generates scripts, so P3-a/P3-b/P3-d are largely wiring; only **P3-c** (judge builder UI) is genuinely new.

- [ ] **P3-a** Standalone evaluation creation (`@domain/evaluations`): allow creating a judge evaluation (a script that calls `llm()`) linked to a fresh signal, not only via issue promotion; set `evaluations.signal_id`.
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

### Phase 5 — Unify judge execution onto the evaluation matching pipeline `[POST-MVP · internal]`

**Deps:** P2, P3.
**Ships:** judge execution moved from the standalone `EvaluationTrigger` path into the Phase-2 matching pipeline (shared `filters` pre-gate, one sandbox runner). No user-facing change.
**Safe because:** parity-tested behind a flag, then cut over; retires the temporary two-path state. **Shrinks** — judges already execute on the sandbox today, so P5-a/P5-b are largely verification; the genuinely-remaining work is **P5-c** (retire the standalone `EvaluationTrigger` *scheduling* path so all detectors share one pipeline).

- [ ] **P5-a** Run judges through `matchTracesToSignalsUseCase`'s sandbox runner.
- [ ] **P5-b** Parity suite (every stored judge: old path vs pipeline → identical scores).
- [ ] **P5-c** Cut over; remove the standalone trigger path.

**Exit gate:** parity suite green; standalone trigger path removed; no behavioral diff.

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
- [ ] **P7-d** Flagger consolidation: where a flagger overlaps a semantic signal (e.g. `frustration`), make the semantic evaluation canonical and retire the overlapping flagger; non-overlapping flaggers keep feeding sinks via discovery.

**Exit gate:** an evaluation script can call `similarity()`; moments run as semantic evaluations through the matching pipeline; overlapping flaggers retired, others unchanged.
