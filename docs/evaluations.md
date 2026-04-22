# Evaluations

Evaluations are reliability scripts that produce scores from spans, traces, or sessions.

## Purpose

Evaluations exist to:

- monitor active issues on live traffic
- align machine judgment with human annotations
- run inside simulations
- support user-created evaluation authoring
  Issue-generated evaluations are the mainline monitoring flow, and the system also supports user-authored evaluations.

## Canonical Artifact

The canonical artifact is always stored as script text.

The stored `script` field contains the body of a host-controlled JavaScript-like evaluation function.

The contract should stay aligned with the proposal:

- `Passed(score?, feedback)` and `Failed(score?, feedback)` always require feedback
- if present, the score value is passed before the feedback
- `llm(prompt, options?)` accepts an optional host-approved configuration object
- `parse(value, schema)` validates an unknown value against a schema
- the stored script body evaluates a conversation and returns a `Score`
- `zod` is available inside the host-controlled runtime

The runtime is portable between backend execution and the simulation CLI.

Runtime rules:

- the script should have access to `zod` and other host-approved globals or dependencies only
- for MVP and early hosted execution, `llm()` runs through `@platform/ai-vercel` and the Vercel AI SDK with Latitude-managed provider/model/API-key configuration rather than stored provider/model settings
- user-configurable provider/model selection is a post-MVP extension and must not force a storage migration for the script artifact

## Runtime Architecture

The final runtime is a portable JavaScript-like sandbox shared by backend monitoring and the simulation CLI.

The important invariants are:

- the persisted artifact is always script source text
- the runtime exposes only host-controlled helpers such as `Passed`, `Failed`, `llm`, `parse`, and `zod`
- the MVP hosted bridge keeps provider/model selection Latitude-managed
- if post-MVP runtime-configured execution lands, provider/model resolution should flow from evaluation settings to project settings to organization settings
- the runtime must enforce resource limits and stay portable across executors
- issue-generated evaluations may often be simple `llm()`-as-judge scripts, but the runtime is not limited to that subset

## Evaluation Model

MVP evaluation rows do not need a `settings` payload.

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
  }; // stored counts from which MCC and other metrics can be derived
};
```

Evaluation rows live in Postgres with:

- optional `issue_id` for issue-linked evaluations
- multiple evaluations may link to the same issue
- `script`, `trigger`, and `alignment`
- `aligned_at`, `archived_at`, and `deleted_at`

Post-MVP, the model may grow a narrow execution-settings payload:

```typescript
type EvaluationSettings = {
  provider?: string
  model?: string
}
```

That extension is intentionally limited to provider/model selection and should only land when the later provider-settings phase is implemented.

## Background Tasks

Evaluation background work uses queue tasks in `@domain/queue`, `@platform/queue-bullmq`, and `apps/workers`, plus the existing Temporal-backed workflow abstraction in `apps/workflows` for durable multi-step orchestration.

The main contracts are:

- domain events: `SpanIngested`
- topic tasks: `trace-end:run`, `live-evaluations:execute`, `evaluations:automaticRefreshAlignment`, `evaluations:automaticOptimization`
- workflows: `refresh-evaluation-alignment`, `optimize-evaluation`

Rules:

- queue topics are the durable routing identity; BullMQ job names are transport detail only
- each topic may define several lower-kebab-case task names, and the topic worker dispatches by task name
- payloads carry ids plus minimal trigger/alignment context, not full evaluation rows or full traces
- workers and workflow activities re-fetch current evaluation/example state before acting
- the `domain-events` worker is a dispatcher only: it publishes downstream tasks or starts workflows and never runs synchronous business logic inline
- user-triggered issue generation starts the same aligner pipeline by directly starting the `optimize-evaluation` workflow rather than running alignment in the request itself
- annotation-driven automatic realignment flows through two throttled BullMQ tasks: `evaluations:automaticRefreshAlignment` (1h throttle) starts `refresh-evaluation-alignment`, and on an incremental MCC drop that workflow publishes `evaluations:automaticOptimization` (8h throttle) which starts `optimize-evaluation`. Workflows never sleep — the queue owns both windows. Throttle (not debounce) semantics: the first publish schedules the fire time; subsequent publishes within the window are dropped by BullMQ, so a constant annotation stream cannot starve the refresh. Worst-case latency is bounded (1h for refresh, 8h for optimize) and fires are capped at once per window per evaluation

User-triggered background generation contract:

- when a user clicks `Generate evaluation`, the server starts the `optimize-evaluation` workflow with a deterministic `evaluations:generate:${issueId}` workflow id and returns immediately — no `jobId` leaks back to the frontend. "Realign now" uses the same workflow with an `evaluations:optimize:${evaluationId}` id so a user-triggered run and the 8h automatic optimize share the same workflow id (any in-flight run blocks the other via Temporal's `workflowIdConflictPolicy: "FAIL"`, which the worker swallows)
- progress is tracked by Temporal itself; Temporal is the single source of truth for workflow state, and no Redis-backed status mirror exists
- the frontend polls `getIssueAlignmentState`, which asks Temporal directly via `workflow.describe()` on three deterministic ids: `evaluations:generate:${issueId}` for the initial-generation run, plus `evaluations:refreshAlignment:${evaluationId}` and `evaluations:optimize:${evaluationId}` per active linked evaluation. A running workflow at any of those ids unambiguously means "actively running" — the new workflows are linear and exit when activities finish, so there is no more "alive-but-napping" window
- the response collapses to a minimal UI contract (`idle` / `generating` / `realigning` with `evaluationId`), intentionally omitting internal identifiers like `runId` or `currentJobId`
- when the workflow terminates, its final status and any error are available through Temporal's own history — the UI infers "just finished" by observing the transition from `generating`/`realigning` back to `idle` across polls

Required Postgres indexes:

- soft-delete-aware unique btree on `(organization_id, project_id, name, deleted_at)` with nulls-not-distinct semantics
- btree on `(organization_id, project_id, deleted_at, archived_at, created_at)` for active/archived project list views
- btree on `(organization_id, project_id, issue_id, deleted_at)` for issue-linked evaluation lookups and issue-driven lifecycle updates
- do not add a unique issue-level constraint; issues may have several linked evaluations
- do not add GIN/JSONB indexes on `trigger` or `alignment`, and do not add text indexes on `script` or `description` in the evaluations foundation phase

## Generation And Alignment

Evaluations generated from issues (by user demand) are the mainline flow:

- issue discovery and issue creation do not automatically create evaluations
- the issue list and issue details modal/page expose `Generate evaluation`
- issues may have several linked evaluations, and each trigger starts the same initial generation/alignment flow described below as a background job
- after creation, throttled automatic realignment still runs as new annotations arrive for each linked evaluation
- alignment reads published, non-draft, non-errored canonical score rows from Postgres; aggregate dashboard metrics may still come from ClickHouse score analytics

1. collect annotation-derived truth with at least `1` positive example and any available negatives
2. create a baseline issue-monitor script
3. optimize that script
4. validate it against held-out examples
5. persist the best script
6. generate or refresh the evaluation name and description

Alignment rules from the proposal:

- only persisted alignment primitive: confusion matrix
- MCC (Matthews Correlation Coefficient), accuracy, F1, and other alignment metrics are derived from that confusion matrix on read
- drafts and errored scores are excluded from alignment entirely
- user-triggered initial generation/alignment starts immediately when requested from an issue, but it runs in the background through the `optimize-evaluation` workflow under an `evaluations:generate:${issueId}` workflow id
- throttled incremental metric recomputation at most once per hour per evaluation; fires at most 1h after the first annotation
- throttled full realignment at most once per eight hours per evaluation; fires at most 8h after the first MCC-drop escalation
- manual realignment is available and throttled
- unchanged scripts may refresh alignment incrementally instead of fully re-optimizing
- when the script hash is unchanged, new examples are evaluated and added into the existing confusion-matrix counters
- throttled automatic refresh runs through `refresh-evaluation-alignment` (started by the 1h-throttled `evaluations:automaticRefreshAlignment` queue task) and escalates into `optimize-evaluation` (started by the 8h-throttled `evaluations:automaticOptimization` queue task) when the incremental evaluator returns `full-reoptimization`; manual background refresh also starts `optimize-evaluation` directly with the same `evaluations:optimize:${evaluationId}` workflow id, so a manual run and a pending automatic optimize collapse into a single in-flight run via Temporal's workflow-id dedupe

These cadence and tuning values, including the default sampling percentage for newly created issue-linked evaluations, should be defined as named constants inside `packages/domain/evaluations` rather than as scattered inline literals.

Positive examples:

- conversations where human annotations indicate the target issue is present, meaning a failed, non-errored, non-draft annotation score linked to the specific issue being aligned
- minimum required positive-example count for initial issue-linked generation: `1`

Negative examples, after filtering out drafts and errored scores, in priority order:

1. conversations with no failed scores and at least one passed annotation as long as that score is also non-draft and non-errored
2. conversations with no failed scores
3. conversations with scores, either passed or failed, but unrelated to the issue being aligned, as long as those scores are also non-draft and non-errored

There is no minimum negative-example count for initial issue-linked generation. A monitor may be created from a single positive occurrence with zero negatives, and its alignment may be weak at first. As users add more annotations, the throttled realignment flow should improve that monitor over time.

## Optimizer

The first optimizer is GEPA, but the system must support future optimizers through a common interface.

That abstraction should live in `@domain/optimizations`, with the first concrete implementation living in `@platform/op-gepa`.

The abstraction must support Pareto-driven multi-objective optimization with this priority order:

1. maximize alignment (MCC) against human judgment
2. minimize cost in dollars, derived from stored microcent values
3. minimize duration in seconds, derived from stored nanosecond values

The optimizer-facing alignment objective is the derived MCC from the ground-truth evaluation run. The only persisted alignment primitive remains the confusion matrix, from which MCC, accuracy, F1, and other metrics can be computed.

Persisted reliability cost stays in a field named `cost` and is stored in microcents. UI/reporting and optimizer-facing cost displays convert that stored value into dollars at read time.

Persisted reliability duration stays in a field named `duration` and is stored in nanoseconds. UI/reporting and optimizer-facing duration displays convert that stored value into seconds or other human-friendly units at read time.

The abstraction must stay multi-objective aware without turning into a full optimizer algorithm by itself. GEPA provides the Pareto-driven concrete implementation; the abstraction preserves the contract for ordered multi-objective optimization.

Evaluations generated from issues (by user demand) should stay script-native and GEPA-backed, and the same runtime/optimizer foundations also support user-authored evaluations.

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
- `filter` uses the shared `FilterSet` described in `docs/filters.md`, applied against the shared trace field registry
- an empty `filter` means "match all traces"
- new evaluations generated from issues initialize `sampling` from a named constant in `packages/domain/evaluations`, with an initial default of `10`

Live evaluation triggering is incremental:

- whenever a `SpanIngested` domain event is observed for a project, the `domain-events` dispatcher debounces and publishes `trace-end:run` for that trace, and that runtime lists all active evaluations in the project, meaning rows with `archivedAt = null` and `deletedAt = null`
- trigger checks run against the incoming trace rather than rescanning historical traces on each read
- trigger evaluation order is deterministic `sampling` first, then shared batched `filter`, then `turn` / `debounce`
- `trace-end:run` keeps selection separate from side effects: it finishes all evaluation, live-queue, and system-queue decisions before publishing any `live-evaluations:execute` task, so newly written evaluation scores cannot affect queue selection for the same trace-end run
- when an evaluation passes those trigger checks, `trace-end:run` publishes one `live-evaluations:execute` task for that `(evaluationId, traceId)` pair; that task later runs the evaluation, writes the resulting score, keeps passed results unowned, immediately claims `scores.issue_id` for failed non-errored issue-linked monitor results, and persists execution failures as canonical errored evaluation scores
- the execute path still rechecks canonical duplicate state before running hosted AI work, and Postgres also enforces that only one non-draft canonical evaluation score can exist for the same `(evaluationId, traceId)` pair, so concurrent workers cannot persist duplicate monitor results
- the hosted AI call inside `live-evaluations:execute` runs inside a stable telemetry capture span named `evaluation.live.execute` with queued identity metadata including `organizationId`, `projectId`, `evaluationId`, and `traceId`
- `trace-end:run` batches live-evaluation and live-queue filter checks together instead of using separate queue tasks
- trigger filters participate in the same live incremental model through the shared trace-filter semantics defined in `docs/filters.md`
- in code, the evaluation side of that shared pass lives in `@domain/evaluations`: `buildTraceEndEvaluationSelectionInputs` builds selection specs and eligible rows, and `orchestrateTraceEndLiveEvaluationExecutesUseCase` applies turn rules, checks canonical score state via `ScoreRepository`, and enqueues `live-evaluations:execute` through an injected publish callback (the worker binds the real BullMQ publisher)

## Lifecycle

- active evaluations run and generate scores
- paused evaluations use `sampling = 0`
- archived evaluations are read-only and never trigger
- if an issue is manually ignored, its linked evaluations are archived immediately
- if an issue is manually resolved, the confirmation-modal toggle defaulted from `keepMonitoring` decides whether linked evaluations remain active or archive
- when project-level `keepMonitoring` is unset, the toggle default falls back to the organization-level `keepMonitoring`
- deleted evaluations are soft-deleted from management UI but remain represented in historical analytics
- issue-linked live monitor failures claim `scores.issue_id` during the canonical score write so the failed score is immutable immediately; errored live monitor scores stay unowned with `error != null` and `errored = true`, so they are also immutable immediately; other evaluation-originated failed scores that stay unowned may still flow through the centralized `issues:discovery` task, which resolves the linked issue before similarity search starts

## Product Surface

The project `Evaluations` page includes:

- project-wide analytics
- active evaluation table
- custom score sources as a continuation of the table
- archived evaluations table

The active evaluations table includes:

- `Name`, with a paused tag when `sampling = 0`
- `Description`
- `Issue`
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
