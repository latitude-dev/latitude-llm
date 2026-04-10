# Phase 13 - Live Monitoring And Evaluation Execution

> **Source phase**: `specs/reliability.md` `(LAT-470)`
> **Documentation**: `docs/reliability.md`, `docs/evaluations.md`, `docs/spans.md`, `docs/scores.md`, `docs/annotation-queues.md`

This tracker covers **Phase 13** from `specs/reliability.md`.

This file is a living implementation tracker for the live-monitoring phase. It should hold fixed context, locked decisions, and the concrete chained PR plan. Any unresolved implementation concern must belong to a specific PR rather than living as a free-floating note.

## Goal

Make issue-linked evaluations execute on live traffic after trace completion and persist their outputs through the canonical score model, with the right issue linkage, analytics save timing, and runtime seams for the later portable evaluator.

## Exit Gate

- issue monitors run on live traffic
- `SpanIngested -> live-traces:end -> TraceEnded -> live-evaluations:enqueue -> live-evaluations:execute` works end to end
- evaluation-generated scores are written through the canonical Postgres-first score path
- passed and errored monitor scores sync to ClickHouse immediately after commit
- failed non-errored issue-linked monitor scores get `issue_id` at write time and also sync immediately
- runtime wiring keeps the persisted evaluation artifact compatible with the later portable runtime

## Scope

- this is backend domain and worker execution work, not a dedicated UI phase
- this phase reuses the existing evaluation, score, queue, and hosted AI rails rather than introducing parallel storage or runtime systems
- schema or repository additions are allowed only when they are narrow support for trigger evaluation, canonical-state checks, or idempotency
- the final phase behavior must match `specs/reliability.md`, while this file carries the implementation plan and sequencing

## Current Repository Baseline

### Already Implemented

- `packages/domain/spans/src/use-cases/process-ingested-spans.ts` already publishes `SpanIngested` after durable span writes
- `apps/workers/src/workers/domain-events.ts` already routes:
  - `SpanIngested -> live-traces:end`
  - `TraceEnded -> live-evaluations:enqueue`
  - `TraceEnded -> live-annotation-queues:curate`
  - `TraceEnded -> system-annotation-queues:fanOut`
- `packages/domain/queue/src/topic-registry.ts` already defines `live-traces:end`, `live-evaluations:enqueue`, and `live-evaluations:execute`
- `packages/platform/queue-bullmq/src/adapter.ts` already supports logical `dedupeKey` plus `debounceMs`

### Evaluation Runtime And Persistence

- `packages/domain/evaluations/src/entities/evaluation.ts` already defines `trigger`, `alignment`, lifecycle timestamps, and helpers like `isActiveEvaluation()` and `isPausedEvaluation()`
- `packages/domain/evaluations/src/alignment-execution.ts` already exposes `executeEvaluationScript()` for the MVP extract-and-call execution bridge
- `packages/domain/evaluations/src/baseline-generation.ts` already fixes the MVP hosted model to Latitude-managed OpenAI `gpt-5.4`
- `packages/platform/ai-vercel/src/ai.ts` already provides the hosted Vercel AI SDK adapter through `AIGenerateLive`
- `packages/domain/scores/src/use-cases/write-score.ts` already performs canonical Postgres-first writes and immediate analytics sync for immutable scores
- `packages/domain/scores/src/helpers.ts` already defines score immutability as:
  - non-draft passed
  - non-draft errored
  - non-draft with non-null `issueId`
- `packages/platform/db-clickhouse/src/repositories/trace-repository.ts` already implements the shared `FilterSet` semantics through the shared trace field registry
- `packages/platform/db-clickhouse/src/registries/trace-fields.ts` already defines the field registry live evaluation triggers are expected to reuse
- `packages/domain/spans/src/entities/trace.ts` already provides `TraceDetail.allMessages`, which is the current best MVP conversation input for execution

### Not Yet Implemented

- `apps/workers/src/workers/live-traces.ts` is still a stub and does not publish `TraceEnded`
- `apps/workers/src/workers/live-evaluations.ts` is still a stub and does not implement `enqueue` or `execute`
- `apps/workers/src/workers/live-annotation-queues.ts` is still a stub, which matters for rollout once `TraceEnded` becomes real

## Locked Decisions

- the implementation ships in **4 chained PRs**
- **PR 4** is the activation PR and must merge last
- `filter` reuses the shared trace filter semantics and field registry; do not invent a reliability-only matcher
- deterministic sampling is keyed by `(organizationId, projectId, evaluationId, traceId)`
- turn scope is `sessionId` when the trace has one, otherwise `traceId`
- `first` runs only when no prior canonical evaluation score exists for that `(evaluationId, scope)` pair; it is based on persisted score history, not raw trace history
- `every` runs for every eligible ended trace in that scope
- `last` publishes a debounced `live-evaluations:execute` task keyed by `(organizationId, projectId, evaluationId, sessionId || traceId)` so only the latest eligible trace in that scope executes after inactivity
- `trigger.debounce` applies after turn selection at `live-evaluations:execute` publication time, not at the project-wide evaluation scan
- when `turn = every` and `trigger.debounce > 0`, eligible traces are coalesced by the same scope key and the latest eligible trace wins after the debounce window
- when `turn = first`, `trigger.debounce` only delays that single first eligible execution and does not widen the scope
- MVP execution input is `TraceDetail.allMessages`, matching the current alignment path
- live evaluation results are canonical scores written through `writeScoreUseCase`
- duplicate monitor results for the same `(evaluationId, traceId)` are not allowed; this phase uses queue dedupe plus canonical-state rechecks before execution rather than inventing a second result store
- trace-filter matching remains owned by `TraceRepository` through a narrow repository method; domain helpers must not re-implement filter semantics
- issue-linked monitor failures receive direct `issue_id` assignment at write time so they become immutable immediately
- AI execution uses `@platform/ai-vercel` with Latitude-managed provider/model/API-key resolution
- the live executor is exposed as a domain use case that depends on the existing `AI` service and the current MVP bridge; worker code must not embed provider-specific execution logic
- ClickHouse analytics sync continues through `syncScoreAnalyticsUseCase` after the owning Postgres transaction commits
- once `live-traces:end` starts publishing real `TraceEnded` events, the existing `TraceEnded` fan-out will also wake `live-evaluations:enqueue`, `live-annotation-queues:curate`, and `system-annotation-queues:fanOut`; PR 4 owns the rollout behavior for those sibling consumers

## Start Here

Implementation starts with **PR 1**.

PR 1 is the semantic foundation for the rest of the phase: it locks the trigger rules, the idempotency model, and the execution seam so PR 2, PR 3, and PR 4 can implement workers without guessing.

## Implementation Plan

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### PR 1 - Live Evaluation Semantics, Contracts, And Idempotency

**Intent**: settle the semantics and create the reusable boundaries so later worker PRs do not guess.

**Responsibilities**:

- own the trigger-semantics decisions for `filter`, `sampling`, `first`, `every`, `last`, and execute-task debounce
- define the narrow canonical-state reads needed for `first` decisions and duplicate-result prevention
- define the live execution input/output contract and the domain seam that wraps the current MVP hosted evaluator
- add the shared helper tests that later worker PRs depend on

**To-Do**:

- [x] **P13-PR1-1**: Introduce shared live-trigger helpers for lifecycle gating, deterministic sampling keyed by `(organizationId, projectId, evaluationId, traceId)`, turn scope derivation, and execute-task dedupe/debounce key construction
- [x] **P13-PR1-2**: Extend `TraceRepository` with a narrow `matchesFiltersByTraceId`-style contract so live trigger matching reuses the exact existing trace filter semantics instead of re-implementing them in domain or worker code
- [x] **P13-PR1-3**: Extend `ScoreRepository` with narrow canonical-state existence checks for:
  - prior evaluation score in one `(evaluationId, scope)` pair, used by `first`
  - existing evaluation score for one `(evaluationId, traceId)` pair, used by duplicate-result prevention
- [x] **P13-PR1-4**: Introduce the domain live evaluation execution use case in `@domain/evaluations`, wrapping the current MVP `executeEvaluationScript()` bridge through the existing `AI` service instead of embedding provider-specific logic in workers
- [x] **P13-PR1-5**: Define the canonical live execution input/output shapes, including issue context, conversation input, result payload, duration, tokens, and cost
- [ ] **P13-PR1-6**: Add unit tests for helper semantics, idempotency expectations, filter-match delegation, and execution shape validation

**Exit gate**:

- live-monitoring semantics are encoded in reusable helpers and contracts
- MVP executor seam is explicit through a domain use case
- canonical-state checks for `first` and duplicate-result prevention are defined
- trace-filter matching stays delegated to the trace repository
- no worker has been activated yet

### PR 2 - `live-evaluations:enqueue`

**Intent**: implement selection and task publication while keeping the upstream trace-end signal dormant.

**Responsibilities**:

- own the project-scoped evaluation scan for one ended trace
- apply trigger evaluation in the required order: `filter`, then `sampling`, then `turn` / `debounce`
- publish the correct `live-evaluations:execute` tasks and no others
- add the enqueue-path logs and worker-level tests
- **P13-PR2-1**: Replace the `enqueue` stub in `apps/workers/src/workers/live-evaluations.ts`
- **P13-PR2-2**: Load the ended trace detail needed for trigger checks
- **P13-PR2-3**: List active evaluations project-wide and skip archived or deleted rows
- **P13-PR2-4**: Treat `sampling = 0` as paused and skip those evaluations
- **P13-PR2-5**: Apply trigger evaluation order exactly as specified: `filter`, then `sampling`, then `turn` / `debounce`
- **P13-PR2-6**: Publish `live-evaluations:execute` once per matching `(evaluationId, traceId)` pair, including dedupe/debounce where required
- **P13-PR2-7**: Add structured enqueue-path logging for active evaluations scanned, filter matches, sampling skips, turn/debounce skips, and execute tasks published
- **P13-PR2-8**: Add worker-level tests for matching, skipping, deterministic sampling, turn semantics, and execute publication

**Exit gate**:

- `live-evaluations:enqueue` is fully implemented and tested
- no real `TraceEnded` events are emitted yet

### PR 3 - `live-evaluations:execute`

**Intent**: execute one live evaluation and persist one canonical score.

**Responsibilities**:

- own one live evaluation run from loaded evaluation and trace context through canonical score persistence
- wire the hosted AI adapter without breaking the domain execution seam from PR 1
- enforce duplicate-result prevention for `(evaluationId, traceId)`
- own execution logging, AI telemetry, and result-persistence tests
- **P13-PR3-1**: Replace the `execute` stub in `apps/workers/src/workers/live-evaluations.ts`
- **P13-PR3-2**: Wire hosted execution through `withAi(AIGenerateLive, ...)` while preserving the domain executor seam
- **P13-PR3-3**: Load the evaluation, trace detail, and issue context needed for one live run
- **P13-PR3-4**: Convert `TraceDetail.allMessages` into the MVP conversation input used by the hosted evaluator
- **P13-PR3-5**: Recheck canonical state before execution so retries or duplicate tasks cannot create a second result for the same `(evaluationId, traceId)`
- **P13-PR3-6**: Persist results through `writeScoreUseCase` with:
  - `source = "evaluation"`
  - `sourceId = evaluation.id`
  - `metadata.evaluationHash = evaluation.alignment.evaluationHash`
- **P13-PR3-7**: Implement direct `issue_id` assignment at write time for issue-linked monitor failures
- **P13-PR3-8**: Preserve correct `error -> errored` semantics plus persisted duration, token, and cost accounting
- **P13-PR3-9**: Add structured execute-path logging for evaluation id, trace id, session id when present, result kind, score id, issue assignment path, tokens, cost, and duration
- **P13-PR3-10**: Attach AI telemetry with a stable span name such as `evaluation.live.execute` and attributes including `evaluationId`, `projectId`, and `traceId`
- **P13-PR3-11**: Add tests for passed, failed, and errored monitor results plus analytics save timing

**Exit gate**:

- `live-evaluations:execute` writes canonical scores correctly
- issue-linked failures become immutable immediately
- duplicate `(evaluationId, traceId)` results are prevented by canonical-state rechecks
- no upstream activation has happened yet

### PR 4 - `live-traces:end` Activation And End-To-End Coverage

**Intent**: turn on the real trace completion signal and prove the whole pipeline end to end.

**Responsibilities**:

- activate `TraceEnded` publication from the debounced `live-traces:end` worker
- own the rollout behavior for the sibling `TraceEnded` consumers that wake up at the same time
- add end-to-end coverage for the live-monitoring pipeline
- reconcile docs with the final Phase 13 behavior
- **P13-PR4-1**: Replace the `live-traces:end` stub in `apps/workers/src/workers/live-traces.ts`
- **P13-PR4-2**: Publish `TraceEnded` through `createEventsPublisher(queuePublisher)` when the debounce window elapses
- **P13-PR4-3**: Confirm constructor and bootstrap wiring still compose cleanly in `apps/workers/src/server.ts`
- **P13-PR4-4**: Decide and implement the rollout behavior for sibling `TraceEnded` consumers, especially `live-annotation-queues:curate`, so Phase 13 does not accidentally ship partial unrelated behavior
- **P13-PR4-5**: Add end-to-end tests for:
  - debounce reset behavior
  - `TraceEnded -> enqueue`
  - downstream execute behavior
  - turn selection
  - pause/archive/delete behavior
  - direct issue assignment
  - analytics save timing
  - persisted duration, token, and cost accounting
- **P13-PR4-6**: Reconcile docs drift around issue-linked monitor failures versus direct write-time issue assignment
- **P13-PR4-7**: Mark this tracker with the final rollout behavior, final trigger semantics, and final docs updated once activation lands

**Exit gate**:

- the live-monitoring pipeline is active end to end
- rollout behavior is explicit and safe
- documentation matches the intended Phase 13 behavior

## Relevant Surfaces

- `specs/reliability.md`
- `docs/reliability.md`
- `docs/evaluations.md`
- `docs/spans.md`
- `docs/scores.md`
- `packages/domain/events/src/index.ts`
- `packages/domain/queue/src/topic-registry.ts`
- `packages/domain/evaluations/src/entities/evaluation.ts`
- `packages/domain/evaluations/src/alignment-execution.ts`
- `packages/domain/evaluations/src/baseline-generation.ts`
- `packages/domain/scores/src/entities/score.ts`
- `packages/domain/scores/src/use-cases/write-score.ts`
- `packages/domain/scores/src/use-cases/save-score-analytics.ts`
- `packages/domain/spans/src/use-cases/process-ingested-spans.ts`
- `packages/platform/ai-vercel/src/ai.ts`
- `packages/platform/db-clickhouse/src/repositories/trace-repository.ts`
- `packages/platform/db-clickhouse/src/registries/trace-fields.ts`
- `apps/workers/src/workers/domain-events.ts`
- `apps/workers/src/workers/live-traces.ts`
- `apps/workers/src/workers/live-evaluations.ts`
- `apps/workers/src/workers/domain-events.test.ts`
- `apps/workers/src/workers/span-ingestion.test.ts`
- `apps/workers/src/workers/live-traces*.test.ts`
- `apps/workers/src/workers/live-evaluations*.test.ts`
- `packages/domain/evaluations/src/*.test.ts`
- `packages/domain/scores/src/*.test.ts`

