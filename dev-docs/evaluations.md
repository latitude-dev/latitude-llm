# Evaluations

Evaluations are reliability scripts that produce scores from spans, traces, or sessions.

## Purpose

Evaluations exist to:

- monitor active signals on live traffic
- align machine judgment with human annotations
- run inside simulations
- support user-created evaluation authoring

Signal-generated evaluations are the mainline monitoring flow, and the system also supports user-authored evaluations.

## Canonical Artifact

The canonical artifact is always stored as script text.

The stored `script` field contains the body of a host-controlled JavaScript-like evaluation function.

The contract should stay aligned with the proposal:

- `Passed(score?, feedback)` and `Failed(score?, feedback)` always require feedback
- if present, the score value is passed before the feedback
- `llm(prompt, { schema })` requires a schema on every call; remaining options are host-approved only
- `semanticSimilarity(query)` returns `Promise<number>` in `[0,1]` — the max cosine between `query` and any embedded message in the current session (0 when the session has no embeddings). It reuses ingest-time `message_embeddings` (never re-embeds the session) and embeds the query at most once per distinct string; org/project/session come from the host closure, never the argument
- `parse(value, schema)` validates an unknown value against a schema
- the stored script body evaluates a conversation and returns a `Score`
- `z` is available inside the host-controlled runtime for building schemas

The runtime is portable between backend execution and the simulation CLI.

Runtime rules:

- the script should have access to `z` and other host-approved globals or dependencies only
- for MVP and early hosted execution, `llm()` runs through `@platform/ai-vercel` and the Vercel AI SDK with Latitude-managed provider/model/API-key configuration rather than stored provider/model settings
- user-configurable provider/model selection is a post-MVP extension and must not force a storage migration for the script artifact

## Runtime Architecture

The final runtime is a portable JavaScript-like sandbox shared by backend monitoring and the simulation CLI.

The important invariants are:

- the persisted artifact is always script source text
- the runtime exposes only host-controlled helpers such as `Passed`, `Failed`, `llm`, `parse`, and `z`
- the MVP hosted bridge keeps provider/model selection Latitude-managed
- if post-MVP runtime-configured execution lands, provider/model resolution should flow from evaluation settings to project settings to organization settings
- the runtime must enforce resource limits and stay portable across executors
- signal-generated evaluations may often be simple `llm()`-as-judge scripts, but the runtime is not limited to that subset

## Session runtime context

Every evaluation script runs against a single `session` global (`ScriptSessionContext` in `@domain/sandbox`). The host loads it from the triggering trace's session via `loadScriptSessionContext` in `@domain/evaluations`.

The object exposes:

- session-level aggregates: `traceCount`, `spanCount`, `errorCount`, `duration` (ns), `timeToFirstToken` (ns), `cost` (microcents), `tokens`, `startTime`, `endTime`, `userId`, `tags`, `metadata`
- `conversation` — deduped, session-wide transcript (system instructions + last responsive trace input/outputs). `llm()` and judge scripts stringify this; deterministic rules read scoped slices through generated helpers
- `traces` — per-trace rollups with models, providers, finish reasons, and a `tools` projection (`name`, truncated `input`/`output`, `error`, `duration`)

There is no raw per-span array. Orphan sessions (no session rollup row) fall back to the single triggering trace.

Deterministic `rule` settings compile to pure scripts that read `session` and `session.traces` directly. Judge settings compile to `llm(\`${session.conversation}\` …)` scripts. Both share the same loader and sandbox contract.

## Evaluation Model

An evaluation optionally carries a declarative `settings` payload that compiles to its `script`; `settings` is null for a raw or GEPA-generated script.

The required persisted shapes are:

```typescript
import type { FilterSet } from "@domain/shared"

type EvaluationTrigger = {
  filter: FilterSet; // trace/session filter over the shared trace field registry; `{}` matches all traces
  turn: "first" | "every" | "last"; // runs on the first, every, or last ingested trace/turn
  debounce: number; // debounce time in seconds
  sampling: number; // percentage [0, 100]
};

type EvaluationAlignment = {
  evaluationHash: string; // sha1 of the script so alignment can be incrementally refreshed when unchanged
  confusionMatrix: {
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    trueNegatives: number;
  }; // stored counts from which the alignment metric and other metrics are derived on read
};
```

Evaluation rows live in Postgres with:

- `signal_id` — the backed signal. **One *active* detector per signal**, enforced by a partial-unique index `(signal_id) WHERE deleted_at IS NULL AND archived_at IS NULL`; archived predecessors are kept for lineage. (A one-time migration deduped the historical multiple-evaluations-per-signal rows, keeping the most-recently-aligned active.)
- `script` (always present) + `script_hash` — the writer stamps each score's `metadata.evaluationHash` from `script_hash` (not from the now-nullable `alignment`). Backfilled from `alignment.evaluationHash`.
- `settings` (nullable) — the declarative config that compiled to `script`.
- `trigger`
- `alignment` / `aligned_at` — **nullable**; set only for aligned judge scripts (those that call `llm()`), null for raw/deterministic scripts.
- `archived_at` and `deleted_at`

Membership is recorded as `scores.signal_id`, never `passed`. An evaluation run's `passed` is host-derived by thresholding the script's `value`; the writer stamps `signal_id` when the behavior is _present_ (`passed = true`). The baseline judge prompt and GEPA proposer set `passed = true` when the behavior is present, so generated and re-optimized judges follow this convention.

`EvaluationSettings` (in `@domain/shared`) is the declarative config a user edits in the builder; it compiles deterministically to `script`. Supported kinds:

```typescript
type EvaluationSettings =
  | { kind: "judge"; criteria: string }
  | {
      kind: "rule"
      match: "all" | "any"
      conditions: EvaluationRuleCondition[] // 1..EVALUATION_RULE_MAX_CONDITIONS
    }
```

`rule` conditions are deterministic checks over the `session` object. Supported condition types include `text_match`, `empty_output`, `output_length`, `json_output`, `metric` (with `session` / `anyTrace` / `allTraces` aggregation), `tool_used`, `tool_failed`, `tool_call_count`, `error`, `finish_reason`, `semantic_similarity`, and `always`. Metric values use base units (`duration` ns, `cost` microcents, counts otherwise). Invalid regex patterns are rejected at settings parse time so codegen does not emit scripts that throw on every trace.

`always` compiles to `true`. A rule needs at least one condition, so it is how a signal defined by its scope alone is expressed — the shape a signal created from a saved search with no query takes.

`semantic_similarity` (`{ query, operator, threshold }`) is the one non-pure rule condition: it compiles to `(await semanticSimilarity(query)) OP threshold`, which makes the compiled script an `embedding`-capability run routed through the `semanticSimilarity()` host verb (see the sandbox contract above). The builder exposes named presets (Broad/Balanced/Strict → `SEMANTIC_SIMILARITY_PRESETS`) mapped to the stored `threshold`.

Because `trace-search` (which writes `message_embeddings`) runs after the initial `signals:match` trigger, embedding-capability live evaluations pass through a **readiness gate** in `runLiveEvaluationUseCase`:

1. `hasSessionEmbeddings` checks whether the **triggering trace** has vectors in `message_embeddings` for the active embedding model — not merely `trace_message_occurrences` rows (occurrences are written even when embedding is skipped, so gating on occurrences alone would score against nothing and persist a permanent false negative).
2. When embeddings are missing, the worker re-publishes `live-evaluations:execute` with an incremented `embeddingWaitAttempt`, debounced by 120s, up to three attempts.
3. When attempts are exhausted, the run **skips without persisting a score** (`reason: "embeddings-unavailable"`). A persisted `0` would block every future retry via `existsByEvaluationIdAndTraceId`.
4. Primary recovery is `trace-search` re-triggering `signals:match` with `reason: "embeddings-ready"` once vectors land; the timed backstop covers a lost re-trigger.

Builder preview uses the same `hasSessionEmbeddings` check over the whole session before running a semantic rule.

`compileSettingsToScript` (in `@domain/evaluations`, not `@domain/sandbox` — sandbox is the lower-level runtime contract and must not depend on the judge template) turns settings into a script. The judge form reuses the single-sourced baseline judge wrapper (`generateJudgePromptText` + `wrapPromptAsEvaluationScript`), so a settings-authored judge is the same shape as a discovered one and `llm()` capability detection holds. `validateEvaluationScriptCompiles` compiles the result in the QuickJS sandbox and surfaces a `ScriptCompileError` (HTTP 422) for an invalid script. `createEvaluationUseCase` ties these together: compile/validate → stamp `script_hash` → detect capability → persist unaligned.

## Background Tasks

Evaluation background work uses queue tasks in `@domain/queue`, `@platform/queue-bullmq`, and `apps/workers`, plus the existing Temporal-backed workflow abstraction in `apps/workflows` for durable multi-step orchestration.

The main contracts are:

- domain events: `TracesIngested`
- topic tasks: `trace-end:run`, `live-evaluations:execute`, `evaluations:automaticRefreshAlignment`, `evaluations:automaticOptimization`
- workflows: `refresh-evaluation-alignment`, `optimize-evaluation`

Rules:

- queue topics are the durable routing identity; BullMQ job names are transport detail only
- each topic may define several lower-kebab-case task names, and the topic worker dispatches by task name
- payloads carry ids plus minimal trigger/alignment context, not full evaluation rows or full traces
- workers and workflow activities re-fetch current evaluation/example state before acting
- the `domain-events` worker is a dispatcher only: it publishes downstream tasks or starts workflows and never runs synchronous business logic inline
- user-triggered signal generation starts the same aligner pipeline by directly starting the `optimize-evaluation` workflow rather than running alignment in the request itself
- annotation-driven automatic realignment flows through two throttled BullMQ tasks: `evaluations:automaticRefreshAlignment` (1h throttle) starts `refresh-evaluation-alignment`, and on an incremental alignment-metric drop that workflow publishes `evaluations:automaticOptimization` (8h throttle) which starts `optimize-evaluation`. Workflows never sleep — the queue owns both windows. Throttle (not debounce) semantics: the first publish schedules the fire time; subsequent publishes within the window are dropped by BullMQ, so a constant annotation stream cannot starve the refresh. Worst-case latency is bounded (1h for refresh, 8h for optimize) and fires are capped at once per window per evaluation

User-triggered background generation contract:

- when a user clicks `Generate evaluation`, the server starts the `optimize-evaluation` workflow with a deterministic `evaluations:generate:${signalId}` workflow id and returns immediately — no `jobId` leaks back to the frontend. "Realign now" uses the same workflow with an `evaluations:optimize:${evaluationId}` id so a user-triggered run and the 8h automatic optimize share the same workflow id (any in-flight run blocks the other via Temporal's `workflowIdConflictPolicy: "FAIL"`, which the worker swallows)
- progress is tracked by Temporal itself; Temporal is the single source of truth for workflow state, and no Redis-backed status mirror exists
- the frontend polls `getSignalAlignmentState`, which asks Temporal directly via `workflow.describe()` on three deterministic ids: `evaluations:generate:${signalId}` for the initial-generation run, plus `evaluations:refreshAlignment:${evaluationId}` and `evaluations:optimize:${evaluationId}` per active linked evaluation. A running workflow at any of those ids unambiguously means "actively running" — the new workflows are linear and exit when activities finish, so there is no more "alive-but-napping" window
- the response collapses to a minimal UI contract (`idle` / `generating` / `realigning` with `evaluationId`), intentionally omitting internal identifiers like `runId` or `currentJobId`
- when the workflow terminates, its final status and any error are available through Temporal's own history — the UI infers "just finished" by observing the transition from `generating`/`realigning` back to `idle` across polls

Required Postgres indexes:

- soft-delete-aware unique btree on `(organization_id, project_id, name, deleted_at)` with nulls-not-distinct semantics
- btree on `(organization_id, project_id, deleted_at, archived_at, created_at)` for active/archived project list views
- btree on `(organization_id, project_id, signal_id, deleted_at)` for signal-linked evaluation lookups and signal-driven lifecycle updates
- do not add a unique signal-level constraint; signals may have several linked evaluations
- do not add GIN/JSONB indexes on `trigger` or `alignment`, and do not add text indexes on `script` or `description` in the evaluations foundation phase

## Generation And Alignment

Evaluations generated from signals (by user demand) are the mainline flow:

- signal discovery and signal creation do not automatically create evaluations
- the signal list and signal details drawer expose `Generate evaluation`
- signals may have several linked evaluations, and each trigger starts the same initial generation/alignment flow described below as a background job
- after creation, throttled automatic realignment still runs as new annotations arrive for each linked evaluation
- alignment reads published, non-draft, non-errored canonical score rows from Postgres; aggregate dashboard metrics may still come from ClickHouse score analytics

1. collect annotation-derived truth with at least `1` positive example and any available negatives
2. create a baseline signal-monitor script
3. optimize that script
4. validate it against held-out examples
5. persist the best script
6. generate or refresh the evaluation name and description

Alignment rules from the proposal:

- only persisted alignment primitive: confusion matrix
- the headline alignment metric (currently balanced accuracy), along with recall, specificity, precision, F1, MCC, and accuracy, are all derived from that confusion matrix on read. The decision logic and UI refer to the headline value as the "alignment metric" and never hardcode the underlying formula, so it can be swapped without touching callers
- drafts and errored scores are excluded from alignment entirely
- user-triggered initial generation/alignment starts immediately when requested from a signal, but it runs in the background through the `optimize-evaluation` workflow under an `evaluations:generate:${signalId}` workflow id
- throttled incremental metric recomputation at most once per hour per evaluation; fires at most 1h after the first annotation
- throttled full realignment at most once per eight hours per evaluation; fires at most 8h after the first alignment-metric-drop escalation
- manual realignment is available and throttled
- unchanged scripts may refresh alignment incrementally instead of fully re-optimizing
- the refresh workflow compares `sha1(evaluation.script)` to `evaluation.alignment.evaluationHash` on every run: when they match, new examples are evaluated and added into the existing confusion-matrix counters; when they diverge (the script was updated outside the atomic alignment write path), the workflow rebuilds the matrix from scratch against all curated examples and persists the freshly computed hash so future refreshes are back on the incremental path
- throttled automatic refresh runs through `refresh-evaluation-alignment` (started by the 1h-throttled `evaluations:automaticRefreshAlignment` queue task) and escalates into `optimize-evaluation` (started by the 8h-throttled `evaluations:automaticOptimization` queue task) when the incremental evaluator returns `full-reoptimization`; manual background refresh also starts `optimize-evaluation` directly with the same `evaluations:optimize:${evaluationId}` workflow id, so a manual run and a pending automatic optimize collapse into a single in-flight run via Temporal's workflow-id dedupe

These cadence and tuning values, including the default sampling percentage for newly created signal-linked evaluations, should be defined as named constants inside `packages/domain/evaluations` rather than as scattered inline literals.

Positive examples:

- conversations where human annotations indicate the target signal is present, meaning a failed, non-errored, non-draft annotation score linked to the specific signal being aligned
- minimum required positive-example count for initial signal-linked generation: `1`

Negative examples, after filtering out drafts and errored scores, in priority order:

1. conversations with no failed scores and at least one passed annotation as long as that score is also non-draft and non-errored
2. conversations with no failed scores
3. conversations with scores, either passed or failed, but unrelated to the signal being aligned, as long as those scores are also non-draft and non-errored

There is no minimum negative-example count for initial signal-linked generation. A monitor may be created from a single positive occurrence with zero negatives, and its alignment may be weak at first. As users add more annotations, the throttled realignment flow should improve that monitor over time.

## Optimizer

The first optimizer is GEPA, but the system must support future optimizers through a common interface.

That abstraction should live in `@domain/optimizations`, with the first concrete implementation living in `@platform/op-gepa`.

The abstraction must support Pareto-driven multi-objective optimization with this priority order:

1. maximize the alignment metric against human judgment
2. minimize cost in dollars, derived from stored microcent values
3. minimize duration in seconds, derived from stored nanosecond values

The optimizer-facing alignment objective is the derived alignment metric from the ground-truth evaluation run. The only persisted alignment primitive remains the confusion matrix, from which the alignment metric, accuracy, recall, specificity, F1, MCC, and other metrics are computed.

Persisted reliability cost stays in a field named `cost` and is stored in microcents. UI/reporting and optimizer-facing cost displays convert that stored value into dollars at read time.

Persisted reliability duration stays in a field named `duration` and is stored in nanoseconds. UI/reporting and optimizer-facing duration displays convert that stored value into seconds or other human-friendly units at read time.

The abstraction must stay multi-objective aware without turning into a full optimizer algorithm by itself. GEPA provides the Pareto-driven concrete implementation; the abstraction preserves the contract for ordered multi-objective optimization.

Evaluations generated from signals (by user demand) should stay script-native and GEPA-backed, and the same runtime/optimizer foundations also support user-authored evaluations.

Important v1 reuse guidance:

- reuse the Python RPC + TypeScript orchestration pattern where it still fits
- adapt the proposer/evaluator feedback loop to scripts instead of prompts
- keep TypeScript responsible for pipeline orchestration and domain state

The optimizer should optimize script text, not hidden configuration objects.

Concrete v1 architecture that future agents should understand:

- v1 was a queued lifecycle: start, prepare, execute, validate, end
- TypeScript owned example curation, candidate execution, evaluation, proposer prompting, persistence, and cancellation
- Python only ran the GEPA search loop
- Node workers remained the primary runtime, while the worker image bundled the Python engine runtime and source so TypeScript could spawn `python -m app.main` as a child process
- the transport was a bidirectional child-process JSON-RPC channel over stdio
- the Python side registered handlers in `apps/engine/app/main.py` and `apps/engine/app/rpc/server.py`, while the TypeScript GEPA adapter registered `Evaluate` and `Propose` callbacks for the engine to call back into
- the RPC payloads were intentionally skinny: example ids, prompt hashes, and trajectory ids instead of full traces
- full trajectories stayed host-side and were rehydrated only when the proposer needed them

What `evaluate` and `propose` looked like in v1:

- `evaluate` validated candidate invariants, converted many candidate-specific failures into learnable feedback, executed the candidate, optionally simulated extra turns, ran the evaluation, and returned a rich trajectory
- `propose` sanitized the stored trajectories, enriched model metadata when available, called a Copilot prompt template, cached by exact input hash, and returned the next candidate artifact text

Important v2 adaptations:

- the optimized artifact is now an evaluation script, not a prompt document
- script/runtime contract failures should become learnable feedback when possible, just like prompt failures did in v1
- v1 configured GEPA with Pareto-oriented search settings but still supplied a single scalar score to the optimizer; v2 continues to optimize on that same scalar correctness signal rather than host-defined objective vectors

The proposer and details-generator use Latitude-owned prompts stored in this repository.

The proposer and details-generator model selections must live in named constants inside the owning optimizer implementation package rather than as inline magic strings.

Initial defaults:

- the proposer uses `gpt-5.4` with reasoning settings maximized
- the details-generator uses `gpt-5.4` with lower reasoning settings

Legacy v1 reference paths for this section:

- `apps/engine`
- `apps/workers/docker/Dockerfile`
- `packages/core/src/services/optimizations`
- `packages/core/src/services/optimizations/optimizers/evaluate.ts`
- `packages/core/src/services/optimizations/optimizers/propose.ts`

Before using those paths, checkout branch `latitude-v1` in the old repository and read them from its root.

## Triggering

The base trigger model includes:

- `turn`
- `debounce`
- `sampling`
- `filter`

Trigger semantics:

- `turn`, `debounce`, `sampling`, and `filter` are all part of the evaluation trigger model
- `filter` uses the shared `FilterSet` described in `./filters.md`, applied against the shared trace field registry
- an empty `filter` means "match all traces"
- new evaluations generated from signals initialize `sampling` from a named constant in `packages/domain/evaluations`, with an initial default of `10`

Live evaluation triggering is incremental:

- whenever a `TracesIngested` domain event is observed for a project, the `domain-events` dispatcher fans out one debounced `signals:match` publish per deduped trace id (alongside `trace-end:run` for queues, flaggers, and other trace-end work)
- the `signals:match` worker (`apps/workers/src/workers/signals-match.ts`) owns evaluation selection and execution fan-out; `trace-end:run` no longer publishes `live-evaluations:execute`
- the worker lists all active evaluations in the project (`archivedAt = null` and `deletedAt = null`), runs trigger checks against the incoming trace, and publishes `live-evaluations:execute` for each passing `(evaluationId, traceId)` pair
- trigger checks run against the incoming trace rather than rescanning historical traces on each read
- trigger evaluation order is deterministic `sampling` first, then shared batched `filter`, then `turn` / `debounce`
- selection stays separate from side effects: the worker finishes all evaluation decisions before publishing execute tasks, so newly written evaluation scores cannot affect selection for the same trace
- `live-evaluations:execute` later runs the evaluation against the loaded `session` context, writes the resulting score, stamps `signal_id` when the behavior is present (`passed = true`), and persists execution failures as canonical errored evaluation scores
- the execute path still rechecks canonical duplicate state before running hosted AI work, and Postgres also enforces that only one non-draft canonical evaluation score can exist for the same `(evaluationId, traceId)` pair, so concurrent workers cannot persist duplicate monitor results
- the hosted AI call inside `live-evaluations:execute` runs inside a stable telemetry capture span named `evaluation.live.execute` with queued identity metadata including `organizationId`, `projectId`, `evaluationId`, and `traceId`
- trigger filters participate in the same live incremental model through the shared trace-filter semantics defined in `./filters.md`
- in code, the evaluation side lives in `@domain/evaluations`: `buildTraceEndEvaluationSelectionInputs` builds selection specs and eligible rows, and `orchestrateTraceEndLiveEvaluationExecutesUseCase` applies turn rules, checks canonical score state via `ScoreRepository`, and enqueues `live-evaluations:execute` through an injected publish callback (the `signals:match` worker binds the real BullMQ publisher)

## Lifecycle

- active evaluations run and generate scores
- paused evaluations use `sampling = 0`
- archived evaluations are read-only and never trigger
- if a signal is manually ignored, its linked evaluations are archived immediately
- if a signal is manually resolved, the confirmation-modal toggle defaulted from `keepMonitoring` decides whether linked evaluations remain active or archive
- when project-level `keepMonitoring` is unset, the toggle default falls back to the organization-level `keepMonitoring`
- deleted evaluations are soft-deleted from management UI but remain represented in historical analytics
- signal-linked live monitor failures claim `scores.signal_id` during the canonical score write so the failed score is immutable immediately; errored live monitor scores stay unowned with `error != null` and `errored = true`, so they are also immutable immediately; other evaluation-originated failed scores that stay unowned may still flow through the centralized `issues:discovery` queue task (legacy topic name), which resolves the linked signal before similarity search starts

## Product Surface

The project `Evaluations` page includes:

- project-wide analytics
- active evaluation table
- custom score sources as a continuation of the table
- archived evaluations table

The active evaluations table includes:

- `Name`, with a paused tag when `sampling = 0`
- `Description`
- `Signal` (linked signal name/slug)
- `Trend`
- quick actions for trigger updates, pause/resume, archive, and delete

Trigger updates should edit the shared `FilterSet` plus `turn`, `debounce`, and `sampling` through the shared filter-builder patterns rather than a free-form text field.

Pause/resume/archive/delete actions require confirmation flows.

Custom score sources remain a continuation of the same table surface, but they have no execution-settings editor, no trigger editor, and no script viewer.

Archived evaluations are shown in a lighter table and can be unarchived.

The evaluation dashboard includes:

- score-over-time chart
- total scores, average score, duration, cost, tokens
- derived alignment widget with manual realignment
- score table with filters and details modal
- read-only script viewer

Read split:

- charts and aggregate counters read from the immutable ClickHouse score analytics table
- score tables, details, and other row-level score reads come from canonical Postgres scores

If a score errored, tint the whole row red.

Dashboard and score-table reads should exclude simulation-generated scores by default, with explicit include behavior where the product needs it.

For custom score sources:

- there is no execution-settings editor
- there is no trigger editor
- there is no script viewer

Stable machine-facing/public API scope includes:

- evaluation listing
- evaluation creation and editing
- status changes
- trigger updates
- dashboard reads
- custom source reads
- post-MVP execution-settings updates if runtime-configured provider/model support lands

## Still Pending Precise Definition

- exact user-authored evaluation editor/copilot UX
