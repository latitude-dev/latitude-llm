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
- `llm(prompt, options?)` accepts an optional configuration object
- `parse(value, schema)` validates an unknown value against a schema
- the stored script body evaluates a conversation and returns a `Score`
- `zod` is available inside the host-controlled runtime

The runtime is portable between backend execution and the simulation CLI.

Runtime rules:

- the script should have access to `zod` and other host-approved globals or dependencies only
- functions that require user configuration, such as the `llm()` provider/model choice, resolve first from the evaluation settings, then the project settings, and finally the organization settings

## Runtime Architecture

The final runtime is a portable JavaScript-like sandbox shared by backend monitoring and the simulation CLI.

The important invariants are:

- the persisted artifact is always script source text
- the runtime exposes only host-controlled helpers such as `Passed`, `Failed`, `llm`, `parse`, and `zod`
- provider/model resolution for runtime-configured helpers flows from evaluation settings to project settings to organization settings
- the runtime must enforce resource limits and stay portable across executors
- issue-generated evaluations may often be simple `llm()`-as-judge scripts, but the runtime is not limited to that subset

## Evaluation Model

```typescript
type EvaluationSettings = {
  provider?: string; // if not provided, resolution falls back through project settings and then organization settings
  model?: string; // if not provided, resolution falls back through project settings and then organization settings
};

type EvaluationTrigger = {
  filter: string; // runs on traces that match this filter
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
- `script`, `settings`, `trigger`, and `alignment`
- `aligned_at`, `archived_at`, and `deleted_at`

## Background Tasks

Evaluation background work uses the repository queue stack in `@domain/queue`, `@platform/queue-bullmq`, and `apps/workers`.

The main contracts are:

- `trace-finish-detection`: delayed debounced task keyed by `(organizationId, projectId, traceId)`; each newly ingested span for the same trace replaces/reschedules the pending job using BullMQ delay mechanics, with the debounce window defined by a named constant whose initial default is `5 minutes`
- `TraceFinished` domain event for post-ingest/live-trigger fan-out after that debounce window elapses
- `evaluation-execution` for one `(evaluationId, traceId)` execution after trigger matching
- `evaluation-alignment` for one generation or realignment pass against the current example set

Rules:

- queue topics are the durable routing identity; BullMQ job names are transport detail only
- payloads carry ids plus minimal trigger/alignment context, not full evaluation rows or full traces
- workers re-fetch current evaluation/example state before acting
- user-triggered issue generation starts the same aligner pipeline through `evaluation-alignment` rather than running alignment in the request itself
- when a delayed queue topic semantically marks a lifecycle edge, that topic should publish a domain event through the outbox when the delay elapses rather than executing all downstream side effects inline
- debounced/manual alignment refresh uses persisted due-work scans plus `evaluation-alignment`, not implicit BullMQ delayed/repeat jobs

User-triggered background generation contract:

- when a user clicks `Generate evaluation`, the server publishes `evaluation-alignment` and returns a `jobId` immediately
- progress is written to a Redis key following the background-task convention, for example `evaluation-alignment:<jobId>`
- the frontend polls a dedicated status endpoint / server function that reads that Redis key rather than querying BullMQ directly
- the status payload should at least support `pending`, `running`, `completed`, and `failed`
- completion status includes the resulting `evaluationId`; failed status includes an error payload; key expiry is controlled by a named constant

Required Postgres indexes:

- soft-delete-aware unique btree on `(organization_id, project_id, name, deleted_at)` with nulls-not-distinct semantics
- btree on `(organization_id, project_id, deleted_at, archived_at, created_at)` for active/archived project list views
- btree on `(organization_id, project_id, issue_id, deleted_at)` for issue-linked evaluation lookups and issue-driven lifecycle updates
- do not add a unique issue-level constraint; issues may have several linked evaluations
- do not add GIN/JSONB indexes on `settings`, `trigger`, or `alignment`, and do not add text indexes on `script` or `description` in the evaluations foundation phase

## Generation And Alignment

Evaluations generated from issues (by user demand) are the mainline flow:

- issue discovery and issue creation do not automatically create evaluations
- the issue list and issue details modal/page expose `Generate evaluation`
- issues may have several linked evaluations, and each trigger starts the same initial generation/alignment flow described below as a background job
- after creation, debounced automatic realignment still runs as new annotations arrive for each linked evaluation
- alignment reads finalized, non-draft, non-errored canonical score rows from Postgres; aggregate dashboard metrics may still come from ClickHouse projections

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
- user-triggered initial generation/alignment starts immediately when requested from an issue, but it runs in the background through `evaluation-alignment`
- debounced metric recomputation every hour at most
- debounced full realignment every eight hours at most
- manual realignment is available and rate-limited
- unchanged scripts may refresh alignment incrementally instead of fully re-optimizing
- when the script hash is unchanged, new examples are evaluated and added into the existing confusion-matrix counters
- debounced and manual background refreshes should reuse the `evaluation-alignment` worker path

These cadence and tuning values, including the default sampling percentage for newly created issue-linked evaluations, should be defined as named constants inside `packages/domain/evaluations` rather than as scattered inline literals.

Positive examples:

- conversations where human annotations indicate the target issue is present, meaning a failed, non-errored, non-draft annotation score linked to the specific issue being aligned
- minimum required positive-example count for initial issue-linked generation: `1`

Negative examples, after filtering out drafts and errored scores, in priority order:

1. conversations with no failed scores and at least one passed annotation as long as that score is also non-draft and non-errored
2. conversations with no failed scores
3. conversations with scores, either passed or failed, but unrelated to the issue being aligned, as long as those scores are also non-draft and non-errored

There is no minimum negative-example count for initial issue-linked generation. A monitor may be created from a single positive occurrence with zero negatives, and its alignment may be weak at first. As users add more annotations, the debounced realignment flow should improve that monitor over time.

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
- v1 configured GEPA with Pareto-oriented settings but still supplied a single scalar score to the optimizer; v2 must implement the real ordered objectives explicitly rather than assuming v1 already solved that

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
- the exact filter grammar is still pending precise definition, but filters are part of the final trigger shape
- new evaluations generated from issues initialize `sampling` from a named constant in `packages/domain/evaluations`, with an initial default of `10`

Live evaluation triggering is incremental:

- whenever a `TraceFinished` domain event is observed for a project, a dedicated live-evaluation handler lists all active evaluations in that project, meaning rows with `archivedAt = null` and `deletedAt = null`
- trigger checks run against the incoming trace rather than rescanning historical traces on each read
- trigger evaluation order is `filter` first, `sampling` second, then `turn` / `debounce`
- when an evaluation passes those trigger checks, the handler publishes one `evaluation-execution` task for that `(evaluationId, traceId)` pair; the worker later runs the evaluation and writes the resulting score
- this live-evaluation handler is separate from the live-annotation-queue handler
- trigger filters participate in the same live incremental model once the shared filter grammar is fully defined

## Lifecycle

- active evaluations run and generate scores
- paused evaluations use `sampling = 0`
- archived evaluations are read-only and never trigger
- if an issue is manually ignored, its linked evaluations are archived immediately
- if an issue is manually resolved, the confirmation-modal toggle defaulted from `keepMonitoring` decides whether linked evaluations remain active or archive
- when project-level `keepMonitoring` is unset, the toggle default falls back to the organization-level `keepMonitoring`
- deleted evaluations are soft-deleted from management UI but remain represented in historical analytics
- issue-linked monitor failures bypass discovery and assign `scores.issue_id` directly

## Product Surface

The project `Evaluations` page includes:

- project-wide analytics
- active evaluation table
- custom score buckets as a continuation of the table
- archived evaluations table

The active evaluations table includes:

- `Name`, with a paused tag when `sampling = 0`
- `Description`
- `Issue`
- `Trend`
- quick actions for settings, pause/resume, archive, and delete

Pause/resume/archive/delete actions require confirmation flows.

Custom score buckets remain a continuation of the same table surface, but they have no settings editor, no trigger editor, and no script viewer.

Archived evaluations are shown in a lighter table and can be unarchived.

The evaluation dashboard includes:

- score-over-time chart
- total scores, average score, duration, cost, tokens
- derived alignment widget with manual realignment
- score table with filters and details modal
- read-only script viewer

Read split:

- charts and aggregate counters read from the immutable ClickHouse score projection
- score tables, details, and other row-level score reads come from canonical Postgres scores

If a score errored, tint the whole row red.

Dashboard and score-table reads should exclude simulation-generated scores by default, with explicit include behavior where the product needs it.

For custom score buckets:

- there is no settings editor
- there is no trigger editor
- there is no script viewer

Stable machine-facing/public API scope includes:

- evaluation listing
- evaluation creation and editing
- status changes
- settings/trigger updates
- dashboard reads
- custom bucket reads

## Still Pending Precise Definition

- exact user-authored evaluation editor/copilot UX
- exact shared trigger-filter grammar
