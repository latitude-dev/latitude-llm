# EVAL_ISSUE_GENERATION

## Purpose

This document is a full technical map of how "generate evaluation from issue" currently works in `latitude-llm`, including:

- initial evaluation generation from issue annotations
- human-alignment scoring (MCC)
- retry/refinement loop during initial generation
- post-generation alignment recalculation
- frontend state management and user feedback
- backend queues, jobs, events, websocket updates, and data model

It is meant to be the baseline for a future revamp (GEPA optimizer and related simplifications).

---

## Scope and boundaries

Covered:

- UI trigger flow and state transitions
- server actions and API routes
- evaluation creation/validation/retry/recalculation services
- queue and worker orchestration
- event and websocket propagation
- constants, types, schemas, queries, repositories
- human annotation feedback loop into alignment metrics

Not covered:

- detailed implementation of unrelated evaluation metrics (rating/comparison/custom) beyond what affects this feature
- full issue discovery internals except where they intersect this flow

---

## High-level architecture

At runtime, the feature is a multi-stage pipeline:

1. User clicks generate in issue panel and picks provider/model.
2. Action creates an `ActiveEvaluation` in Redis and enqueues `generateEvaluationV2FromIssueJob`.
3. Job asks Copilot to generate LLM-binary evaluation config from issue examples.
4. Generated evaluation is created (`evaluation_versions`) with `evaluateLiveLogs = true` and linked `issueId`.
5. A BullMQ flow runs dry evaluations over balanced HITL positive/negative spans.
6. Parent job computes MCC:
   - `mcc >= 70`: persist alignment metadata and finish.
   - `mcc < 70`: delete generated evaluation, extract false examples, retry generation with feedback.
7. Frontend tracks progress via websocket `evaluationStatus` and final alignment via `evaluationV2AlignmentMetricUpdated`.
8. Later, alignment is recalculated either:
   - daily scheduler (if new HITL spans exist), or
   - after config changes (hash mismatch).

Important current reality:

- initial generation has auto-refine (retry with false examples)
- post-generation drift does **not** trigger auto-regeneration, only metric recalculation

---

## Core data model

### `evaluation_versions` (`packages/core/src/schema/models/evaluationVersions.ts`)

Key fields for this feature:

- `evaluationUuid`, `commitId`, `documentUuid`
- `issueId` (nullable FK to `issues`)
- `type`, `metric`, `configuration`
- `alignmentMetricMetadata` (JSONB):
  - `alignmentHash`
  - confusion matrix (`truePositives`, `trueNegatives`, `falsePositives`, `falseNegatives`)
  - `lastProcessedPositiveSpanDate`
  - `lastProcessedNegativeSpanDate`
  - `recalculatingAt`
- `evaluateLiveLogs`
- `ignoredAt`, `deletedAt`

### `issues` (`packages/core/src/schema/models/issues.ts`)

Key fields:

- activity markers: `resolvedAt`, `ignoredAt`, `mergedAt`
- centroid state: `centroid`
- identity/context: `projectId`, `documentUuid`, `title`, `description`

### `issue_evaluation_results` (`packages/core/src/schema/models/issueEvaluationResults.ts`)

Join table linking failed/annotated results to issues.

### `issue_histograms` (`packages/core/src/schema/models/issueHistograms.ts`)

Stores occurrence counters by issue/commit/date.

### `evaluation_results_v2`

Stores run/annotation outcomes (`hasPassed`, `error`, `score`, `metadata`, `evaluatedSpanId`, `evaluatedTraceId`, etc.), used as ground truth source for this feature.

### Active evaluation cache (Redis)

`packages/constants/src/evaluations/active.ts`:

- key: `evaluations:active:${workspaceId}:${projectId}`
- hash field: `workflowUuid`
- TTL: 3 hours (`ACTIVE_EVALUATIONS_CACHE_TTL_SECONDS`)

State payload (`ActiveEvaluation`):

- `workflowUuid`
- `issueId`
- `queuedAt`
- `evaluationUuid?`
- `startedAt?`
- `endedAt?`
- `error?`

---

## Constants and thresholds driving behavior

From `packages/constants/src/issues/evaluations.ts`:

- `MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE = 5`
- `MINIMUM_POSITIVE_OR_OTHER_NEGATIVE_ANNOTATIONS_FOR_OTHER_ISSUES = 5`
- `MIN_ALIGNMENT_METRIC_THRESHOLD = 70`
- `MAX_ATTEMPTS_TO_GENERATE_EVALUATION_FROM_ISSUE = 3`

From `packages/core/src/services/evaluationsV2/generateFromIssue/getEqualAmountsOfPositiveAndNegativeExamples.ts`:

- local `MAX_COMPARISON_ANNOTATIONS = 100`

---

## Type contracts that matter

### Alignment metadata

`packages/constants/src/evaluations/index.ts`:

- `AlignmentMetricMetadata` tracks confusion matrix + hash + cutoff dates + recalculation state.

### Span pairs for validation/recalculation

`packages/constants/src/tracing/span.ts`:

- `SerializedSpanPair = { id, traceId, createdAt }`

### Events and websocket payloads

`packages/core/src/events/events.d.ts` and `packages/core/src/websockets/constants.ts`:

- backend lifecycle: `evaluationQueued`, `evaluationStarted`, `evaluationEnded`, `evaluationFailed`
- alignment updates: `evaluationV2AlignmentUpdated`
- websocket events consumed by frontend:
  - `evaluationStatus`
  - `evaluationV2AlignmentMetricUpdated`

---

## End-to-end flow (frontend to backend and back)

## 1) Frontend gating and trigger

Main component: `apps/web/src/app/(private)/projects/[projectId]/versions/[commitUuid]/issues/_components/IssueDetailPanel/Evaluation/index.tsx`

Inputs:

- evaluations from `useEvaluationsV2`
- active evaluations from `useActiveEvaluations`
- enough-annotations stats from `useEnoughAnnotationsForIssue`

Annotation threshold endpoint:

- `apps/web/src/app/api/projects/[projectId]/commits/[commitUuid]/issues/[issueId]/enoughAnnotations/route.ts`
- internally calls `getEvaluationResultsToGenerateEvaluationForIssue`

Threshold counting query:

- `packages/core/src/queries/issues/getEvaluationResultsToGenerateEvaluation.ts`

  - negative count = HITL results assigned to this issue
  - positive-ish count = HITL results in same document not assigned to this issue

UI path:

- If evaluation with issue already has alignment metadata, show `EvaluationWithIssue`.
- Else if not enough annotations, show `InsufficientAnnotations`.
- Else show generate button/modal.

Trigger components:

- `GenerateEvaluationButton.tsx`
- `EvaluationModal/index.tsx` (provider/model picker, optional prefill from `promptl-ai` scan)

Action call:

- store hook `useEvaluationsV2.generateEvaluationFromIssue`
- action `apps/web/src/actions/evaluationsV2/generateFromIssue.ts`

## 2) Action: queue generation and emit queued status

`generateEvaluationV2FromIssueAction`:

- validates issue active (`isIssueActive`)
- validates cloud/copilot env support
- creates ActiveEvaluation in Redis (`createActiveEvaluation`)
- enqueues `generateEvaluationV2FromIssueJob` on `Queues.generateEvaluationsQueue`
- emits `evaluationQueued` event

Idempotency key:

- `generateEvaluationV2FromIssueJob:wf=<workflowUuid>:generationAttempt=1`

## 3) Worker and job: generate evaluation config and create evaluation

Worker mapping:

- `apps/workers/src/workers/worker-definitions/generateEvaluationWorker.ts`
- queue: `generateEvaluationsQueue`
- jobs: generate + validate + recalculate

Main job:

- `packages/core/src/jobs/job-definitions/evaluations/generateEvaluationV2FromIssueJob.ts`

Behavior:

- on attempt 1, marks active evaluation started (`startActiveEvaluation`)
- calls `generateEvaluationFromIssue` service
- terminal failure path marks active evaluation failed + ended

Generation service:

- `packages/core/src/services/evaluationsV2/generateFromIssue/generateEvaluationFromIssue.ts`

Pipeline:

1. Calls Copilot config generation service.
2. Creates evaluation via `createEvaluationV2`:
   - type `llm`
   - metric `binary`
   - `issueId` set
   - `evaluateLiveLogs: true`
3. Updates active evaluation with generated `evaluationUuid`.
4. Creates validation flow (`createValidationFlow`).

## 4) Copilot config generation details

Core service:

- `packages/core/src/services/evaluationsV2/generateFromIssue/generateFromIssue.ts`

Copilot prompt input sources:

- existing evaluation names (same commit/document) to avoid name collision
- failing examples for this issue (messages + reason)
- good examples without this issue (messages + reason)
- optional false positives / false negatives from previous attempt
- optional previous configuration

Data acquisition:

- `getSpanMessagesAndEvaluationResultsByIssue`
- `getSpanMessagesByIssueDocument`
- `buildSpanMessagesWithReasons`
- span/result repo queries across commit history

Sampling used for prompt:

- currently only page 1, size 3 for each side in the helper queries

Copilot runtime:

- `runCopilot` -> `runDocumentAtCommit`
- validates returned object with zod schema matching LLM binary fields
- then force-injects:
  - selected `provider`
  - selected `model`
  - `actualOutput = { messageSelection: 'all', parsingFormat: 'string' }`
  - `reverseScale = false`

## 5) Validation flow and MCC calculation

Flow creation:

- `packages/core/src/services/evaluationsV2/generateFromIssue/createValidationFlow.ts`

Example selection:

- `getEqualAmountsOfPositiveAndNegativeExamples`:
  - negatives: HITL spans assigned to issue
  - positives: HITL spans in same document excluding this issue
  - balance to equal counts (min side)
  - cap by `MAX_COMPARISON_ANNOTATIONS` on negative pull

Flow structure:

- parent: `validateGeneratedEvaluationJob` (`generateEvaluationsQueue`)
- children: many `runEvaluationV2Job` dry runs (`evaluationsQueue`)
- child option `continueParentOnFailure: true`

## 6) Child dry runs

Job:

- `packages/core/src/jobs/job-definitions/evaluations/runEvaluationV2Job.ts`

Service call:

- `runEvaluationV2` with `dry: true`

Dry behavior:

- does full evaluation logic
- does **not** persist result row
- returns compact result to parent (`hasPassed`, span IDs)

## 7) Parent validation decision

Parent job:

- `packages/core/src/jobs/job-definitions/evaluations/validateGeneratedEvaluationJob.ts`

Core evaluation:

- `evaluateConfiguration` -> `calculateMCC`

Confusion matrix convention used:

- TP: should-pass span and evaluation passed
- FN: should-pass span and evaluation failed
- FP: should-fail span and evaluation passed
- TN: should-fail span and evaluation failed

MCC scaled from `[-1, 1]` to `[0, 100]`.

Decision:

- if `mcc >= 70`:
  - update `alignmentMetricMetadata`
  - save config hash (`generateConfigurationHash`)
  - save cutoff dates
  - end active evaluation (emits `evaluationEnded`)

- if `mcc < 70`:
  - delete generated evaluation
  - compute false positives/negatives (`getFalsePositivesAndFalseNegatives`)
  - queue next generation attempt with:
    - FP/FN examples capped to 3 each
    - previous config
    - `generationAttempt + 1`

Terminal fail:

- if retries exhausted, fail + end active evaluation (emits failure and ended)

---

## Human alignment feedback loop after launch

### 1) Human annotation

- frontend action: `apps/web/src/actions/evaluationsV2/annotate.ts`
- backend service: `packages/core/src/services/evaluationsV2/annotate.ts`
- writes new or updates existing human result

### 2) Result events

- create path emits `evaluationResultV2Created`
- update path emits `evaluationResultV2Updated`

### 3) Assignment/unassignment to issues

Handlers:

- create event -> `assignIssueToEvaluationResultV2Job`
- update event -> `handleEvaluationResultV2Updated`

They call:

- `assignEvaluationResultV2ToIssue`
- `unassignEvaluationResultV2FromIssue`
- `validateResultForIssue`

This updates:

- `issue_evaluation_results`
- issue centroid
- issue histogram
- downstream issue jobs (details merge)

Result: new human annotations eventually become part of the positive/negative corpus used by alignment recalculation.

---

## Automatic recalculation flow (post-generation)

There are two triggers:

## A) Config change trigger

Path:

- `updateEvaluationV2` -> `maybeEnqueueAlignmentRecalculation` -> `enqueueAlignmentRecalculation`

Logic:

- only applies to LLM binary evaluations
- compares old/new configuration hash
- if changed:
  - sets `recalculatingAt` in `alignmentMetricMetadata`
  - emits immediate `evaluationV2AlignmentUpdated` websocket event
  - enqueues `updateEvaluationAlignmentJob` (`maintenanceQueue`)

## B) Daily trigger

Scheduler:

- `apps/workers/src/workers/schedule.ts`
- daily `dailyAlignmentMetricUpdateJob` at `0 0 1 * * *`

Daily job:

- scans linked LLM binary evaluations
- checks for unprocessed HITL spans (`hasUnprocessedSpans`)
- enqueues `updateEvaluationAlignmentJob` with `source: 'daily'`

## Recalculation job chain

`updateEvaluationAlignmentJob`:

- loads workspace/commit/evaluation/issue
- calls `recalculateAlignmentMetric`

`recalculateAlignmentMetric`:

- builds flow parent `recalculateAlignmentMetricJob` + dry-run children
- if hash unchanged, uses cutoff dates for incremental fetch
- if hash changed, full recompute from all available examples

Parent `recalculateAlignmentMetricJob`:

- aggregates child outputs through `evaluateConfiguration`
- if hash unchanged, adds new confusion counts to existing metadata
- updates cutoff dates
- clears `recalculatingAt`
- emits `evaluationV2AlignmentUpdated`

Failure path:

- on last retry, preserves old metadata as much as possible
- clears `recalculatingAt`
- emits updated alignment event so UI exits recalculating state

---

## Queue and worker topology

Queue definitions:

- `packages/core/src/jobs/queues/types.ts`
- `packages/core/src/jobs/queues/index.ts`

Relevant queues:

- `generateEvaluationsQueue`
- `evaluationsQueue`
- `maintenanceQueue`
- `eventsQueue`
- `eventHandlersQueue`
- `issuesQueue`

Workers:

- `generateEvaluationWorker` (concurrency 100): generation/validation/recalculation parents
- `evaluationsWorker` (concurrency 100): child `runEvaluationV2Job`
- `maintenanceWorker` (concurrency 5): daily + config-change wrappers
- `eventsWorker` and `eventHandlersWorker` (concurrency 100): event fan-out and websocket notifier handlers

---

## Event and websocket propagation

Publisher:

- `packages/core/src/events/publisher.ts`

Flow:

1. services/jobs call `publisher.publishLater(event)`.
2. `eventsQueue` runs `publishEventJob`.
3. `publishEventJob` enqueues each handler into `eventHandlersQueue`.
4. handlers (notably `notifyClientOfEvaluationStatus`, `notifyClientOfEvaluationV2AlignmentUpdated`) publish to Redis websocket channels via `WebsocketClient`.
5. frontend `useSockets` hooks consume and mutate SWR state.

---

## Frontend runtime state machine for issue evaluation panel

From `IssueDetailPanel/Evaluation/index.tsx`:

Decision order:

1. loading -> skeleton
2. evaluation linked and alignment metadata present -> `EvaluationWithIssue`
3. not enough annotations -> `InsufficientAnnotations`
4. ended with error -> `EvaluationGenerationError`
5. active generation or success finalizing -> `GeneratingEvaluation`
6. inactive issue -> render null
7. else -> `GenerateEvaluationButton`

Realtime updates:

- active generation status: `useActiveEvaluations` + websocket `evaluationStatus`
- alignment updates: `useAlignmentMetricUpdates` + websocket `evaluationV2AlignmentMetricUpdated`

---

## Full file inventory (by layer)

### Frontend (web app)

- `apps/web/src/app/(private)/projects/[projectId]/versions/[commitUuid]/issues/_components/IssueDetailPanel/Evaluation/index.tsx`
- `apps/web/src/app/(private)/projects/[projectId]/versions/[commitUuid]/issues/_components/IssueDetailPanel/Evaluation/_components/GenerateEvaluationButton.tsx`
- `apps/web/src/app/(private)/projects/[projectId]/versions/[commitUuid]/issues/_components/IssueDetailPanel/Evaluation/_components/GeneratingEvaluation.tsx`
- `apps/web/src/app/(private)/projects/[projectId]/versions/[commitUuid]/issues/_components/IssueDetailPanel/Evaluation/_components/EvaluationWithIssue.tsx`
- `apps/web/src/app/(private)/projects/[projectId]/versions/[commitUuid]/issues/_components/IssueDetailPanel/Evaluation/_components/InsufficientAnnotations.tsx`
- `apps/web/src/app/(private)/projects/[projectId]/versions/[commitUuid]/issues/_components/IssueDetailPanel/Evaluation/_components/EvaluationGenerationError.tsx`
- `apps/web/src/app/(private)/projects/[projectId]/versions/[commitUuid]/issues/_components/IssueDetailPanel/Evaluation/EvaluationModal/index.tsx`
- `apps/web/src/stores/evaluationsV2.ts`
- `apps/web/src/stores/activeEvaluations.ts`
- `apps/web/src/stores/issues/evaluations.ts`
- `apps/web/src/stores/issues/enoughAnnotationsForIssue.ts`
- `apps/web/src/hooks/useAlignmentMetricUpdates.ts`
- `apps/web/src/helpers/evaluation-generation/calculateMCC.ts`
- `apps/web/src/actions/evaluationsV2/generateFromIssue.ts`
- `apps/web/src/actions/evaluationsV2/update.ts`
- `apps/web/src/actions/evaluationsV2/annotate.ts`
- `apps/web/src/app/api/projects/[projectId]/active-evaluations/route.ts`
- `apps/web/src/app/api/projects/[projectId]/commits/[commitUuid]/issues/[issueId]/enoughAnnotations/route.ts`
- `apps/web/src/app/api/projects/[projectId]/commits/[commitUuid]/issues/evaluations/route.ts`
- `apps/web/src/app/api/evaluations/route.ts`
- `apps/web/src/services/routes/api.ts`

### Core services (generation/alignment)

- `packages/core/src/services/evaluationsV2/generateFromIssue/generateEvaluationFromIssue.ts`
- `packages/core/src/services/evaluationsV2/generateFromIssue/generateFromIssue.ts`
- `packages/core/src/services/evaluationsV2/generateFromIssue/createValidationFlow.ts`
- `packages/core/src/services/evaluationsV2/generateFromIssue/getEqualAmountsOfPositiveAndNegativeExamples.ts`
- `packages/core/src/services/evaluationsV2/generateFromIssue/evaluateConfiguration.ts`
- `packages/core/src/services/evaluationsV2/generateFromIssue/calculateMCC.ts`
- `packages/core/src/services/evaluationsV2/generateFromIssue/getFalseExamples.ts`
- `packages/core/src/services/evaluationsV2/generateFromIssue/recalculateAlignmentMetric.ts`
- `packages/core/src/services/evaluationsV2/generateConfigurationHash.ts`
- `packages/core/src/services/evaluationsV2/enqueueAlignmentRecalculation.ts`
- `packages/core/src/services/evaluationsV2/create.ts`
- `packages/core/src/services/evaluationsV2/update.ts`
- `packages/core/src/services/evaluationsV2/delete.ts`
- `packages/core/src/services/evaluationsV2/run.ts`
- `packages/core/src/services/evaluationsV2/annotate.ts`
- `packages/core/src/services/evaluationsV2/validate.ts`
- `packages/core/src/services/evaluationsV2/results/create.ts`
- `packages/core/src/services/evaluationsV2/results/update.ts`
- `packages/core/src/services/evaluationsV2/results/assign.ts`
- `packages/core/src/services/evaluationsV2/results/unassign.ts`
- `packages/core/src/services/evaluationsV2/results/reassignFromIssue.ts`
- `packages/core/src/services/evaluationsV2/specifications.ts`
- `packages/core/src/services/evaluationsV2/llm/index.ts`
- `packages/core/src/services/evaluationsV2/llm/binary.ts`
- `packages/core/src/services/evaluationsV2/human/index.ts`
- `packages/core/src/services/evaluationsV2/human/binary.ts`
- `packages/core/src/services/evaluationsV2/active/create.ts`
- `packages/core/src/services/evaluationsV2/active/update.ts`
- `packages/core/src/services/evaluationsV2/active/start.ts`
- `packages/core/src/services/evaluationsV2/active/fail.ts`
- `packages/core/src/services/evaluationsV2/active/end.ts`
- `packages/core/src/services/evaluationsV2/active/delete.ts`
- `packages/core/src/services/evaluationsV2/active/get.ts`
- `packages/core/src/services/evaluationsV2/active/listCached.ts`
- `packages/core/src/services/evaluationsV2/active/listActive.ts`

### Jobs and workers

- `packages/core/src/jobs/job-definitions/evaluations/generateEvaluationV2FromIssueJob.ts`
- `packages/core/src/jobs/job-definitions/evaluations/validateGeneratedEvaluationJob.ts`
- `packages/core/src/jobs/job-definitions/evaluations/recalculateAlignmentMetricJob.ts`
- `packages/core/src/jobs/job-definitions/evaluations/runEvaluationV2Job.ts`
- `packages/core/src/jobs/job-definitions/maintenance/updateEvaluationAlignmentJob.ts`
- `packages/core/src/jobs/job-definitions/maintenance/dailyAlignmentMetricUpdateJob.ts`
- `packages/core/src/jobs/queues/index.ts`
- `packages/core/src/jobs/queues/types.ts`
- `apps/workers/src/workers/worker-definitions/generateEvaluationWorker.ts`
- `apps/workers/src/workers/worker-definitions/evaluationsWorker.ts`
- `apps/workers/src/workers/worker-definitions/maintenanceWorker.ts`
- `apps/workers/src/workers/worker-definitions/eventsWorker.ts`
- `apps/workers/src/workers/schedule.ts`

### Queries and repositories

- `packages/core/src/queries/issues/getEvaluationResultsToGenerateEvaluation.ts`
- `packages/core/src/queries/issues/getHITLSpansByIssue.ts`
- `packages/core/src/queries/issues/getHITLSpansByDocument.ts`
- `packages/core/src/queries/issues/getSpanMessagesAndEvaluationResultsByIssue.ts`
- `packages/core/src/queries/issues/getSpanMessagesByIssueDocument.ts`
- `packages/core/src/queries/issues/hasUnprocessedSpans.ts`
- `packages/core/src/queries/issues/findById.ts`
- `packages/core/src/queries/issueEvaluationResults/findLastActiveAssignedIssue.ts`
- `packages/core/src/repositories/evaluationResultsV2Repository.ts`
- `packages/core/src/repositories/evaluationsV2Repository.ts`
- `packages/core/src/repositories/spansRepository.ts`
- `packages/core/src/services/spans/buildSpanMessagesWithReasons.ts`

### Issue-side services linked to this feature

- `packages/core/src/services/issues/shared.ts`
- `packages/core/src/services/issues/results/validate.ts`
- `packages/core/src/services/issues/results/add.ts`
- `packages/core/src/services/issues/results/remove.ts`
- `packages/core/src/services/issues/discover.ts`
- `packages/core/src/services/issueEvaluationResults/add.ts`
- `packages/core/src/services/issueEvaluationResults/remove.ts`
- `packages/core/src/services/issues/evaluations/ignoreIssueEvaluations.ts`
- `packages/core/src/services/issues/evaluations/unignoreIssueEvaluations.ts`
- `packages/core/src/services/issues/resolve.ts`
- `packages/core/src/services/issues/unresolve.ts`
- `packages/core/src/services/issues/ignore.ts`
- `packages/core/src/services/issues/unignore.ts`

### Events and websockets

- `packages/core/src/events/publisher.ts`
- `packages/core/src/events/events.d.ts`
- `packages/core/src/events/handlers/index.ts`
- `packages/core/src/events/handlers/notifyClientOfEvaluationStatus.ts`
- `packages/core/src/events/handlers/notifyClientOfEvaluationV2AlignmentUpdated.ts`
- `packages/core/src/events/handlers/assignIssueToEvaluationResultV2Job.ts`
- `packages/core/src/events/handlers/handleEvaluationResultV2Updated.ts`
- `packages/core/src/events/handlers/evaluateLiveLog.ts`
- `packages/core/src/jobs/job-definitions/events/publishEventJob.ts`
- `packages/core/src/jobs/job-definitions/events/createEventJob.ts`
- `packages/core/src/websockets/workers.ts`
- `packages/core/src/websockets/constants.ts`

### Constants and schema contracts

- `packages/constants/src/issues/evaluations.ts`
- `packages/constants/src/issues/constants.ts`
- `packages/constants/src/evaluations/index.ts`
- `packages/constants/src/evaluations/active.ts`
- `packages/constants/src/tracing/span.ts`
- `packages/core/src/schema/models/evaluationVersions.ts`
- `packages/core/src/schema/models/issues.ts`
- `packages/core/src/schema/models/issueEvaluationResults.ts`
- `packages/core/src/schema/models/issueHistograms.ts`

---

## Current failure modes and brittle points

1. **Threshold guard is UI-side only**
   - Backend action does not enforce 5/5 annotation minimum.
   - Direct action/API calls can still start generation with weak datasets.

2. **Copilot context is very small**
   - Prompt generation currently uses 3 issue examples and 3 non-issue examples.
   - Retry feedback examples are truncated to 3 FP + 3 FN.
   - This is often too little signal for robust criteria synthesis.

3. **Validation/recalc child-failure heuristic appears incorrect**
   - In both parent jobs, `tooManyFailedEvaluationRuns` uses:
     - `(failed + ignored + unprocessed) > (processed % 10)`
   - This modulo-based threshold is unstable and likely not what was intended.

4. **Dry-run error results can be treated as negative classifications**
   - If child returns an error value (not thrown), `hasPassed` may be undefined.
   - Aggregation treats falsy as failed, skewing confusion matrix.

5. **No post-generation auto-regeneration when alignment drifts down**
   - `MIN_ALIGNMENT_METRIC_THRESHOLD` is enforced only in initial validation job.
   - Daily/config-change recalculation updates metric but does not self-refine configuration.

6. **Attaching an existing evaluation to an issue does not trigger immediate alignment calc**
   - Config hash unchanged means no config-change recalculation enqueue.
   - Alignment often appears only after daily scheduler or later config edit.

7. **Daily recalculation query does not filter ignored/resolved issue-linked evaluations**
   - Daily scan selects by `issueId` + type/metric, not activity/ignored status.
   - Can spend resources on inactive workflows.

8. **`updateEvaluationAlignmentJob` does not unwrap/check recalculation result**
   - It awaits `recalculateAlignmentMetric(...)` but does not fail on `Result.error`.
   - Potential silent no-op path.

9. **Repository caveat acknowledged in code**
   - `EvaluationsV2Repository.getByIssue` has a FIXME about returning versions across commits.
   - Can affect issue-evaluation lifecycle operations.

10. **Issue ignore/unignore can override previous `evaluateLiveLogs` intent**
    - `unignoreIssueEvaluations` sets `evaluateLiveLogs: true` for all linked live-capable evals.
    - Previous manual off setting is not preserved.

11. **Frontend state fragility**
    - `EvaluationGenerationError` depends on matching exact error message text (`Max attempts`).
    - `useAlignmentMetricUpdates` initializes from props but does not reset state when evaluation UUID changes.
    - `setIssueForNewEvaluation` triggers two updates without awaiting order.

12. **Defined but unused lifecycle event**
    - `evaluationProgress` exists in event contracts and handler map but is not published in this flow.

---

## Over-engineering hotspots

- Copilot generation + dry-run flow + parent aggregation + retry queue + active cache + events + websocket + daily scheduler creates many moving parts for one UX action.
- Similar logic duplicated between initial validation and recalculation parents.
- Multiple places encode business invariants (frontend, action, services, jobs, repositories), increasing drift risk.
- Heavy async fan-out (potentially up to 200 dry child runs) for each generation attempt.

---

## What to preserve vs replace for GEPA revamp

Keep (useful infrastructure):

- issue/result association model (`issue_evaluation_results`)
- human annotation ingestion path
- websocket event transport pattern
- alignment metadata storage shape (can be extended)

Replace/simplify first:

- config generation strategy (low-context Copilot prompting)
- validation/retry policy and failure heuristics
- drift handling (add policy-driven auto-refine, not only re-score)
- duplicated parent-job logic
- UI/backend mismatch on generation eligibility checks

Recommended immediate guardrails before full GEPA integration:

- enforce minimum annotation thresholds server-side in generation action/service
- fix child-failure tolerance formula
- make `updateEvaluationAlignmentJob` fail loudly on `Result.error`
- add explicit handling for dry child error values in MCC aggregation
- trigger alignment calculation immediately when linking issue to an existing evaluation

---

## Existing test coverage (useful anchors)

Service tests:

- generation/retry/flow creation and MCC helpers under:
  - `packages/core/src/services/evaluationsV2/generateFromIssue/*.test.ts`

Job tests:

- generation parent, validation parent, recalculation parent, dry child runner under:
  - `packages/core/src/jobs/job-definitions/evaluations/*.test.ts`

These are good reference points for preserving behavior while swapping internals.

---

## Bottom line

The current implementation is functional but brittle: many asynchronous layers, weak generation context, strict success threshold in the initial stage only, and several subtle edge-case hazards in aggregation and orchestration.

For a GEPA-based revamp, this map identifies:

- what currently constitutes "alignment"
- where feedback enters
- where retries happen
- where drift is measured but not corrected
- which modules can be safely replaced with lower-coupling orchestration

