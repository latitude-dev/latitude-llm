# Signals

> **Documentation** — durable homes: `dev-docs/signals.md` and `dev-docs/monitors.md`. Related current docs: `dev-docs/scores.md`, `dev-docs/notifications.md`, `dev-docs/conversation-intelligence.md`, and `dev-docs/evaluations.md`.
>
> **Depends on** — `specs/sandbox-runtime.md`, the execution contract for evaluations: an evaluation run returns a normalized score (`value` ∈ [0,1]) and optional `feedback`; the host derives the run's verdict by thresholding `value` (`isScoreMatch`, default 0.5), and membership is recorded as `signal_id`. Phases 0–1 of that spec are built; Phase 2 (rule/script codegen + dry-run harness) is the substrate this spec consumes.
>
> **Superseded spec note** — `specs/monitors.md` has been retired. `dev-docs/monitors.md` is now authoritative for the shipped monitor model.
>
> **Origin** — LAT-664 ("Consolidate monitor situation"). The foundational choices (a signal's occurrences are its scores; membership is materialized at write time) are argued under [Why membership is materialized at write time](#why-membership-is-materialized-at-write-time).

## Contents

1. [Purpose](#purpose) — the problem and the consolidated model
2. [Why membership is materialized at write time](#why-membership-is-materialized-at-write-time) — the foundational argument
3. [Concepts](#concepts) — Signal, Evaluation, Score, Signal Escalation, Monitors, Incident
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
                evaluation runs per trace     escalation reads          records the
                (or annotation lands)         the score stream          source-keyed event
  Trace ──────▶ SIGNAL ─────────────────────▶ ESCALATION ENGINE ──────▶ INCIDENT ──▶ notifications
                membership = its SCORES                                source_type = signal
                (write-time materialized)

  Saved search / tool / user / session ─────▶ MONITOR ────────────────▶ INCIDENT ──▶ notifications
                                             single target + rule       source_type = monitor
```

The one-line mental model for users and docs:

> Latitude groups your traces into **Signals** — buckets you define with an **Evaluation** (a script Latitude runs on each trace, typically an LLM-as-judge it generates for you), plus the buckets Latitude discovers for you automatically from annotations. A signal's members are its **Scores**. Signal escalation opens signal-sourced **Incidents**; user **Monitors** are separate single-rule watches over saved-search/tool/user/session targets that open monitor-sourced incidents.

Two structural decisions carry the whole spec. Both are stated here and argued in full under [Why membership is materialized at write time](#why-membership-is-materialized-at-write-time):

1. **A signal's occurrences ARE its scores.** There is no separate occurrence ledger. Every evaluation run, every annotation, and every (future) custom push writes a `scores` row, and the ones whose trace belongs to the signal carry its `signal_id`. A signal's membership is exactly that `signal_id`-bearing subset (`passed` does not define membership — see [Score](#score--the-membership-ledger)). This collapses today's inconsistency — issues count scores, saved searches count traces — into one counting unit, and reuses the entire scores pipeline.
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

**A signal is a tracked bucket of traces.** Its members are the traces that have a score carrying its `signal_id`. A signal has:

- an **origin** (immutable, set at creation): `user` (built deliberately by a person) or `system` (auto-generated by Latitude's discovery — see [Discovery](#discovery-and-tracking)). Origin is the durable record of *how the signal was created*, independent of whether it has an evaluation, and it does **not** change when a discovered signal is later tracked with an evaluation. It is what gates annotation assignment — see [Discovery](#discovery-and-tracking).
- an optional **`filters`** (a `FilterSet`): a cheap, row-local pre-gate restricting which traces the evaluation is even run against ("only `service = checkout`", "only traces above p90 latency"). Empty/absent = all traces. `filters` is only meaningful alongside an evaluation — it gates evaluation execution.
- an optional **`evaluation`** (an `evaluations` row linked 1:1 via `evaluations.signal_id`, **one active per signal**): the membership detector, run at write time. With no linked evaluation there is no write-time detection — membership comes only from annotations. Having or not having an evaluation is a *state*, not a kind: a system-created signal starts with no evaluation and can later gain one (when tracked) while keeping `origin = 'system'`. Tell auto-generated from hand-built by `origin`, never by the presence of an evaluation.
- **triage metadata**: priority and a single assignee, carried over from issues (multi-assignee deferred).
- a **status** derived from age, activity, and signal-sourced incidents: `new`, `ongoing`, and `escalating`. Manual noise control is `muted_at`, not a resolved/ignored lifecycle.

Constraints:

- **Users cannot create an evaluation-less signal.** A `user`-origin signal must have an evaluation; only `system`-origin signals may have none. Because `origin` is fixed at creation, a `system` signal that is later tracked keeps `origin = 'system'` — and stays annotation-assignable — even though it now has an evaluation. This deliberately keeps "plain filter slices" out of signals — those stay **saved searches**. (A broad `filters`-only signal would write a score per trace; banning user-created evaluation-less signals removes that footgun entirely.)
- **One evaluation per signal.** A bucket has exactly one *active* detector evaluation (archived predecessors are kept for lineage across re-tracking / re-optimization, but only one is live). A concept that needs two detectors — e.g. semantic *and* judge for "frustration" — is one signal re-tracked with a different evaluation, or two signals. It is never one signal with two active evaluations.

### Evaluation (the detector)

**A signal's membership detector is an `evaluations` row**, linked 1:1 via `evaluations.signal_id` — exactly one active evaluation per signal. **An evaluation is always a script** that runs in the shared QuickJS sandbox (`specs/sandbox-runtime.md`); there is no detector taxonomy and no second engine. Its shape is defined once in [Data model → Shared contracts](#shared-contracts-domainshared-domainscores).

- **One engine, three ways to author the same script.** Every evaluation produces one `script` artifact, and that is exactly what executes: write it from a declarative **`settings`** object (compiled **deterministically** by the settings→script compiler `compileSettingsToScript`, built in PR3 — the `judge` shape shipped then, the `rule`/condition shapes in PR4b, #3739), generate and align it with **GEPA** (`optimize-evaluation`), or hand-write a **raw** script (advanced). `settings` is optional (NULL for a raw or GEPA-generated script); `script` is always present. Every compiled script runs against the mandatory `session` runtime object ([Shared contract — the `session` runtime object](#shared-contract--the-session-runtime-object-domainsandbox-pr4a)).
- **A judge is just a script that calls `llm()`.** "LLM-as-judge" is not a distinct type — it is the common case of a generated script whose body calls `llm()` (`const result = await llm(\`…\`, { schema }); return result.passed ? Passed() : Failed()`), running on the sandbox behind the `evaluation-sandbox-runtime` flag exactly as today. The `optimize-evaluation` workflow and alignment state (`alignment`/`aligned_at`) apply to these judge scripts; both arise when a user authors a judge directly (criteria → generated/aligned script) and via the discovery → tracking path ([Discovery](#discovery-and-tracking)), and are NULL for scripts that never call `llm()`.
- **The script returns a score and optional reasoning; the host derives the verdict.** Each run yields `value` (a normalized score ∈ [0,1], for sort/confidence/display) and optional `feedback`; the host derives the run's verdict by thresholding `value` (`isScoreMatch` against `DEFAULT_SCRIPT_SCORE_THRESHOLD` = 0.5). Membership is recorded as `signal_id`, not `passed` (see [Score](#score--the-membership-ledger)); the writer stamps the evaluation's signal when the behavior is *present* (`passed = true`). Definition edits (script or settings) apply **forward only** — a definition-changed marker appears on charts, and existing scores are never re-evaluated.
- **Type is a property of the `settings`, not the script.** A script can mix `llm()`, deterministic checks, and (later) semantic similarity, so an arbitrary script has no single type. The type lives in the **`settings`** of templated evaluations and drives the builder form; raw and GEPA-generated scripts are simply custom. "How many evaluations use `llm()` / semantic / code" is a separate, **multi-valued capability** question — answered by inspecting what the script does, not by a single type label (post-MVP analytics).
- **Every score is stored the same way.** There is no per-type or per-capability storage split: every evaluation's scores go to Postgres (canonical) and ClickHouse (analytics), exactly like annotations (see [Score](#score--the-membership-ledger)).

> **Semantic similarity is a deferred [R3](#r3--semantic-similarity-for-rule-evals-future) addition, not a separate engine.** When it lands, a `rule` condition will match on semantic similarity to an anchor; the sandbox execution mechanism (an on-demand per-run embedding vs a batch lane over precomputed embeddings) is open design. Every evaluation is still a sandbox script reading the `session` object.

### Score — the membership ledger

**A signal's occurrences are its scores.** Every membership-bearing event writes a `scores` row carrying `signal_id`; nothing else records membership. A score's `source_type` is one of `evaluation`, `flagger`, `user`, or `custom` (enum in [Data model](#shared-contracts-domainshared-domainscores)).

- **Membership is `signal_id`.** A trace is a member of a signal when it has a score carrying that signal's `signal_id`; `signal_id` is the only thing that records membership. The signal's occurrence count is the **distinct `trace_id`** among those rows — so a trace touched by successive evaluation generations (after the signal is re-tracked or re-optimized into a new evaluation id) counts once, matching the per-`(signal, trace)` monotone-membership guarantee in `specs/sandbox-runtime.md`. Occurrence reads are just `scores WHERE signal_id = ?`; they never gate on `passed`.
- **`passed` is source-specific and does not define membership.** For an `annotation` it is human sentiment (thumbs-up = `passed = true`, thumbs-down = `passed = false`); for `custom` it is caller-defined. For an `evaluation` it is the detector's verdict — host-derived by thresholding the script's `value` (`isScoreMatch`) — and the signal's behavior is *present* when `passed = true`. `signal_id` is assigned independently of the `passed` value: the writer stamps the evaluation's own signal when the behavior is present, and discovery assigns a signal to negative (`passed = false`) annotations.
- **Non-membership runs are written too.** An evaluation writes a score on **every** run: present runs carry `signal_id` (occurrences); absent runs leave `signal_id` null but are still stored — they give exact pass-rate, denominators, and dashboards without read-time estimation, and stay attributable to the evaluation via `source_id`.
- **Every score is stored the same way** — written to Postgres (the canonical, mutable source of truth) and synced to ClickHouse (the analytics mirror monitors count over), reusing the existing scores pipeline (`dev-docs/scores.md`). There is **no per-type or per-capability storage split**: judge scores, deterministic-script scores, and annotations all persist identically. The only nuance is the existing draft lifecycle — a *mutable* score (a drafted annotation) stays Postgres-only until published, then syncs; an evaluation run (or a confirmed annotation) is immutable and is written + synced on arrival.

  *(Scale lever, not the MVP: if deterministic scripts that run on every trace ever strain the canonical path, those recomputable, feedback-free scores could go ClickHouse-only — a future per-run optimization, never a rule about evaluation kinds.)*

### Signal Escalation

Signal escalation is intrinsic to the signal, not represented as a default monitor. The score occurrence series feeds the shared `EscalationEngine`; when the engine enters, the incidents domain opens an incident with `source_type = "signal"` and `source_id = signal.id`. When the engine exits, it closes that same source-keyed incident.

Signal mute (`signals.muted_at`) suppresses notification fan-out for `signal.escalating` incidents. It does not stop score assignment, discovery matching, or linked evaluation execution.

### Monitors

User monitors are a separate single-rule surface over saved-search/tool/user/session targets. They write monitor-sourced incidents with `source_type = "monitor"` and source keys `monitor.match`, `monitor.threshold`, or `monitor.escalating`. See `dev-docs/monitors.md`.

### Incident

Incidents are the shared alert hub. Signal escalation and monitor rules both write `incidents` rows keyed by `(source_type, source_id)`, and the notifications pipeline derives `incident.event`, `incident.opened`, or `incident.closed` from the row lifecycle. Signal incidents use project gate `signal.escalating`; monitor incidents use the `monitor.*` gates.

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
- the **sandbox runner** executes the evaluation's `script` in the shared sandboxed JS (QuickJS) runtime — the single execution path for every evaluation (judge scripts call `llm()`; deterministic scripts don't). The script runs against the mandatory `session` runtime object (PR4a), assembled at eval time from all traces of the trigger trace's session ([Shared contract — the `session` runtime object](#shared-contract--the-session-runtime-object-domainsandbox-pr4a)).
- evaluation-specific options (`sampling`, `turn`, `debounce`) are settings on the evaluation row, not pipeline concepts.

A run writes a score (matched or not) with `signal_id`, `source_type = 'evaluation'`, `source_id` = the evaluation id, persisted to Postgres + ClickHouse like any score (see [Score](#score--the-membership-ledger)). Signals with no evaluation are not in this pipeline — their membership comes only from annotations.

*(Semantic-similarity detection is deferred to [R3](#r3--semantic-similarity-for-rule-evals-future); its sandbox execution model is open design.)*

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
      └─ publishes signal escalation checks as needed
```

### B. Create a signal manually (user origin, must have an evaluation)

```
UI: Signals page / "Create signal from this search" → builder (live preview required)
└─ createSignalUseCase { origin: 'user', evaluation: { settings | script }, filters? }
   ├─ compile settings→script (or accept a raw script); sandbox ScriptCompileError rejects at save time
   ├─ judge path: generate the script via optimize-evaluation; alignment accrues from annotations
   ├─ detect capability from the script (does it call llm()?) → execution lane + backfill eligibility (not storage; storage is uniform)
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

### D. Signal escalation → incident → notification

```
score assignment / scheduled escalation checks
└─ ScoreOccurrenceReader (count where signal_id=? AND passed = false)
└─ EscalationEngine
   ├─ enter → incident insert source_type='signal', source_id=signalId → IncidentCreated
   └─ exit  → close open signal incident → IncidentClosed
      → notifications (project gate: signal.escalating; mute gate: signal.mutedAt)
```

### E. Triage from the signal page

```
[Mute]   → muteSignalUseCase: signal.muted_at = now (scores keep recording; notifications do not fan out)
[Unmute] → muteSignalUseCase: signal.muted_at = null
[Delete] → deleteSignalUseCase:  soft-delete signal (deleted_at) + archive its
              evaluation (auto write-stop via the active-detector scan). No CH cleanup —
              deleted-signal scores linger and are excluded read-side via PG state.
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

**No new signal membership table.** Every entity evolves a table that already exists: `issues` → `signals` (rename + columns), `scores` (rename + split source), `evaluations` (rename + a `settings` column — the detector now lives here, always as a script), and the ClickHouse `scores` analytics table (one column). Occurrences are scores — there is no separate occurrence table. Alerting now goes through the shared source-keyed `incidents` hub (`monitor | signal`), with monitor details documented in `dev-docs/monitors.md`. `legend: ▸NEW ▸CHANGED ▸KEPT ▸DROPPED` is per-line below.

### Shared contracts (`@domain/shared`, `@domain/scores`)

These are the single source of truth for the enums and evaluation shape referenced throughout the spec.

```ts
// NEW (@domain/shared)
export const SIGNAL_ORIGINS = ["user", "system"] as const
//   user   — hand-built by a person; MUST have an evaluation; never annotation-assignable
//   system — auto-generated by discovery; annotation-assignable, even after it's tracked with an evaluation
// `origin` is set at creation and never changes — the durable "auto-generated?" marker, distinct from the
// mutable "has no evaluation yet" state, and the gate for annotation assignment.
// (POST-MVP: if system-PROVISIONED detector signals ever exist — e.g. moments, out of scope — split `system`
//  into `discovered` vs `provisioned` so provisioned detector signals are not annotation-assignable.)

// An evaluation is ALWAYS a script (evaluations.script) that runs in the QuickJS sandbox
// (specs/sandbox-runtime.md). There is no `type` or `capability` column on the row:
//   - the script returns { value (score 0..1), feedback? }; the host derives the verdict by thresholding value (isScoreMatch, default 0.5). Membership is signal_id, not passed.
//   - type lives in `settings` (templated evals → forms); what a script does (llm/semantic/code) is
//     detected when needed (execution lane, analytics) — not a stored column.
//   - storage is uniform: every score → Postgres (canonical) + ClickHouse (analytics); no store-routing.

// `settings` is the OPTIONAL declarative config a user edits in the builder; it compiles to `script`
// (deterministic codegen for `rule` options, or the single-sourced judge template for a `judge`) and is
// NULL when the script is hand-written (advanced). The judge kind shipped in PR3; the `rule` kind +
// conditions shipped in PR4b (#3739). The runtime contract every compiled script reads is the `session`
// object (PR4a, #3734) — see "Shared contract — the `session` runtime object" below.
export type EvaluationSettings =
  | { kind: "judge"; criteria: string }   // PR3 — a script that calls llm(`${session.conversation}` …), generated + aligned via optimize-evaluation
  | {                                       // PR4b — deterministic conditions compiled to a pure script over `session`
      kind: "rule"
      match: "all" | "any"                 // AND / OR across the 1–10 conditions
      conditions: Condition[]
    }

// Condition kinds (PR4b, #3739). Content conditions read session.conversation by role; metric reads
// session/per-trace aggregates (base units); tool/finish read session.traces[].{tools,finishReasons}.
type MessageScope = "last_assistant" | "any_assistant" | "any_user" | "any_tool" | "conversation"
type Condition =
  | { type: "text_match"; scope: MessageScope; operator: "contains" | "not_contains" | "matches_regex" | "not_matches_regex"; value: string; caseSensitive?: boolean }
  | { type: "empty_output" }
  | { type: "output_length"; unit: "chars" | "words"; operator: "gt" | "gte" | "lt" | "lte"; value: number }
  | { type: "json_output"; expectation: "valid" | "invalid" }
  | { type: "metric"; field: "duration" | "cost" | "tokensTotal" | "tokensInput" | "tokensOutput" | "errorCount" | "traceCount" | "spanCount"; aggregation: "session" | "anyTrace" | "allTraces"; operator: "gt" | "gte" | "lt" | "lte"; value: number }  // traceCount: session only
  | { type: "tool_used"; toolName: string }
  | { type: "tool_failed"; toolName?: string }   // span-status only (not tool-output payload)
  | { type: "tool_call_count"; operator: "gt" | "gte" | "lt" | "lte"; value: number }
  | { type: "error" }
  | { type: "finish_reason"; value: string }   // provider-specific free string ("stop", "tool_calls", "length", …)
  | { type: "semantic_similarity"; query: string; operator: ComparisonOperator; threshold: number }  // R3 — max cosine vs `query` over the session, via the `semanticSimilarity()` host verb reusing ingest embeddings
// Moments/flagger consolidation is out of scope.

// CHANGED (@domain/scores): renames SCORE_SOURCES `source`→`source_type` and splits annotation→flagger/user.
// `evaluation` is KEPT (a signal's detector is an evaluation), so existing evaluation-sourced scores need
// no remap or backfill.
export const SCORE_SOURCE_TYPES = ["evaluation", "flagger", "user", "custom"] as const
export type ScoreSourceType = (typeof SCORE_SOURCE_TYPES)[number]
//   evaluation — written by the signal's evaluation at ingest   (source_id = evaluation id)
//   flagger    — automatic flagger annotation                   (source_id = flagger key)
//   user       — human annotation (UI / API / queue)            (source_id = user id / sentinel)
//   custom     — public /scores push  [POST-MVP]                (source_id = caller tag)

// CHANGED (@domain/shared, alert-incident-kinds.ts): incidents now use source types
// monitor | signal and notification keys:
//   signal.escalating
//   monitor.match
//   monitor.threshold
//   monitor.escalating

// ALREADY EXISTS (@domain/shared, alert-incident-condition.ts) — reused verbatim:
//   MonitorMetric         = { kind:"count" } | { kind:"errorRate" } | { kind:"avg"|"median"|"sum"|"min"|"max"; field:"duration"|"cost"|"tokens" }
//   AlertMetricThreshold  = absolute(value) | multiplier(factor, baseline) | expected(sensitivity)   // + direction above|below
//   threshold / escalating conditions carry { metric, threshold, direction?, window? }
```

### Shared contract — the `session` runtime object (`@domain/sandbox`, PR4a)

Every evaluation script runs against a **single mandatory `session` global** (there is no `conversation`/`issue`/`signal` global). It is assembled at eval time from all traces of the trigger trace's session and bound into the QuickJS sandbox. Messages live in exactly one place (`session.conversation`, deduped); there is no raw per-span array — tool spans are projected to a focused `tools` list and the rest is rolled up per trace. Base units: ns, microcents, token counts.

```ts
interface ScriptSessionContext {
  id: string
  traceCount: number; spanCount: number; errorCount: number
  duration: number; timeToFirstToken: number            // ns
  cost: { input: number; output: number; total: number } // microcents
  tokens: { input: number; output: number; total: number; cacheRead: number; cacheCreate: number; reasoning: number }
  startTime: string; endTime: string; userId: string
  tags: string[]; metadata: Record<string, string>
  conversation: { role: string; content: string }[]      // deduped, session-wide; toString() → "[role] content" lines (used by llm())
  traces: {
    id: string; name: string; status: string; errorCount: number; spanCount: number
    duration: number; timeToFirstToken: number; cost: {…}; tokens: {…}
    models: string[]; providers: string[]; finishReasons: string[]
    tools: { name: string; input: string; output: string; error: boolean; duration: number }[]   // all tool spans; input/output truncated
  }[]
}
```

A judge reads `session.conversation` (its `toString()` is interpolated as `${session.conversation}` in the generated prompt); rule conditions read the structured fields. `alignment`/optimization wrap a single example's conversation via `minimalScriptSession(conversation)`.

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
  muted_at            timestamptz null    ▸CHANGED  -- manual notification mute
  deleted_at          timestamptz null    ▸NEW   -- issues were NOT soft-deleted; signals are (delete flow soft-deletes)
  created_at, updated_at                  ▸KEPT
  -- DROPPED: `uuid` (dormant legacy column)

  unique  (organization_id, project_id, slug)  WHERE deleted_at IS NULL     ▸CHANGED  -- now partial (soft-delete)
  gin     (search_document)                                                 ▸KEPT
  btree   (organization_id, project_id, created_at) WHERE deleted_at IS NULL   ▸KEPT
```

The detector is no longer a `signals` column — it is the linked `evaluations` row (one active per signal; a system-created signal may have none). "List active detectors" for the matching pipeline reads `evaluations` (the supporting partial index lives there — see below) and joins back to `signals` to apply signal-level lifecycle gating (`deleted_at`). Muted signals still record scores and can be matched by discovery; mute only gates notifications.

(Semantic-similarity anchors and their embeddings are deferred to [R3](#r3--semantic-similarity-for-rule-evals-future); the MVP detector is always a sandbox script.)

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

- **`signal_id` IS the materialized membership flag; `passed` is the source-specific verdict/sentiment** (see [Score](#score--the-membership-ledger)), never membership. For evaluations the host derives `passed` at write time by thresholding the script's `value` (`isScoreMatch` against `DEFAULT_SCRIPT_SCORE_THRESHOLD` = 0.5; `Passed()`/`Failed()` set `value` = 1/0), and the writer stamps `signal_id` when the verdict is *present* (`passed = true`). So **membership reads need no runtime threshold**: a signal's occurrences are the distinct traces in `scores WHERE signal_id = ?`. Definition edits apply forward-only — old rows keep their frozen `value`/`passed`.
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

### Postgres: `monitors`

Monitors are independent project watches with one target and one rule. They are not provisioned per signal. The current monitor target types are saved search, tool, user, and session; monitor incidents write `source_type = "monitor"` and `source_id = monitors.id`. See `dev-docs/monitors.md` for the authoritative monitor data model.

### Postgres: `incidents`

Incidents are the shared alert hub for both signal and monitor producers.

```
incidents
  id, organization_id, project_id
  source_type varchar(32) NOT NULL  -- monitor | signal
  source_id   varchar(24) NOT NULL
  severity    varchar(16) NOT NULL
  condition   jsonb null            -- monitor rule condition snapshot, null for signal escalation
  entry_signals jsonb null
  exit_eligible_since timestamptz null
  started_at, ended_at, created_at
```

Signal escalation incidents use `source_type = "signal"` and notification gate `signal.escalating`. Monitor incidents use `source_type = "monitor"` and derive `monitor.match`, `monitor.threshold`, or `monitor.escalating` from their condition snapshot.

### ClickHouse: `scores` analytics (one new column; append-only)

ClickHouse migrations are append-only (`ch:create`), so this is `ADD COLUMN`, not a rename:

```sql
ALTER TABLE scores ADD COLUMN signal_id FixedString(24) DEFAULT '';   -- NEW; backfill = old issue_id via one ALTER UPDATE, then issue_id deprecated
-- `source` (FixedString(32)) now also carries flagger|user (it already carries 'evaluation' today, so no historical remap).
--   bump skip index idx_source set(3) → set(4) to keep it selective for four values.
-- everything else unchanged: value Float32, passed Bool, errored Bool, duration/tokens/cost UInt64, created_at.
```

- **The CH `scores` table is the single signal counting/aggregate surface** escalation and analytics read; it loses its issue-trend special-casing. Occurrence count = `countDistinct(trace_id) WHERE signal_id = ? AND passed = false`. Metric aggregates (`avg`/`median`/`sum`/`min`/`max` of trace `duration`/`cost`/`tokens`) join the matched `trace_id` back to the traces analytics — the score's own duration/tokens/cost are the *evaluation's* (zero for scripts that don't call `llm()`), not the trace's.
- All scores follow the existing Postgres-canonical → ClickHouse sync (drafted annotations sync once published). No CH-only split in the MVP.

## UI

### Navigation

A **Signals** nav item replaces **Issues** (single list — hand-built and discovered signals together; `origin` distinguishes them and is a filter/column). Issue URLs (`/projects/$slug/issues/...`) redirect into the corresponding signal pages. **Monitors** stays, generalized to the cross-target operational view.

### Signals list

One table; `origin` (auto/manual), priority, assignee, trend, escalation state, and last signal incident are columns/filters on the same surface.

### Signal detail page

Definition (evaluation + filters), signal trend, escalation incidents, mute state, and member traces in one context. System-created signals with no evaluation show their annotation evidence and a **Track** action; judge evaluations (scripts that call `llm()`) additionally show the alignment sections (confusion matrix, realign).

### Creating a signal

One builder ([R1](#r1--builder-ui-mvp), shipped #3773), three entry points (Signals list "New signal", "Create signal from this search", and **Edit** on the signal detail page), one rule: **never let users define membership blind** — the builder always shows a live preview (`previewEvaluationUseCase`: compile + run against recent sample sessions, no persist). Creation opens on a **describe-first intro** (what a signal is + an animated session→evaluation→signal flow diagram + a single textarea, [R4](#r4--agentic-signal-creation-shipped)): the user describes what to track and an AI-driven use case generates and creates the whole signal, or clicks **Configure manually** to enter the wizard, which runs **Evaluation → Scope → Test → Details** (the intro is a shortcut, not a wizard step — Back from the first step returns to it; there is no method-cards screen, the first step's tabs pick the kind). The evaluation tabs are **Set of conditions** (deterministic conditions over the `session` object; `semantic_similarity` is an [R3](#r3--semantic-similarity-for-rule-evals-future) addition), **LLM as judge** (`criteria` → a script that calls `llm(\`${session.conversation}\` …)`; the label is a sentence scaffold — "A session matches when…" — so the input reads as a description of the session, not instructions), and **Custom script** (the compiled view of the current evaluation — settings render as the exact script that runs, read-only until "Edit as custom script" detaches to a raw `script`; the R2 in-tab "describe your eval" affordance was retired into [R4](#r4--agentic-signal-creation-shipped)). The Scope step frames `filters` ("which sessions should be checked?") and `sampling` ("how many of them?") as two questions, with cost copy that adapts to the evaluation kind. Conditions/judge compile a declarative `settings` form; Custom script stores a raw `script` (`settings = null`). Editing opens a tabbed shell instead of the wizard (**Evaluation | Scope | Test** — jump straight to what you're changing; only what changed is saved) and updates the active evaluation **in place** (same evaluation id; forward-only — existing scores keep their frozen membership); a user signal can be freely re-authored across kinds (settings ⇄ raw script). `origin=system` signals are not editable in the builder.
### Monitoring

Signal escalation is built into the signal detail flow and notification pipeline. User-created monitors remain the project-level monitor surface for saved-search/tool/user/session targets.

## API / SDK / MCP

Signals are exposed as a public REST surface under `/v1/projects/{projectSlug}/signals`, following the **monitors** routes as the template (`defineApiEndpoint`, `createSignalsRoutes` factory, rich `.describe()` field docs that propagate to both the TS SDK and MCP tools; regen via `pnpm openapi:emit` / `pnpm mcp:emit` / SDK generate).

| Method | Path | Operation id |
| --- | --- | --- |
| GET / POST | `/` | `listSignals` / `createSignal` |
| GET / PATCH / DELETE | `/{signalSlug}` | `getSignal` / `updateSignal` / `deleteSignal` |
| GET | `/{signalSlug}/traces` | `listSignalTraces` |
| POST | `/{signalSlug}/mute`, `/unmute`, `/track` | `muteSignal` / `unmuteSignal` / `trackSignal` |

- `createSignal` accepts an `evaluation` — its `settings` (default, compiled to a script; judge `criteria` is the first settings form) or a raw `script` (advanced) — plus optional `filters`; rejects evaluation-less creation (only system-created signals may have no evaluation).
- Monitors remain a separate target/rule API; signal escalation is exposed through signal incidents, not signal-target monitors.
- `custom`-source score push (the `/scores` API accepting `signal_id`) is **POST-MVP**.

## Migration

- **Issues → signals, in place.** Rename `issues` → `signals` (keep rows, centroid, embeddings); existing issues become `origin = 'system'` (auto-generated, annotation-assignable as today) — those with no linked evaluation keep none, those with a generated evaluation keep it; either way `origin` stays `system`. Issue-linked evaluations stay as they are (they are already judge scripts that call `llm()`): set `evaluations.signal_id` and **dedupe to one active per signal** (keep the most-recently-aligned active, archive the rest) so the active-detector unique index can be created. `scores.issue_id` → `signal_id` (Phase 1); `source` → `source_type` (Phase 2/PR1, PG only — the CH column stays `source`; `evaluation` is kept; `annotation` splits into `flagger`/`user` in Phase 6).
- **System alerting** becomes signal escalation incidents using `source_type = "signal"` and notification key `signal.escalating`.
- **Flaggers** stay as the trace-end auto-annotation engine feeding system-created signals (flow C), unchanged.
- **Semantic moments** and the annotation **flaggers** stay as the separate conversation-intelligence / annotation systems they are today. Consolidating them with signal evaluations (re-expressing moments as `origin=system` evaluations, retiring overlapping flaggers) is **out of scope** for the signals roadmap.

## Decisions

### Settled choices (each is detailed in the linked section)

1. **Membership is materialized at write time** — forced by the cost model. → [Why](#why-membership-is-materialized-at-write-time)
2. **A signal's occurrences ARE its scores** — membership = scores carrying the signal's `signal_id`, counted as distinct traces per signal; `passed` is the source-specific verdict/sentiment, not membership. All scores reuse the existing Postgres + ClickHouse scores pipeline, so the single ledger needs no new table. → [Score](#score--the-membership-ledger)
3. **Automatic discovery is kept** as system-created (`origin = 'system'`) signals. Annotation assignment is gated on `origin` (immutable), not on whether the signal has an evaluation — so a tracked system-created signal keeps accepting annotations. → [Discovery](#discovery-and-tracking)
4. **One evaluation per signal, on the existing `evaluations` table, always a script** — not a separate detector entity, not a jsonb column on the signal, no `type`/`capability` columns. A `settings` object optionally compiles to the `script`; the script is what executes. Exactly one *active* evaluation per signal (archived predecessors kept for lineage); a system-created signal may have none. → [Evaluation](#evaluation-the-detector)
5. **Evaluations write every run** (present and absent), mirroring how judges persist pass and fail today; occurrences are the rows carrying `signal_id`. **All scores are stored the same way** — Postgres-canonical + ClickHouse mirror, no per-type or per-capability split. → [Score](#score--the-membership-ledger)
6. **Users cannot create evaluation-less signals** — only `system`-origin signals may have no evaluation, which removes the pure-filter write-amplification footgun; `filters` is only an evaluation pre-gate; plain filter tracking stays saved searches + monitors. → [Signal](#signal)
7. **Mute stays on the signal row** for the MVP; escalation is represented by source-keyed incidents, not by a default monitor. → [Signal](#signal)
8. **Script evaluations are the MVP detector; the judge is a generated script that calls `llm()`.** Both arise from the builder (settings → script, or raw script) and from the discovery → tracking path. **There is no tunable threshold**: the script returns `Passed`/`Failed`, so the cutoff is written into the script; `value` is only confidence/sort. **Semantic similarity** is deferred to [R3](#r3--semantic-similarity-for-rule-evals-future) — the `semantic_similarity` rule condition plus an open-design sandbox execution model (PR4b shipped only pure conditions). **Custom-source scores** (`/scores` accepting `signal_id`) are POST-MVP.
9. **No per-project signal cap.** Evaluation matching cost and score write volume are bounded by the shared selection pre-gate (sampling / turn / filter) and the single `signals:match` pipeline, not by an arbitrary count limit.
10. **A signal's behavior is present when `passed = true`.** Membership is `signal_id`; the writer stamps it when an evaluation's verdict is present (`passed = true`), and the generated-judge convention (baseline prompt + GEPA proposer) sets `passed = true` when the behavior is present. `passed` is host-derived per run, so the convention lives in the runtime sites (writer, discovery eligibility, alignment scoring) and the judge prompt — no stored flag, no `scores` migration. → [Evaluation](#evaluation-the-detector) / [Score](#score--the-membership-ledger) / [Phase 2 PR2](#phase-2--evaluation-substrate--script-evaluations-mvp)

## Tasks

> **Status legend** — `[ ] pending`, `[~] in progress`, `[x] complete`.
>
> Each phase is an **independently shippable, behavior-preserving deploy**: production keeps working after every phase. Parallelism lives *within* a phase (tasks sharing dependencies run concurrently); phases themselves are mostly sequential, which is the deliberate price of safe incremental rollout. **MVP = Phases 1–4.** Every phase updates the relevant `dev-docs/*` as part of its definition of done (the "remember docs" requirement).
>
> **Incremental-schema note.** The data-model end state above is reached over several phases, not at once. `source_type` is a one-step rename (`source`→`source_type`, PG only — the CH column stays `source`); the `evaluation` value is **kept** (no remap), and `annotation` splits into `flagger`/`user` in Phase 6 — there is no add-then-collapse round trip. Alerting converges on the source-keyed `incidents` hub: signal escalation writes `source_type = "signal"`, while monitors write `source_type = "monitor"` from the single-rule monitor evaluator. **The exception is Phase 2's engine cutover** ([below](#phase-2--evaluation-substrate--script-evaluations-mvp)), which is not an incremental additive step (no feature flag, brief accepted downtime); its membership-polarity inversion was subsequently **reverted** back to the original `passed = false` = present convention.

### Phase 1 — Rename Issues → Signals `[MVP]`

**Deps:** none.
**Ships:** the entire current system under the Signals name — discovery, monitors, alerts, notifications behave identically.
**Shape:** a **single atomic PR** (not stacked) — a TS-source workspace can't half-rename a package and compile, so the package rename and all ~50 importers land together; coordinate the SDK release (major bump).
**Safe because:** semantics are unchanged. The only non-trivial parts are the two corrections below; everything else is a mechanical identifier/path rename gated by `pnpm typecheck` + a residue grep.

> **Corrections to the original "pure rename" framing** (verified in code; full rationale in `dev-docs/signals.md`):
> 1. **Event identifiers are not a free rename.** An event name (`IssueCreated`, `ScoreAssignedToIssue`, …) is one identifier in four places — the `EventPayloads` TS key, the type-checked `eventName` literal, the persisted `outbox_events.event_name` dispatch token, and the total handler-map key. Renaming requires moving all four **together** (type-consistent), **migrating stored values**, **and** a temporary legacy-name alias at the `domain-events` dispatcher — the outbox + BullMQ `domain-events` queue hold in-flight rows the migration can't reach, and unhandled names dead-letter (= lost alerts).
> 2. **In-place PG `RENAME` causes brief downtime** (migrations run as a one-shot task before a rolling service deploy, so old tasks query the renamed table for the rollover window). This is **accepted** — no long-term issues. ClickHouse, being append-only, EXPANDs (ADD `signal_id`, keep `issue_id`) instead.
> 3. **KEEP wire-level tokens** (rename surrounding code, keep the string + a TODO): BullMQ queue/topic `"issues"` + ops + dedupe-key prefixes, Temporal workflow type names, Redis lock keys (`org:*:issues:*`, `issue:${id}`), export `kind:"issues"`, the `issue.*` alert kinds + source type `'issue'` (these are *retired*, not renamed, in later phases), and the CH `issue_id` column. Renaming them needs a coordinated drain, not a rename, and buys nothing user-visible.

- [x] **P1-a** PG **in-place RENAME** migration (hand-written via `pg:generate:custom` — Drizzle has no `RENAME COLUMN` precedent and interactive rename detection is unavailable in CI): `ALTER TABLE issues RENAME TO signals`; `scores`/`evaluations` `RENAME COLUMN issue_id → signal_id`; `ALTER INDEX … RENAME`; `ALTER POLICY issues_organization_policy → signals_organization_policy`. Plus the **outbox value migration** for correction (1): `UPDATE outbox_events SET event_name = 'Signal…' WHERE event_name = 'Issue…' AND published = false` (×6) and `aggregate_type 'issue'→'signal'`. Verify `snapshot.json` + data-preservation on a copy.
- [x] **P1-b** CH **EXPAND** (`pnpm --filter @platform/db-clickhouse ch:create`, append-only): `ALTER TABLE scores ADD COLUMN signal_id FixedString(24) DEFAULT ''`; `ALTER TABLE scores UPDATE signal_id = issue_id WHERE issue_id != ''`; rebuild the `scores_hourly_buckets` MV keyed on `signal_id` (DROP VIEW→DROP TABLE→CREATE→full re-aggregate backfill); `score-fields.ts` adds `score.signalId`; `score-analytics-repository.ts` reads `if(signal_id != '', signal_id, issue_id)` during the async mutation. **Keep `issue_id` until the [Cleanup](#cleanup--legacy-storage-retirement-post-mvp) roadmap item.**
- [x] **P1-c** Domain rename `@domain/issues`→`@domain/signals`: folder + package name + tsconfig path alias + all imports; `Issue*`→`Signal*` types/ports/use-cases; `IssueId` brand → `SignalId` (`@domain/shared/id.ts`); `Score.issueId`→`signalId` (`@domain/scores`); also rename `EvaluationIssueRepository` in `@domain/evaluations`. **Events:** rename `EventPayloads` keys + literals + handler-map keys + payload types together, **and** add the `EVENT_NAME_ALIASES` shim at the dispatcher (`apps/workers/src/workers/domain-events.ts`) per correction (1). **Keep alert-kind strings `issue.*`** (persisted; *retired* later) — only relabel `ALERT_INCIDENT_KIND_LABEL`.
- [x] **P1-d** Platform: `@platform/db-postgres` `issue-repository`→`signal-repository`, schema `issues.ts`→`signals.ts`, mappers, seeds, export `IssueRepositoryLive`→`SignalRepositoryLive`. Plus the rest of the importers (workers, workflows, `@domain/{notifications,monitors,integrations,email}`, web server-fns) — flip import path + symbol; KEEP wire-token strings.
- [x] **P1-e** API: `apps/api/src/routes/issues.ts`→`signals.ts`; parameterize the Fern-group + op-id factory so one definition set mounts at `/projects/:projectSlug/signals` (group `signals`, op-ids `listSignals…`) **and** `/projects/:projectSlug/issues` (group `issues`, op-ids `listIssues…`, `deprecated:true`, TODO to remove). `pnpm generate:sdk` (emits openapi/mcp + Fern TS+Python) → both `client.signals.*` and deprecated `client.issues.*` generate.
- [x] **P1-f** Web: signals routes/pages/`-components` (`issues/`→`signals/`, `$issueId`→`$signalId`, `issue-*`→`signal-*`), `domains/issues`→`signals`, `useIssue*`/`getIssue*`→`useSignal*`/`getSignal*`; `ProjectSidebar` nav; `/issues/...`→`/signals/...` redirect (sibling layout route) + legacy `?issueId=` `beforeLoad` redirect kept. **Keep search-param key strings** (`issuesSearch` etc.) so redirect-preserved bookmarks resolve.
- [x] **P1-g** Copy: notification templates + `ALERT_INCIDENT_KIND_LABEL` Issue→Signal wording (email/Slack/in-app); keep variable names (`issueUrl`/`issueId`) and saved-search branches.
- [x] **P1-h** Docs: `dev-docs/issues.md`→`dev-docs/signals.md` (record corrections 1–3); fix references in `monitors.md`/`scores.md`/`reliability.md`/`notifications.md`/`evaluations.md`; `specs/issue-details-page.md`; AGENTS.md skill glossary; **public Mintlify `docs/` pages + redirects**.

**Exit gate:** full suite green; `/issues` URLs + `?issueId=` deep links redirect; both `client.issues.*` (deprecated) and `client.signals.*` SDK groups resolve; an emitted score still routes through the renamed dispatch (incl. a legacy `IssueCreated`-named outbox row via the alias) and opens an `alert_incidents` row; PG migration data-preserving; `grep -rl "@domain/issues"` empty. Brief rollover downtime is the only behavioral diff.

> **Post-deploy cleanup (later phase):** remove `EVENT_NAME_ALIASES`, the `/issues` API alias + `issues` SDK group, the CH `issue_id` column, and retire the `issue.*` alert kinds — the [Cleanup](#cleanup--legacy-storage-retirement-post-mvp) roadmap item.

### Phase 2 — Evaluation substrate + script evaluations `[MVP]`

> **Delivered as self-contained PRs (big-bang cutover, no feature flag).** **PR1 — engine cutover** (membership = `signal_id`, `signals:match`, `source_type` rename, sandbox `value` contract), **PR2 — present-verdict convention** (present ⇒ `passed = true`, #3661), and **PR3 — user-created signals over the API + MCP** (#3690) are **shipped**. The remaining builder work expanded into three PRs: **PR4a — session runtime context** (#3734, evaluations run against a rich `session` object) and **PR4b — conditions contract + codegen** (#3739, settings-defined deterministic conditions, all pure) are **shipped**; the builder UI shipped as **R1** (#3773) in the [roadmap](#roadmap--remaining-work) below. Phase 5 (unify judge execution onto the matching pipeline) is **folded into PR1**.

**Deps:** P1.

**Membership is `signal_id`; `passed` is the source-specific verdict/sentiment.** A trace is a member of a signal when it carries that signal's `signal_id`; occurrence reads are `scores WHERE signal_id = ?` and never gate on `passed`. `passed` means different things per source — an **annotation**'s is human sentiment (thumbs-up = `passed = true`, thumbs-down = `passed = false`); an **evaluation**'s is the detector's verdict (host-derived from `value` via `isScoreMatch`). The writer stamps the evaluation's `signal_id` when its verdict is *present* (`passed = true`). Absent runs are still written (`signal_id` null). Annotations get a `signal_id` from discovery, which triggers on negative (`passed = false`) annotations.

#### PR1 — Engine cutover `[x] complete`

> *Shipped, then its polarity-flip portion was **reverted** (#3647). The original cutover briefly made present ⇒ `passed = true` and always-stamped `signal_id`; that was undone (historical scores re-flipped, `evaluations.legacy_polarity` dropped) back to the uniform present ⇒ `passed = false` baseline described below. The infrastructure parts — `signals:match`, the `source_type` rename, `signal_id` as membership, the sandbox `value` contract — were kept. **PR2 establishes `passed = true` = present** as the convention (below). This is why git shows a revert and the PR1 bullets below read `passed = false`.*

- [x] **Sandbox `value` contract**: the script returns `value` (+ optional `feedback`) and does **not** return a `passed` field; the host derives the run's verdict by thresholding `value` via `isScoreMatch` against `DEFAULT_SCRIPT_SCORE_THRESHOLD` = 0.5 (`Passed()`/`Failed()` set `value` = 1/0). The run **result** then exposes a host-attached `passed` verdict — that is what the writer and alignment sites read (and what PR2 keys off); on the legacy LLM-judge execution path the `passed` comes from the model's structured output.
- [x] **Single present-verdict convention (PR2 flips it to `passed = true`)**: PR1 shipped one convention for all evaluations — behavior *present* ⇒ `passed = false`. The convention **instruction text** lives in the baseline judge prompt (`baseline-prompt.ts`); it is also embedded in the GEPA proposer's wrapper, alignment/optimization scoring, discovery eligibility (`check-eligibility`), and the alignment-examples positive/negative selection. Annotation sentiment (thumbs-up = `passed = true`) is independent and unchanged.
- [x] **`signals:match` replaces `run-live-evaluation`'s scheduling** for ALL origins: a new `signals:match` worker off `TracesIngested` (gated `!isSandbox`, debounced like trace-end) owns evaluation selection (sampling/turn/filter) and re-feeds the existing `live-evaluations:execute` queue. `trace-end` drops its evaluation fan-out (keeps live-queues / flaggers / saved-search / trace-search / conversation-intelligence). The writer stamps `signal_id` when the evaluation's behavior is present; membership = the `signal_id`-bearing subset.
- [x] **`scores.source` → `source_type`**: real in-place PG `RENAME COLUMN` + domain field + every DB query. **ClickHouse column stays `source`** (it is in the sort key — a rename means a full table rebuild; the `score.source` filter-DSL key, a saved-search contract, also stays). **Public `/scores` wire key stays `source`** (mapped to `source_type` at the API boundary — no SDK break). Value `annotation` is kept (the `flagger`/`user` split is Phase 6).
- [x] **Read-side membership**: per-signal occurrence/trace reads use "`signal_id` present"; the `scores_signal_discovery_work_idx` predicate gates `passed = false` for discovery candidates.
- [x] **Data convention**: existing `evaluation` + `annotation` scores follow present ⇒ `passed = false`; the `scores_hourly_buckets` MV counts `signal_id`-bearing scores (no `passed` filter).

#### PR2 — Present-verdict convention (`passed = true` = present) `[x] complete (#3661)`

PR1 shipped one present-verdict convention: behavior *present* ⇒ `passed = false`. This PR flips it to the intuitive **present ⇒ `passed = true`** across every site that reads or emits the verdict. Membership stays `signal_id`; the writer stamps it when `passed = true`. There is **no `scores` migration and no schema change** — `passed` is host-derived per run, so the convention is only how the writer, discovery, and alignment read it and how generated judges are phrased.

- [x] **Writer** (`run-live-evaluation`): stamp `signal_id` when `present = passed === true`. Absent runs still write a score with `signal_id` null.
- [x] **Discovery eligibility** (`check-eligibility` on the score → `discover-signal` path): an **evaluation** score is a discovery candidate only when present (`passed = true`); an absent run (`passed = false`, `signal_id` null) is skipped so `resolveLinkedSignalId` cannot assign it. The **annotation** branch is unchanged (negative = `passed = false` seeds discovery; clustering discovery is the annotation path).
- [x] **Alignment scoring** (`evaluate-draft-against-examples`, `evaluate-optimization-candidate`): `predictedPositive = passed === true`.
- [x] **Present-verdict instruction**: the convention text lives in `baseline-prompt.ts` — "set `passed = true` when the behavior is present" (generation-only; sole caller `generate-baseline-draft`). The **GEPA proposer** (`packages/platform/op-gepa/src/prompts/proposer.ts`) carries an explicit polarity rule in `GEPA_PROPOSER_SYSTEM_PROMPT` ("instruct the judge to set `passed = true` when the behavior is present, `false` when absent") so its prompt rewrites stay on the convention.
- [x] **ClickHouse sync**: an evaluation run is immutable on arrival and syncs regardless of verdict (`isImmutableScore`), so absent runs (`passed = false`, no `signal_id`) remain denominators.
- [x] **No changes** to occurrence reads, the `scores_hourly_buckets` MV, or annotation/`custom` write paths — membership is `signal_id`, independent of the verdict convention.

**Exit gate (PR2):** an evaluation assigns `signal_id` on `passed = true` and leaves it null on `passed = false`; occurrence counts (by `signal_id`) are unaffected; annotations and their sentiment are unchanged; no `scores` migration or schema change ran.

#### PR3 — User-created signals (API + MCP) `[x] complete (#3690)`

- [x] Contracts: `SIGNAL_ORIGINS`, `EvaluationSettings` zod (`@domain/shared`) — judge-only at this point; the `rule`/condition kinds landed in PR4b (#3739).
- [x] Additive PG migration: `signals` — `origin` (backfill `'system'`), `filters`, `deleted_at`, nullable `centroid`/`clustered_at`, partial-unique slug; `evaluations` — `settings`, nullable `alignment`/`aligned_at`, dedupe-then-active-detector partial-unique index `(signal_id) WHERE deleted_at IS NULL AND archived_at IS NULL` + lookup btree. Make `toCentroidEmbedding` + the API evaluation response mapper null-safe; handle the un-renamed `issues_centroid_embedding_consistency_check` constraint (survived Phase 1's rename, untracked by Drizzle).
- [x] **Settings → script codegen** (`@domain/evaluations/src/codegen/compile-settings-to-script.ts`, **net-new** — note: landed in `@domain/evaluations`, not `@domain/sandbox`): `compileSettingsToScript` + `validateEvaluationScriptCompiles` (compile-on-save, `ScriptCompileError` → 422), single-sourcing the judge template (`wrapPromptAsEvaluationScript` + `generateJudgePromptText`) so capability detection (`llm(`) and parity hold. Generated scripts use the present-verdict convention (`Passed()` when the behavior is present). (PR4b extended the `switch` with the `rule` kind, #3739.)
- [x] **`evaluations.script_hash`** column, filled for all evaluations — the writer reads it for the score's `metadata.evaluationHash` instead of the now-nullable `alignment.evaluationHash` (only needed once `alignment` becomes nullable).
- [x] `createSignal`/`updateSignal`/`deleteSignal` use-cases + API routes (monitors template) + MCP/SDK regen; reject evaluation-less `origin=user`. `deleteSignal` = PG **soft-delete** + archive the linked evaluation (auto write-stop via the active-detector scan); **no CH cleanup** — deleted-signal scores are excluded read-side via PG lifecycle. **No per-project signal cap.** Signal escalation is handled by source-keyed incidents, not default monitors. (Note: `updateSignal` edits name/description/`filters` only — editing the evaluation's `settings` is added in [R1](#r1--builder-ui-mvp).)
- [x] ~~`signals:backfill`~~ **Dropped — collect forward only.** A backfill worker was built then removed (`da4d75130`); new signals score forward via the normal `signals:match` → `live-evaluations:execute` pipeline (no historical backfill). `createSignal` enqueues nothing.

#### PR4a — Session runtime context `[x] complete (#3734)`

Every evaluation now runs against a single mandatory **`session`** object (replacing the old `conversation`/`issue`/`signal` globals), so conditions can read metrics, tools, status, and content — not just text. **Triggering stays on TraceEnd / per-trace membership** (no pipeline/dedupe/analytics change); the `session` is assembled at eval time from all traces of the trigger trace's session. (Assumes no prod evaluations on the old context → no script migration; a follow-up may move triggering to session-settle — future work.)

- [x] **Runtime contract** (`@domain/sandbox` `ports/script-runtime.ts`): `ScriptRunContext = { session: ScriptSessionContext }` — define `ScriptSessionContext`/`ScriptTraceContext`/`ScriptToolContext` (+ cost/token breakdowns); drop `conversation`/`issue`/`signal` and `ScriptSubjectContext`. `session.conversation` is the deduped, session-wide `{role,content}[]` (with `toString()`); per-trace `models`/`providers`/`finishReasons` + a `tools:[{name,input,output,error,duration}]` projection — no raw per-span array; tool I/O truncated.
- [x] **QuickJS binding** (`@platform/sandbox-quickjs`): `runtime.ts` serializes only `session` into `__contextData`; `prelude.ts` binds the frozen `session` global and attaches `toString()` to `session.conversation`. Remove the old globals.
- [x] **Session loader** (`@domain/evaluations` `runtime/load-session-context.ts`): aggregates + deduped conversation from `SessionRepository.findBySessionId` (system + `lastInputMessages` + `outputMessages`); per-trace rollups + tool name/error/duration from `SpanRepository.listBySessionId`; tool input/output from a focused tool-span detail read (light `Span` omits them). Reuse `formatGenAIMessage`/`toEvaluationConversationMessages`. Export `minimalScriptSession(conversation)` for the alignment paths.
- [x] **Thread `session`**: `sandbox-execution.ts` (`context:{ session }`), `execute-live-evaluation.ts` (input carries `session`), `run-live-evaluation.ts` (assemble + pass; add `SessionRepository`/`SpanRepository` reqs + the `apps/workers` layer).
- [x] **Judge generation + GEPA → `session.conversation`**: `EVALUATION_CONVERSATION_PLACEHOLDER` + `wrapPromptAsEvaluationScript` + `generateJudgePromptText`; GEPA `GEPA_PROPOSER_SYSTEM_PROMPT` allowed placeholder becomes `${session.conversation}`.
- [x] **Alignment/optimization**: `evaluate-draft-against-examples` + `evaluate-optimization-candidate` pass `minimalScriptSession(example.conversation)`.

#### PR4b — Conditions contract + codegen `[x] complete (#3739)`

Settings-defined deterministic conditions that compile to a pure script over the `session` object. **Semantic similarity was deferred out of this PR** — the `semantic_similarity` condition + its sandbox execution moved to [R3](#r3--semantic-similarity-for-rule-evals-future). Every rule shipped here is pure (no `llm()`).

- [x] **Contract** (`@domain/shared/evaluation-settings.ts`): added the `rule` kind — `{ kind:"rule", match:"all"|"any", conditions: Condition[] }` (1–10 conditions) — with conditions `text_match` (role-scoped contains/regex), `empty_output`, `output_length`, `json_output`, `metric` (session/anyTrace/allTraces over duration/cost/tokens/errorCount/…), `tool_used`/`tool_failed`/`tool_call_count`, `error`, and `finish_reason` (a **free string** — finish reasons are provider-specific). `metric.value` is in base units (codegen compares directly). A `superRefine` rejects an invalid regex at parse time (400) and restricts `traceCount` to `aggregation:"session"` (no per-trace projection).
- [x] **Codegen** (`compile-settings-to-script.ts`): `case "rule"` → a **readable, pure, synchronous** per-condition script — one commented `if` per condition that short-circuits to the verdict (`match:any` returns `Passed()` on the first satisfied condition; `match:all` returns `Failed()` on the first unmet one), so the score's feedback names exactly which condition decided it. User strings/numbers cross in only via `JSON.stringify` literals (never a code position); operators/scopes/fields come from validated enums; `validateEvaluationScriptCompiles` backstops at save (422). `allTraces` guards against the empty-session vacuous pass.
- [x] **API surface**: the `create-signal` route schema references the shared `evaluationSettingsSchema` so `kind:"rule"` is accepted; OpenAPI/MCP manifests + Fern TS/Python SDKs regenerated. (CodeQL flagged the `JSON.stringify`-into-script pattern; dismissed as false positive — the script is fully sandboxed and the same endpoint already accepts an arbitrary raw `{ script }`.)
- [x] **Tests**: zod contract (every condition, defaults, bounds, the two refinements) + codegen executed against crafted sessions (verdict + deciding-condition feedback + pureness, all operators incl. negations, the empty-session guard) + the rule path through `createSignalUseCase`.

#### PR4c — Builder UI → shipped as R1

The builder UI shipped (and expanded — it absorbs the former judge-builder phase) as [R1 — Builder UI](#r1--builder-ui-mvp) (#3773) in the roadmap below.

**Exit gate (PR4a–b):** evaluations run against the `session` object; rule + judge detectors compile and run; the `rule` kind is accepted on the create-signal API/SDK. (The UI exit gate moved to R1, now met.)

### Phase 3 — User-created LLM-as-judge signals `[FOLDED INTO R1]`

> Authoring a judge from the UI is just the **Judge** tab of the builder — folded into [R1 — Builder UI](#r1--builder-ui-mvp). The stack it relies on already ships: `llm()` runs as a templated sandbox script, `optimize-evaluation` generates + aligns judges, and the `EvaluationTrigger` path writes `signal_id`-bearing scores. R1 is the remaining wiring + UI.

### Phase 4 — Monitors on signals `[MVP]` (hard-req 4)

**Reconciled shipped model (2026-06-23):** signal alerting did not ship as signal-target monitors with a monitor-alert stack. Signal escalation is intrinsic to signals and writes directly to the shared `incidents` hub with `source_type = "signal"` and notification key `signal.escalating`. User-created monitors are a separate single-rule surface over saved-search/tool/user/session targets; see `dev-docs/monitors.md`.

- [x] **P4-a** Signal escalation uses the shared `EscalationEngine` and score occurrence series instead of default per-signal monitor provisioning.
- [x] **P4-b** Signal incidents use `(source_type, source_id) = ("signal", signal.id)` and no monitor-alert join.
- [x] **P4-c** Signal mute is `signals.muted_at`; mute gates notification fan-out and does not stop discovery or score assignment.
- [x] **P4-d** Signal UI exposes mute/unmute, not resolve/ignore/regression actions.
- [x] **P4-e** Notification settings gate `signal.escalating`, while monitor settings gate `monitor.match`, `monitor.threshold`, and `monitor.escalating`.

**Exit gate:** a signal escalation opens/closes a `signal` incident, respects signal mute, and fans out under the `signal.escalating` gate.

> **— MVP line: Phases 1–4 + R1 (builder UI, shipped #3773) — MVP COMPLETE —**

### Phase 5 — Unify judge execution onto the evaluation matching pipeline `[FOLDED INTO PR1 · complete]`

> **Folded into Phase 2 / PR1.** The big-bang cutover pulled this unification forward: the new `signals:match` worker (PR1·1e) is the single trigger for ALL evaluation execution, replacing both `trace-end`'s evaluation fan-out and the standalone `run-live-evaluation` scheduling. The proven `live-evaluations:execute → runLiveEvaluationUseCase` body is re-fed unchanged (so the original P5-a/P5-b "run judges through a new runner + parity suite" mechanism is moot — only the *trigger* moved, not the execution path); P5-c (retire the standalone scheduling path) is what shipped.

- [x] **P5-c** One trigger (`signals:match`) feeds all evaluation execution; the standalone `EvaluationTrigger` *scheduling* path is retired. (~~P5-a/P5-b~~ moot — execution path unchanged.)

### Phase 6 — Taxonomy cleanup + legacy retirement `[POST-MVP]`

**Reconciled shipped model (2026-06-23):** alert taxonomy cleanup shipped as a new incidents source taxonomy, not as `issue.*` or `savedSearch.*` monitor kinds.

- [x] **P6-a** Incident sources are `monitor | signal`.
- [x] **P6-b** Incident notification keys are `monitor.match`, `monitor.threshold`, `monitor.escalating`, and `signal.escalating`.
- [x] **P6-c** Monitor UI/API use a single `rule`, with target-mode drafts mapped to `monitor.*`.
- [x] **P6-d** Signal lifecycle actions are mute/unmute; resolved/ignored/regressed UI copy is retired.
- **P6-e** → moved to the [Cleanup](#cleanup--legacy-storage-retirement-post-mvp) roadmap item: dropping dormant storage from the rename (`scores.issue_id`, retired `issue.*` kinds) as a compatibility-only migration.

**Exit gate:** monitor and signal incidents use the final source taxonomy; the old alert-kind axis is absent from the shipped monitor/signal UI and notification producer.

## Roadmap — remaining work

> Phases 1–6 above are shipped. **R1 (builder UI, #3773), R2's describe→script generation (since retired into R4), and R4 (agentic signal creation) are shipped; R2's GEPA-over-scripts, R3, and Cleanup are the remaining open work.** Status legend as above. Out of scope for this roadmap: moments→evaluations + flagger consolidation, and the pure-similarity batch-runner *optimization* (the similarity execution question itself lives in R3).

### R1 — Builder UI `[MVP]`

**Shipped (#3773).** The one builder that completes the MVP: create and edit signals from the UI with a live preview, across three tabs. Absorbs the former judge-builder phase — authoring a judge is just the Judge tab, and the generation/alignment/execution stack it needs already ships. **Deps:** PR4a/PR4b.

> **Reconciled shipped model:** `updateSignalEvaluationUseCase` updates the active evaluation **in place** (same evaluation id) rather than archive-active-plus-create-new — matching the realign path and avoiding a lineage/naming scheme. The Advanced tab shipped with the "describe your eval" affordance **wired**, not disabled ([R2](#r2--ai-authored-evaluations-the-advanced-tab-post-mvp) below, delivered together).

- [x] **Backend for web**: `previewEvaluationUseCase` (compile + run against recent sample sessions, **no persist**); `updateSignalEvaluationUseCase` (user-origin; updates the active evaluation **in place**, same id); signal `filters` gate evaluation execution. Web `createServerFn` handlers + `signals.collection.ts` hooks (no REST/SDK regen — UI leads).
- [x] **UI** (`apps/web`): create/edit signal builder modal with three tabs — **Rules** (deterministic conditions editor over `session`), **Judge** (`criteria` → generated `llm()` script; reuse the example-trace picker + `getSignalAlignmentState` polling), and **Advanced** (raw `script` editor + AI "describe your eval" generation — see R2) — plus a `filters` (scope) editor and a **live preview** (deterministic runs live; judge on-demand). Entry points: "New signal" (signals list), "Create signal from this search" (saved-search surface), and **Edit** on the signal detail page (replaces the "Editing its settings is coming soon" note); delete action.
- [x] **Judge wiring** (mostly pre-existing, from the former Phase 3): drive `optimize-evaluation` from the builder (`evaluations:generate:${signalId}`; with example traces → aligned via `collectAlignmentExamples`/`evaluateDraftAgainstExamples`, without → unaligned start); the `EvaluationTrigger` path writes `signal_id`-bearing scores for a non-discovered user signal.
- [x] **Cleanup**: dropped the dead `QueuePublisher` layer on `createSignal`; fixed the stale "backfilled over recent history" prose in `apps/api/src/routes/signals.ts` (backfill was dropped in PR3 — collect forward only).

**Exit gate (met):** users create/edit rule, judge & raw-script signals from the UI with a live preview; settings edits recompile the detector; new in-scope traces produce evaluation scores on the signal page. **Completed the MVP.**

### R2 — AI-authored evaluations (the Advanced tab) `[POST-MVP]`

**Status: describe→script shipped; GEPA-over-scripts open.** Enable the Advanced tab's "describe your eval": the user describes a behavior in natural language and Latitude's own AI authors a raw sandbox `script` over the `session` object — any mix of deterministic checks + `llm()`, not just a judge prompt or a declarative rule. The same muscle then powers optimization: GEPA, today locked to rewriting only the judge prompt, learns to author and tune the whole script. **Deps:** R1; PR4b (`rule` codegen + `session` payload).

- [x] **Describe → script generation** (shipped #3763, then **retired into [R4](#r4--agentic-signal-creation-shipped)**): `createScriptFromPromptUseCase` emitted a raw `script` from an NL description, smoke-tested in the sandbox against a scoped session with error-feedback retries (≤3), wired async via the `signals-generate-script` queue + Redis polling. R4 generalized the whole mechanism — its system-prompt sandbox contract (`EVALUATION_SCRIPT_GENERATION_SYSTEM_PROMPT`) survives inside the R4 signal-generation prompt; the in-tab affordance, use case, queue topic, and worker were deleted with R4's landing.
- [ ] **GEPA over arbitrary scripts**: relax the proposer contract (`GEPA_PROPOSER_SYSTEM_PROMPT`, the `TODO(eval-sandbox)` in `packages/platform/op-gepa/src/prompts/proposer.ts`) to emit/rewrite the whole script body — deterministic, judge, and hybrid — not just the `llm()` prompt; score each candidate through the sandbox against the alignment set; capability-aware cost/lane accounting; decide the search space (seed from `rule` codegen vs. free-form) and how alignment scoring applies to deterministic candidates (which never call `llm()`).

**Exit gate:** ✅ a user describes an eval and gets a working raw script (shipped); ⏳ GEPA can produce and improve deterministic, judge, and hybrid scripts that read the `session` payload, each validated by compile + alignment scoring (open).

### R3 — Semantic similarity for rule evals `[IN PROGRESS]`

A `semantic_similarity` rule condition (`{ query, operator, threshold }`) plus a `semanticSimilarity(query)` sandbox verb, surfaced in the builder's Rules tab. **Deps:** R1.

**The execution model is decided** — it reuses ingest-time embeddings and embeds *only the query*, at most once per distinct string:
- **Never re-embed the session.** Trace messages are already embedded at ingest (`trace-search` → `message_embeddings`, voyage-4-large, content-addressed and deduped project-wide). The runtime reads those vectors via `trace_message_occurrences` (`trace → content_hash`) → `MessageEmbeddingRepository.findByHashes`. When a session has no embeddings, `semanticSimilarity` returns **0** (the lowest score) — never a skip.
- **Query embedded once, ever.** The query is content-addressed in `message_embeddings` (embedded as `document`, like the stored messages, so cosine is apples-to-apples). Embed-on-miss only for a never-seen string; every later run reuses it.
- **Host verb, not a DB handle.** One narrow, parameterized, host-scoped `semanticSimilarity(query)` verb (`Promise<number>` = max cosine over the session), on the same trust model as `llm()`. It composes with `Passed`/`Failed`/`Score`; the `rule` condition compiles to a binary `Passed(1)`/`Failed(0)` via `(await semanticSimilarity(query)) OP threshold`.
- **Readiness gate.** Embedding-capable evals run after embedding: a bounded delayed re-publish waits for occurrences to appear; on the last attempt the run proceeds and the host returns 0 for whatever's still missing.
- **Threshold UX.** Named presets (Broad/Balanced/Strict → calibrated cosines) are the primary knob; raw slider/operator sit behind "advanced". Calibration is the builder's live Test-step preview.

- [x] **Design** the sandbox execution model (reuse ingest embeddings; `semanticSimilarity(query)` host verb; embed the query once).
- [x] **Implement** the `semantic_similarity` rule condition (contract, codegen, capability detection), the host verb + read path, the readiness gate, and the builder Rules-tab surface.
- [ ] **Calibrate** `SEMANTIC_SIMILARITY_PRESETS` against voyage-4-large.

**Exit gate:** a rule can match on semantic similarity to a query, embedding zero session messages and the query at most once, at production volume.

### R4 — Agentic signal creation `[SHIPPED]`

**Describe-first creation: one prompt → the complete signal.** The builder's intro screen swaps its method cards for a single textarea: the user describes what they want to track and Latitude's AI creates the whole signal — `name`, `description`, `filters`, `sampling`, and the evaluation — then the UI navigates to the new signal's detail page. "Configure manually" sits beside it as the path into the step-by-step wizard (straight to the tabbed Evaluation step — the method cards are gone), so natural language is the default and manual configuration the escape hatch. **Deps:** R1 (builder); R2's describe→script machinery (retired into this); the sandbox preview.

> **Reconciled shipped model:** the generator shipped as **one AI-driven use case with a bounded draft → repair → review loop** (`createSignalFromPromptUseCase`, `@domain/signals`), not an open tool-use loop — the grounding the tool loop would have queried is prefetched inside the use case and injected into the prompt (distinct filter-dimension values incl. tool names via `TraceRepository.distinctFilterValues`, traffic volume via the session histogram, one sample session), and self-validation runs `previewEvaluationUseCase` in-process. ≤ 4 `ai.generate` calls per run (structured output against a flat generation schema, host-mapped through the shared `evaluationSettingsSchema`/`filterSetSchema`); feature `SIGNAL_GENERATOR`, telemetry project `latitude-signal-generation`. The user's prompt is **not persisted**. User-named filter values reconcile against observed values in the prompt (observed match > naming-pattern inference > user-quoted literal verbatim); filters are generated only as a for-sure-discard cost pre-gate.

The grounded decisions, as specced:

- **evaluation content** — which `session` fields/functions the script or conditions should use, checked against what the project's sessions actually contain (does the ask map to a real tool name?);
- **kind** — prefer `rule` settings > `judge` settings > raw script; settings keep the result editable as forms in the builder;
- **filters** — only real dimensions/values (tags, services, models, providers; metadata only when the user names it), and none when the ask implies no scoping;
- **sampling** — from actual traffic volume and evaluation cost (rule → 100%; judge/script → a cost-aware fraction);
- **self-validation** — preview the candidate evaluation against recent sessions and iterate until the verdicts look right: the "never define membership blind" rule, applied to the generator itself.

Locked product decisions (from the builder-UX design round):

- **Creates immediately** — no wizard-prefill review step; the user reviews on the detail page and iterates via Edit. Closing the modal mid-run only stops polling; the created signal still appears in the list (a Redis `:claim` key makes stall-recovery redeliveries no-ops, so a run never double-creates).
- **Waiting UX stays minimal** — a spinner plus one muted status line (the worker streams its current step into the pending Redis value).
- **The Custom script tab becomes the compiled view** (shipped in this phase): the tab is only the code editor, always showing the current evaluation as a script — `compileSettingsToScript(settings)` when conditions/judge settings are configured (client-side via the `@domain/evaluations` browser entry; the compiler is pure), the raw script otherwise. The compiled view is read-only with an explicit **"Edit as custom script"** detach (so a stray keystroke can't silently destroy a settings form); detaching re-authors as a raw script (`settings = null`, settings forms cleared). The in-tab describe→generate affordance from R2 is gone.

- [x] **Generation use case (workers)**: `createSignalFromPromptUseCase` — grounding prefetch + draft/repair/review loop + `previewEvaluationUseCase` self-validation; draft contract host-validated onto `{name, description, filters (filterSetSchema), sampling, evaluation: {settings} | {script}}`; composes `createSignalUseCase`; enqueue+poll plumbing (`signals-generate-signal` task + `org:${organizationId}:signalGeneration:${generationId}`) replacing the retired `signals-generate-script` path.
- [x] **Intro screen**: method cards replaced by the describe textarea + "Generate signal" + "Configure manually" (→ wizard step 0); minimal waiting line fed by worker steps; navigates to the detail page on completion; generation errors show inline with manual configuration always available.
- [x] **Custom script tab = compiled view**: `compileSettingsToScript` exposed through the `@domain/evaluations` browser entry (pure codegen split from the sandbox-backed validators); the editor shows compiled settings read-only or the raw script; explicit detach flips to raw and clears settings.

**Exit gate (met):** a one-sentence description yields a created signal grounded in the project's real data — valid filters over existing dimensions, sampling that fits traffic, an evaluation that previews correctly — reviewable on its detail page; manual configuration stays fully available; the Custom script tab always shows the current evaluation as code.

### Cleanup — legacy storage retirement `[POST-MVP]`

- [ ] Drop dormant compatibility carried through the issues→signals rename, once nothing reads it — the ClickHouse `scores.issue_id` column, the `EVENT_NAME_ALIASES` shim, the `/issues` API alias + `issues` SDK group, and the retired `issue.*` alert-kind strings — as a compatibility-only migration.
