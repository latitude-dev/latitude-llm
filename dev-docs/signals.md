# Signals

A **Signal** is a tracked bucket of traces. Signals are the top-level observability entity of the reliability system: a signal defines *what* to watch, its **members** are the traces that exhibit it, and any signal can be watched over time by a **Monitor**.

Signals unify two formerly separate systems — **Issues** (auto-created buckets of failed/annotated scores, monitored invisibly) and the user-configured alerting that ran over **Saved Searches** — into one model. A signal's members are its **Scores**; a signal is watched by a **Monitor**; a monitor owns **Alerts**; a fired alert opens an **Incident**, which is what notifies.

```
                tracker runs at ingest        monitors aggregate         alerts fire on        records the
                (or annotation lands)         the score stream           conditions            firing
  Trace ──────▶ SIGNAL ─────────────────────▶ MONITOR ─────────────────▶ ALERT ──────────────▶ INCIDENT ──▶ notifications
                membership = its SCORES        (a metric over the
                (write-time materialized)       signal's scores/traces)
```

Signals live in `@domain/signals` (the evolved `@domain/issues` package). The shared enums (`SignalOrigin`, `SignalTrackerType`, `ScoreSourceType`, alert kinds, conditions, severities) live in `@domain/shared` so the signals, monitors, scores, and notifications domains can reference them without a circular dependency.

> **Spec**: `specs/signals.md` carries the design decisions, trade-offs, and the phased build plan. This doc describes the intended final system; consult the spec for phase status while the system is under construction.

Related docs:

- [scores.md](./scores.md) — the canonical scores model and the Postgres/ClickHouse split that signal membership rides on.
- [monitors.md](./monitors.md) — the monitor / alert / incident machinery; signals are one monitor target type.
- [evaluations.md](./evaluations.md) — the LLM-judge generation/alignment/execution stack that backs `llm_as_judge` trackers.
- [conversation-intelligence.md](./conversation-intelligence.md) — the moment-label anchor matching that the semantic runner generalizes.
- [reliability.md](./reliability.md) — the cross-domain reliability loop that produces scores.
- [notifications.md](./notifications.md) — incidents drive notifications; the monitor mute gate is the only seam.
- [domain-errors.md](./domain-errors.md) — `@domain/issues`/`@domain/signals` is the reference implementation for per-package error layout.

## Why membership is materialized at write time

Two structural decisions carry the whole model, and both follow from a single cost constraint: counting and alerting over *semantic* membership is only affordable if each trace's verdict is computed once, on arrival, and remembered.

1. **A signal's occurrences ARE its scores.** There is no separate occurrence ledger. Every membership-bearing event — a tracker run, an annotation, a future custom push — writes a `scores` row carrying `signal_id`. A signal's membership is the subset of those rows that *matched* (`value >= threshold`). This collapses the former inconsistency where issues counted scores and saved searches counted traces into one counting unit, and reuses the entire scores pipeline.
2. **Membership is materialized at write time.** A tracker is evaluated against each in-scope trace once, on arrival, and the verdict is frozen as a score (`passed`). Membership reads never re-apply a threshold at query time.

The reasoning:

- **Semantic search answers a different question than filters do.** A filter is a per-row yes/no — each row passes on its own merits, so filters stack for free. Semantic search with a vector index answers "the ~1,000 items *most similar in the entire corpus*". Combine them and the filter can only discard from those 1,000: "user frustration" + "last 7 days" returns whichever of the corpus-wide top-1,000 happen to be recent — maybe 30, maybe 0 — while thousands of genuinely matching traces from this week sit far down the global ranking and are never returned. Counting correctly means scoring every trace in the window: a full scan.
- **Tracking over time multiplies that cost forever.** An alert on "last-5-minutes match count vs its historical average" needs μ and σ over every historical bucket — the verdict for every trace in the corpus — recomputed on every evaluation, even though each trace's verdict is frozen the moment it arrives. The only affordable fix is "score each trace once, on arrival, and remember it", which is write-time materialization.
- **"Occurrences are scores" is the cheap way to remember it, given the existing storage split.** `scores` is already a Postgres-canonical + ClickHouse-analytics split, and immutable scores skip straight to ClickHouse ([scores.md](./scores.md)). A pure-tracker match is immutable by construction (a value, no feedback, nothing to draft), so it goes ClickHouse-only and never touches the canonical mutable Postgres path. Mutable membership (judge feedback, human/flagger annotations) is bounded — sampled or human-paced — and takes the canonical path as it does today. So one ledger scales without a second table.

Consequences that hold throughout the system:

- **Query-time semantic search stays an exploration tool** — a ranked best-effort sample on the Traces page. There are no counts, histograms, or alerts over a raw semantic query; the path to set semantics is "create a signal".
- **Anything needing set semantics** — charts, baselines, alerts, "every matching trace" — must be a signal whose tracker decides membership per trace at ingest.
- **History is immutable under definition edits.** Editing a tracker changes membership *forward only* (a definition-changed marker appears on charts); existing scores keep their frozen `passed`.

## Concepts

### Signal

A signal's members are the traces with a *matching* score for that signal. A signal carries:

- **origin** — `user` (built deliberately by a person) or `system` (auto-created by Latitude; see [Discovery](#discovery-sinks-and-promotion)). Origin distinguishes hand-built from discovered signals and is a list filter/column.
- **`tracker`** (jsonb, nullable, **at most one per signal**) — the membership detector run at write time. A `NULL` tracker is a **sink**: no write-time detection, with membership coming only from annotations. Sinks are how discovered signals work.
- **`filters`** (a `FilterSet`, nullable) — a cheap, row-local pre-gate restricting which traces the tracker is even run against (e.g. `service = checkout`, or above p90 latency). Empty/absent means all traces. `filters` is only meaningful alongside a tracker — it gates tracker execution.
- **triage metadata** — a single `priority` and a single `assignee` (multi-assignee deferred), carried over from issues.
- **lifecycle** — `resolved` / `ignored` / `escalating`, carried over from issues. Lifecycle stays on the signal row; it is not relocated onto a monitor.

Invariants:

- **A `user`-origin signal must have a tracker.** Users cannot create a tracker-less signal. Tracker-less (`NULL`) signals exist only as `system`-origin sinks. This keeps "plain filter slices" out of signals — those stay **saved searches** + monitors. (A broad `filters`-only signal would write a score per trace; banning user-created tracker-less signals removes that write-amplification footgun entirely.)
- **One tracker per signal.** A bucket has at most one detector. A concept that needs two detectors — e.g. semantic *and* judge for the same behavior — is one signal *promoted* from one tracker to another, or two signals; never one signal with two trackers.
- **Signals per project are capped** per plan, which bounds tracker matching cost and pure-tracker score write volume.

### Tracker

The write-time detector embedded on a signal (`signals.tracker` jsonb, discriminated by `type`). Three types:

```ts
export const SIGNAL_TRACKER_TYPES = ["semantic_similarity", "script", "llm_as_judge"] as const
export type SignalTrackerType = (typeof SIGNAL_TRACKER_TYPES)[number]

export type SignalTracker =
  | { type: "semantic_similarity"; semantic: SemanticAnchors; threshold: number }
  | { type: "script";              source: string;            threshold: number }   // sandbox JS
  | { type: "llm_as_judge";        threshold: number }   // detector lives in evaluations.signal_id (1:1)

export type SemanticAnchors = {
  anchors: string[]                  // positive anchor phrases (1..n); best match wins
  contrastAnchors?: string[]         // a trace matches only if best-positive ALSO beats best-contrast by `margin`
  margin?: number                    // required positive-vs-contrast separation (default per constants)
  roles?: ("user" | "assistant")[]   // optionally restrict which turns are compared
}
```

- **`semantic_similarity`** and **`script`** are **pure** detectors — deterministic, no `feedback`. `script` runs through the sandbox runtime (`specs/sandbox-runtime.md`); `semantic_similarity` runs through the native batch anchor runner (the conversation-intelligence path), not the sandbox. The semantic detector value is `max(chunk · positiveAnchor)`, and a trace matches only when the best positive anchor also beats the best contrast anchor by `margin`. This multi-anchor + contrast + margin shape is proven in production for conversation-intelligence moment labels and adopted wholesale, generalizing those labels' static per-kind gate into the uniform per-tracker `threshold`.
- **`llm_as_judge`** is **not** stored inline. Its config is an `evaluations` row linked by `evaluations.signal_id` (1:1); the tracker jsonb records only `{ type, threshold }`. The judge script, alignment state, and `optimize-evaluation` workflow stay in `@domain/evaluations` (see [evaluations.md](./evaluations.md)). A judge tracker can be authored directly (judge criteria → compiled to a backing evaluation linked to the signal), with alignment ground truth accruing as annotations arrive; the same type also arises automatically via the sink → promotion path. Both paths land on the same backing-evaluation shape.
- A tracker's **`threshold`** is the membership cutoff over the detector value (semantic emits continuous similarity; judges emit ≈{0,1}; scripts emit whatever they compute). Threshold and definition edits apply **forward only** — existing scores are never re-evaluated.

`semantic_similarity` anchor embeddings are not a column. They are embedded once on save and Redis-cached under an org-prefixed key, exactly as moment-label anchors are today; nothing searches anchors via SQL.

### Score as the membership ledger

Every membership-bearing event writes a `scores` row carrying `signal_id`; nothing else records membership. The widened source enum:

```ts
export const SCORE_SOURCE_TYPES = ["tracker", "flagger", "user", "custom"] as const
export type ScoreSourceType = (typeof SCORE_SOURCE_TYPES)[number]
//   tracker — written by the signal's tracker at ingest    (source_id = signal id; a judge tracker score
//             may keep the evaluation id as source_id to preserve evaluation-source dashboards)
//   flagger — automatic flagger annotation                 (source_id = flagger key)
//   user    — human annotation (UI / API / queue)          (source_id = user id / sentinel)
//   custom  — public /scores push  [post-MVP]              (source_id = caller tag)
```

- **`passed` is the materialized membership flag.** The tracker host freezes `matched = (value >= tracker.threshold)` at write time and stores it as `passed`; `value` is retained for confidence and sort. A signal's occurrences are therefore `scores WHERE signal_id = ? AND passed = true`, with no runtime threshold. (A judge "exhibits" the behavior at `passed:false` under the historical problem-detector polarity; this is normalized to exhibition during migration.)
- **Non-matches are written too**, mirroring how evaluations persist both `passed:true` and `passed:false`. A tracker writes a score on every run, matched or not. The matched rows are occurrences; the non-matched rows give exact pass-rate and denominators without read-time estimation. (Lever if pure-tracker non-match volume ever hurts: switch pure trackers to match-only and derive the denominator from `filters` over traces at read time. The default is write-both.)
- **The write path routes by mutability**, reusing the existing scores Postgres/ClickHouse split:

  | Score | Mutable? | Store |
  | --- | --- | --- |
  | `tracker` / `llm_as_judge` (pass + fail; has `feedback`; sampled → bounded) | yes (feedback) | Postgres-canonical + ClickHouse |
  | `tracker` / `semantic_similarity` · `script` (matched + non-matched; no feedback; per in-scope trace) | no | **ClickHouse-analytics only** (immutable on arrival; skip the canonical Postgres row) |
  | `user` / `flagger` annotation (draftable, editable) | yes | Postgres-canonical + ClickHouse |

Pure-tracker scores carry `signal_id` at write time, so they are immutable on arrival and go straight to ClickHouse — they never push trace-volume writes through the canonical mutable Postgres path. This is the mechanism that makes "occurrences are scores" scale.

## Data model

No new tables: every entity evolves a table that already exists. The unified `event.*`/`metric.*` alert model, `MonitorMetric`, and the `monitors.target_*` columns are shared with [monitors.md](./monitors.md).

### Postgres: `signals`

The `signals` table is the former `issues` table, evolved in place (rows, centroid, and embeddings are kept). It is organization-scoped under the standard RLS org-isolation policy and follows the no-FK rule.

- `origin varchar(16)` — `SignalOrigin` (`user` | `system`).
- `tracker jsonb null` — `SignalTracker`; `NULL` = sink.
- `filters jsonb null` — `FilterSet` pre-gate; only meaningful alongside a tracker.
- `priority varchar(16) null` — `low` | `medium` | `high` | `urgent`.
- `assignee_id varchar(24) null` — single assignee.
- `centroid jsonb null` and `centroid_embedding vector(2048) null` — the decayed weighted centroid and its derived pgvector, used for sink similarity routing in discovery. Both are nullable because user-created tracker signals have no centroid; only discovery sinks cluster.
- `clustered_at timestamptz null` — last centroid/cluster refresh (nullable for the same reason).
- `search_document tsvector GENERATED` — `setweight(name 'A') || setweight(description 'B')`, with a GIN index for the lexical side of hybrid sink search.
- `resolved_at` / `ignored_at` / `escalated_at timestamptz null` — lifecycle timestamps. `escalated_at` is dormant; "escalating" is derived from open `alert_incidents`.
- `deleted_at timestamptz null` — signals are soft-deleted (issues were not).

Indexes of note:

- partial unique `(organization_id, project_id, slug) WHERE deleted_at IS NULL` — per-project slug uniqueness among non-deleted signals.
- GIN `(search_document)` — lexical boost in hybrid sink search.
- partial btree `(organization_id, project_id, ignored_at, resolved_at, created_at) WHERE deleted_at IS NULL` — project-scoped lifecycle filtering.
- partial btree `(organization_id, project_id) WHERE deleted_at IS NULL AND tracker IS NOT NULL` — "list active tracked signals" for the matching pipeline.

There is intentionally **no** approximate vector index on `centroid_embedding`: signals per project are bounded (hundreds to low thousands), and an exact project-scoped scan outperforms an approximate index at that scale.

### Postgres: `scores`

`scores.signal_id varchar(24) null` is the former `issue_id`. `scores.source_type varchar(32)` is the former `source`, carrying `ScoreSourceType`. `passed` is the materialized membership flag (above); `value` is retained for confidence/sort. The canonical idempotency unique index keys one tracker score per `(source_id, trace)`. See [scores.md](./scores.md) for the full row shape, the draft/publication lifecycle, and the at-most-once ClickHouse sync.

### Postgres: `evaluations`

`evaluations.signal_id varchar(24) NOT NULL` is the former `issue_id` (still required — a judge tracker always backs a signal). Everything else about the evaluation entity is unchanged; see [evaluations.md](./evaluations.md).

### Postgres: `monitors`

A monitor targets a signal via `monitors.target_signal_id varchar(24) null` (alongside the existing saved-search/raw-stream `target_*` columns). `is_default boolean` marks the auto-provisioned per-signal occurrences monitor, with a partial unique index `(target_signal_id) WHERE is_default AND deleted_at IS NULL` (one default monitor per signal) and a firing-scan index `(organization_id, target_signal_id) WHERE deleted_at IS NULL`. The `metric` column (`MonitorMetric`) is shared with all monitor targets. See [monitors.md](./monitors.md) for the monitor entity, alerts, and incidents.

### ClickHouse: `scores`

The analytics table gains `signal_id FixedString(24) DEFAULT ''` (the empty-string sentinel for "no signal"). It is the single signal counting/aggregate surface monitors read: occurrence count is `WHERE signal_id = ? AND passed`. Field aggregates (`avg`/`p95`/`sum` of `duration`/`cost`/`tokens`) join the matched `trace_id` back to the traces analytics — the score's own `duration`/`tokens`/`cost` are the *judge's*, not the trace's. The `source` skip index is sized for the four `source_type` values. Pure-tracker scores are written ClickHouse-only; judge/annotation scores follow the canonical Postgres → ClickHouse sync. ClickHouse migrations are append-only (see [scores.md](./scores.md) and the ClickHouse skill).

## The matching pipeline (write-time)

A single **signal matching pipeline** runs every active *tracked* signal's detector against incoming traces. It generalizes the former evaluation-oriented write path (`EvaluationTrigger`: filter / turn / debounce / sampling), and evaluations become one runner inside it.

- The **filters pre-gate** is shared — one row-local pass per trace over all active signals' `filters`. Out-of-gate traces never reach a tracker.
- The **sandbox runner** executes `script` trackers (and `llm_as_judge` trackers' generated scripts) in the shared sandboxed JS runtime (`specs/sandbox-runtime.md`).
- The **semantic runner** compares a trace's content-chunk embeddings (already produced at ingest for trace search and semantic moments) against Redis-cached anchor embeddings — one batch pass over a trace's chunks against all anchor sets. It subsumes the conversation-intelligence moment-label anchor pass.
- Evaluation-specific options (`sampling`, `turn`, `debounce`) remain runner-level settings on the backing evaluation, not pipeline concepts.

A run writes a score (matched or not) with `signal_id` and `source_type = 'tracker'`, routed Postgres/ClickHouse by mutability (above). **Sinks (`tracker IS NULL`) are not in this pipeline** — they receive membership only via annotations.

The active-signal set is loaded through `SignalRepository.listActiveTracked(projectId)`, Redis-cached under an org-prefixed key. The pipeline runs as a `signals:match` queue task off `TracesIngested` (batched per project), with a separate `signals:semanticMatch` hop joining the content embeddings produced at ingest.

## Discovery: sinks and promotion

Automatic discovery produces **sink signals** (origin `system`, no tracker), reusing the flagger + annotation + centroid + hybrid-search + locked-serialization machinery unchanged (see [issues.md](./issues.md) for the discovery pipeline internals and the bounded locked serialization invariant).

```
flaggers (trace-end) + human annotations
   └─ each writes an annotation score (source_type = 'flagger' | 'user')
   └─ discovery routes the score (centroid + hybrid search + locked serialization):
        ├─ to an existing sink signal      → +1 occurrence
        └─ or creates a new sink signal    → origin 'system', tracker NULL
   └─ once a sink has enough evidence, the user can PROMOTE it:
        └─ generate an llm_as_judge tracker from its accumulated annotations
           (the former "Monitor issue" → optimize-evaluation; workflow id evaluations:generate:${signalId})
        └─ the accumulated annotation scores become the alignment ground truth
           (positives = annotations marked as exhibiting; negatives = traces annotated as passing
            elsewhere; zero-annotation traces excluded)
        └─ the signal now auto-detects forward; old annotation occurrences stay, the judge adds
           tracker-sourced ones
```

A signal's life is therefore **sink (annotation-fed) → optionally promoted to a tracker (detector-fed)**, with identity and occurrence history preserved across the promotion. This is the bridge between auto-discovery and hand-built trackers; it reuses the entire existing discovery + `optimize-evaluation` + alignment machinery.

**Annotation assignment is allowed exactly on tracker-less (sink) signals.** A tracker-backed signal is detector-driven; traces are not hand-assigned into it. While annotating, the UI suggests existing sinks via hybrid search over `search_document` (lexical) + `centroid_embedding` (the discovery path); the user links explicitly or lets discovery route.

## Lifecycle and triage

Lifecycle (`resolved` / `ignored` / `escalating`) stays on the signal row, carried over from issues:

- **Resolve** sets `resolved_at = now` and closes any open sustained incidents silently (no recovery notification).
- **Ignore** sets `ignored_at = now`. Scores keep recording; nothing notifies.
- **Delete** soft-deletes the signal and its monitors, archives the backing evaluation, and enqueues ClickHouse score cleanup for the signal.
- **Escalating** is not a stored flag — it is derived from an open escalating `alert_incidents` row on the signal's monitor.
- **Regression** — the first datapoint after `resolved_at` clears fires the `event.regressed` alert.

Triage `priority` and `assignee_id` behave as they did for issues: the list groups by priority and filters by assignee, and incident notification payloads snapshot them for rendering.

## Monitors, alerts, and incidents on signals

A signal is one **monitor target type**. A monitor watches one signal over time; monitors never own detection (that lives on the signal's tracker). A signal monitor owns:

- a **target** — the signal, via `monitors.target_signal_id`.
- a **metric** (`MonitorMetric`) — `count` of matching scores (default), `errorRate`, or `avg`/`p95`/`sum` of `duration`/`cost`/`tokens`. Field aggregates read the matched traces (`score.trace_id → traces`).
- **mute** (`muted_at`) — notifications off; evaluation and incident recording continue.

Signal monitors use the unified, target-on-monitor alert kinds (with `source_type`/`source_id` null):

- **`event.matched`** — a new matching score entered the signal (point).
- **`event.regressed`** — the first datapoint after the signal's `resolved_at` clears it (point, no condition, severity high, **not user-creatable**). This is the only genuinely new alert kind.
- **`metric.threshold`** — absolute / multiplier / expected, with direction (point).
- **`metric.escalating`** — sustained. The former two "is this escalating?" implementations (the issue seasonal detector over score counts, and the saved-search bucketed sustained-gate over trace-match counts) merge into one evaluator: every target yields the same per-bucket count series → per-bucket threshold → open/close state machine. The seasonal detector (`evaluateSeasonalEscalation`) survives as the threshold function of `expected` mode (knob: `sensitivity`).

Every signal gets a **default monitor** provisioned at creation: the occurrences (`count`) monitor carrying a high-severity `metric.escalating` alert in `expected` mode plus an `event.regressed` alert — the same coverage issues get today, now explicit and per-signal. The metric series is read from ClickHouse through `SignalScoreReader` (`count WHERE signal_id = ? AND passed`; aggregates over matched traces; per-bucket series for the escalation machine), mirroring `SavedSearchMatchReader`. Incidents are unchanged from [monitors.md](./monitors.md): same `alert_incidents` lifecycle, backtracked `started_at`/`ended_at`, and snapshotting of the firing alert's `condition` and the monitor's target definition so closed incidents stay self-describing after edits.

## Main flows

`[reuse]` marks existing machinery used unchanged.

- **Trace ingest → tracker → score.** `TracesIngested` → domain-events dispatcher → `signals:match` (batched per project) → `matchTracesToSignalsUseCase`: load `listActiveTracked`, run the `filters` pre-gate per signal, dispatch to the script/judge/semantic runner, and write a score (matched or not) with `signal_id`, `source_type='tracker'` — pure trackers ClickHouse-only, judges Postgres-canonical + ClickHouse. The pipeline then publishes `monitors:evaluate` on a leading-edge throttle `[reuse shape]`.
- **Create a signal manually.** `createSignalUseCase { origin: 'user', tracker, filters? }`: embed + Redis-cache anchors (semantic), compile (script, rejecting `ScriptCompileError` at save), or create the backing evaluation (judge); provision the default monitor; enqueue `signals:backfill` for pure trackers.
- **Annotation → sink routing.** A flagger or human annotation writes an annotation score (`source_type 'flagger'|'user'`), then `ScoreCreated` drives discovery (centroid + hybrid search + locked serialization) to assign to an existing sink or create a new `system`-origin tracker-less sink `[reuse]`.
- **Monitor evaluation → alert → incident → notification.** `evaluateMonitorUseCase` reads the signal target via `SignalScoreReader`, computes the per-bucket metric series, and runs each active alert's state machine; incidents open/close and drive notifications through the mute gate `[reuse]`.
- **Promote a sink to a judge tracker.** `promoteSignalUseCase` sets `tracker = { type:'llm_as_judge', threshold }` and starts `optimize-evaluation` (`evaluations:generate:${signalId}`), building the alignment set from the signal's annotation scores; the frontend polls `getSignalAlignmentState` via `workflow.describe()` `[reuse shape]`.

## Product surface

A **Signals** nav item replaces **Issues**: a single list holding hand-built and discovered signals together, with `origin` (auto/manual), tracker type, priority, assignee, trend, monitors, and last incident as columns/filters on one surface. Former issue URLs (`/projects/$slug/issues/...`) and `?issueId=` deep links redirect to the corresponding signal pages.

- **Signal detail page** — definition (tracker + filters), monitor charts, alerts, incidents, and member traces in one context. Sinks show their annotation evidence and a **Promote** action; judge-backed signals show the linked evaluation/alignment sections (confusion matrix, realign).
- **Creating a signal** — one builder, three entry points (Signals list, "Create signal from this search", the annotation flow), one rule: **never let users define membership blind**. The builder always shows a live preview — a bounded query-time evaluation over recent traces (an exact scan over a recent window using existing content embeddings for `semantic`; the sandbox dry-run harness against sample traces for `script`/`llm_as_judge`). The tracker picker offers Semantic, Script, and LLM-as-judge.
- **Creating a monitor** — target = a signal; metric = Occurrences (count) or an aggregate; alerts = the existing card stack, copied from the monitors surface.
- **Monitors list** — one row per monitor with a **Target** column deep-linked to the signal, status (Live / Muted / Resolved / Escalating), metric, and last incident.

## API / SDK / MCP

Signals are exposed as a public REST surface under `/v1/projects/{projectSlug}/signals`, following the monitors routes as the template (`defineApiEndpoint`, a `createSignalsRoutes` factory, and rich `.describe()` field docs that propagate to both the TS SDK and MCP tools; regen via `pnpm openapi:emit` / `pnpm mcp:emit` / SDK generate).

| Method | Path | Operation id |
| --- | --- | --- |
| GET / POST | `/` | `listSignals` / `createSignal` |
| GET / PATCH / DELETE | `/{signalSlug}` | `getSignal` / `updateSignal` / `deleteSignal` |
| GET | `/{signalSlug}/traces` | `listSignalTraces` |
| POST | `/{signalSlug}/resolve`, `/ignore`, `/promote` | `resolveSignal` / `ignoreSignal` / `promoteSignal` |

- `createSignal` accepts a `tracker` of any of the three types plus optional `filters`, and rejects tracker-less creation (sinks are system-only).
- Monitors gain `signal` as a target type in their existing API.
- `custom`-source score push (the `/scores` API accepting a caller-supplied `signal_id`) is post-MVP; today `/scores` refuses caller-supplied ownership ([scores.md](./scores.md)).

## Package layout and errors

`@domain/signals` is the evolved `@domain/issues` package and remains the **reference implementation** for per-package error layout (`src/errors.ts` with specific `Data.TaggedError` classes implementing `HttpError`, per-flow union types, shared infrastructure errors in `@domain/shared`). See [domain-errors.md](./domain-errors.md) and the effect-and-errors skill. Tracker authoring adds save-time validation errors (e.g. `ScriptCompileError` for `script` trackers) and the reject-tracker-less-user-signal rule.

## See also

- Design spec: `specs/signals.md` (decisions, trade-offs, phased build plan).
- `specs/sandbox-runtime.md` — the execution contract for `script` and `llm_as_judge` trackers.
- [issues.md](./issues.md) — the discovery pipeline, centroid math, and locked serialization that sinks reuse.
- [monitors.md](./monitors.md), [scores.md](./scores.md), [evaluations.md](./evaluations.md), [conversation-intelligence.md](./conversation-intelligence.md).
- Skills: `.agents/skills/async-jobs-and-events/SKILL.md`, `.agents/skills/database-postgres/SKILL.md`, `.agents/skills/database-clickhouse/SKILL.md`, `.agents/skills/api-endpoints/SKILL.md`.
