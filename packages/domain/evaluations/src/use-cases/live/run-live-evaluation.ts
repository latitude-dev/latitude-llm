import type { AI, AIError } from "@domain/ai"
import {
  AIMeteringRecordError,
  authorizeBillableAction,
  type BillingOverrideRepository,
  type BillingSpendReservation,
  type BillingUsageEventRepository,
  type BillingUsagePeriodRepository,
  buildBillingIdempotencyKey,
  makeAIMeteringScope,
  provideAIMeteringScope,
  recordBillableActionUseCase,
  type StripeSubscriptionLookup,
  type UnknownStripePlanError,
} from "@domain/billing"
import { OutboxEventWriter } from "@domain/events"
import { type QueuePublishError, QueuePublisher } from "@domain/queue"
import {
  DETECTOR_HEALTH_WINDOW_SECONDS,
  DetectorHealthTracker,
  detectScriptCapabilities,
  hasEmbeddingCapability,
  hasLlmCapability,
  type ScriptRuntime,
} from "@domain/sandbox"
import {
  type EvaluationScore,
  type ScoreAnalyticsRepository,
  ScoreRepository,
  type WriteScoreError,
  writeScoreUseCase,
} from "@domain/scores"
import {
  EvaluationId,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  type SettingsReader,
  SignalId,
  SqlClient,
  TraceId,
} from "@domain/shared"
import {
  type MessageEmbeddingRepository,
  type SessionRepository,
  type SpanRepository,
  type TraceDetail,
  TraceRepository,
  type TraceSearchRepository,
} from "@domain/spans"
import { Cause, Effect, Exit } from "effect"
import type { Evaluation } from "../../entities/evaluation.ts"
import { getLiveEvaluationEligibility } from "../../helpers.ts"
import { EvaluationRepository } from "../../ports/evaluation-repository.ts"
import { EvaluationSignalRepository } from "../../ports/evaluation-signal-repository.ts"
import { buildEvaluationJudgeLiveTelemetryCapture } from "../../runtime/ai-telemetry.ts"
import { hasSessionEmbeddings } from "../../runtime/has-session-embeddings.ts"
import { loadScriptSessionContext } from "../../runtime/load-session-context.ts"
import {
  executeLiveEvaluationUseCase,
  type LiveEvaluationExecutionResult,
  type LiveEvaluationSignalContext,
} from "./execute-live-evaluation.ts"

/**
 * Readiness gate for scripts that call `semanticSimilarity()`: `trace-search` (which writes
 * `message_embeddings`) runs after the eval first fires, so embeddings usually aren't indexed yet.
 * Defer with a bounded delayed re-publish; once attempts are exhausted, skip WITHOUT persisting a
 * score — a persisted 0 would block every future retry via `findByEvaluationIdAndTraceId`. The
 * primary recovery is `trace-search` re-triggering `signals:match` once embeddings land; this timed
 * backstop covers a lost re-trigger.
 */
const MAX_EMBEDDING_WAIT_ATTEMPTS = 3
const EMBEDDING_WAIT_DELAY_MS = 120_000

export interface RunLiveEvaluationInput {
  readonly organizationId: string
  readonly projectId: string
  readonly evaluationId: string
  readonly traceId: string
  /** Re-publish counter set by the embedding-readiness gate; absent on the initial publish. */
  readonly embeddingWaitAttempt?: number
}

export interface RunLiveEvaluationPersistedSummary {
  readonly evaluationId: string
  readonly signalId: string
  readonly traceId: string
  readonly sessionId: string | null
  readonly scoreId: string
}

export interface RunLiveEvaluationPersistedContext {
  readonly evaluation: Evaluation
  readonly traceDetail: TraceDetail
  readonly issue: LiveEvaluationSignalContext
  readonly execution: RunLiveEvaluationPersistedExecution
  readonly score: EvaluationScore
}

export type RunLiveEvaluationCompletedExecution = {
  readonly kind: "completed"
} & LiveEvaluationExecutionResult

export interface RunLiveEvaluationErroredExecution {
  readonly kind: "errored"
  readonly error: string
  readonly duration: number
  readonly tokens: number
  readonly cost: number
}

export type RunLiveEvaluationPersistedExecution =
  | RunLiveEvaluationCompletedExecution
  | RunLiveEvaluationErroredExecution

export type RunLiveEvaluationExecutedSummary = RunLiveEvaluationPersistedSummary
export type RunLiveEvaluationExecutedContext = RunLiveEvaluationPersistedContext
export type RunLiveEvaluationLoadedSummary = RunLiveEvaluationPersistedSummary
export type RunLiveEvaluationLoadedContext = RunLiveEvaluationPersistedContext

export type RunLiveEvaluationResult =
  | {
      readonly action: "skipped"
      readonly reason:
        | "evaluation-not-found"
        | "issue-not-found"
        | "trace-not-found"
        | "deleted"
        | "archived"
        | "paused"
        | "result-already-exists"
        | "billing-blocked"
        | "awaiting-embeddings"
        | "embeddings-unavailable"
        | "signal-ignored"
      readonly evaluationId: string
      readonly traceId: string
    }
  | {
      readonly action: "persisted"
      readonly summary: RunLiveEvaluationPersistedSummary
      readonly context: RunLiveEvaluationPersistedContext
    }

export type RunLiveEvaluationError =
  | RepositoryError
  | WriteScoreError
  | UnknownStripePlanError
  | QueuePublishError
  | AIError

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null
const isRepositoryError = (error: unknown): error is RepositoryError =>
  isRecord(error) && error._tag === "RepositoryError" && "cause" in error
const isUniqueViolationCause = (cause: unknown): boolean => {
  if (!isRecord(cause)) return false
  if (cause.code === "23505") return true
  return "cause" in cause && isUniqueViolationCause(cause.cause)
}

const toElapsedNanoseconds = (startedAtMs: number) =>
  Math.max(0, Math.round((performance.now() - startedAtMs) * 1_000_000))
const toErroredExecution = (message: string, startedAtMs: number): RunLiveEvaluationErroredExecution => ({
  kind: "errored",
  error: message,
  duration: toElapsedNanoseconds(startedAtMs),
  tokens: 0,
  cost: 0,
})
// The claim is a conditional UPDATE (resolved, not ignored, resolved before the
// occurrence), so re-running it on dedupe paths is safe: a retry that died
// between the score commit and this transaction still converges, and the loser
// of a claim race emits nothing.
const claimRegressionForPersistedScore = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly score: Pick<EvaluationScore, "id" | "signalId" | "createdAt">
}) =>
  Effect.gen(function* () {
    const signalId = input.score.signalId
    if (signalId === null) return
    const signalRepository = yield* EvaluationSignalRepository
    const sqlClient = yield* SqlClient
    const reopenedAt = new Date()
    yield* sqlClient.transaction(
      Effect.gen(function* () {
        const reopened = yield* signalRepository.claimReopenOnOccurrence({
          signalId: SignalId(signalId),
          occurredAt: input.score.createdAt,
          now: reopenedAt,
        })
        if (!reopened) return

        const outboxEventWriter = yield* OutboxEventWriter
        yield* outboxEventWriter.write({
          eventName: "SignalRegressed",
          aggregateType: "issue",
          aggregateId: signalId,
          organizationId: input.organizationId,
          payload: {
            organizationId: input.organizationId,
            projectId: input.projectId,
            signalId,
            regressedAt: reopenedAt.toISOString(),
            triggerScoreId: input.score.id,
          },
        })
      }),
    )
  })

export const runLiveEvaluationUseCase = (input: RunLiveEvaluationInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("evaluation.id", input.evaluationId)
    yield* Effect.annotateCurrentSpan("evaluation.organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("evaluation.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("evaluation.traceId", input.traceId)

    const evaluationRepository = yield* EvaluationRepository
    const scoreRepository = yield* ScoreRepository
    const projectId = ProjectId(input.projectId)
    const evaluation = yield* evaluationRepository
      .findById(EvaluationId(input.evaluationId))
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (
      evaluation === null ||
      evaluation.organizationId !== input.organizationId ||
      evaluation.projectId !== projectId
    ) {
      return {
        action: "skipped",
        reason: "evaluation-not-found",
        evaluationId: input.evaluationId,
        traceId: input.traceId,
      } satisfies RunLiveEvaluationResult
    }

    const liveEvaluationEligibility = getLiveEvaluationEligibility(evaluation)
    const scriptCapabilities = detectScriptCapabilities(evaluation.script)

    if (!liveEvaluationEligibility.eligible) {
      return {
        action: "skipped",
        reason: liveEvaluationEligibility.reason,
        evaluationId: input.evaluationId,
        traceId: input.traceId,
      } satisfies RunLiveEvaluationResult
    }

    const existingScore = yield* scoreRepository.findByEvaluationIdAndTraceId({
      projectId,
      evaluationId: evaluation.id,
      traceId: TraceId(input.traceId),
    })

    if (existingScore !== null) {
      // A prior attempt may have died between persisting this score and
      // claiming the regression reopen; re-claim so retries converge.
      yield* claimRegressionForPersistedScore({
        organizationId: input.organizationId,
        projectId: input.projectId,
        score: existingScore,
      })
      return {
        action: "skipped",
        reason: "result-already-exists",
        evaluationId: input.evaluationId,
        traceId: input.traceId,
      } satisfies RunLiveEvaluationResult
    }

    const traceRepository = yield* TraceRepository
    const traceDetail = yield* traceRepository
      .findByTraceId({
        organizationId: OrganizationId(input.organizationId),
        projectId,
        traceId: TraceId(input.traceId),
      })
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (traceDetail === null) {
      return {
        action: "skipped",
        reason: "trace-not-found",
        evaluationId: input.evaluationId,
        traceId: input.traceId,
      } satisfies RunLiveEvaluationResult
    }

    const signalRepository = yield* EvaluationSignalRepository
    const issue = yield* signalRepository
      .findById(SignalId(evaluation.signalId))
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (issue === null || issue.projectId !== input.projectId) {
      return {
        action: "skipped",
        reason: "issue-not-found",
        evaluationId: input.evaluationId,
        traceId: input.traceId,
      } satisfies RunLiveEvaluationResult
    }

    // An ignored signal short-circuits ahead of the embedding-readiness gate, so it
    // returns signal-ignored at once instead of being requeued to wait for embeddings.
    if (issue.ignoredAt !== null) {
      return {
        action: "skipped",
        reason: "signal-ignored",
        evaluationId: input.evaluationId,
        traceId: input.traceId,
      } satisfies RunLiveEvaluationResult
    }

    // Readiness gate — only for scripts that call semanticSimilarity(), before any billing or execution
    // work. We check the triggering trace: it's the one whose embeddings race this run, and older traces
    // in the session were embedded on their own ingest cycles.
    if (hasEmbeddingCapability(scriptCapabilities)) {
      const embeddingsReady = yield* hasSessionEmbeddings({
        organizationId: OrganizationId(input.organizationId),
        projectId,
        traceIds: [input.traceId],
      }).pipe(
        // A malformed embedding config surfaces through execution's AIError handling, not the gate.
        Effect.catchTag("AIError", () => Effect.succeed(true)),
      )
      if (!embeddingsReady) {
        const attempt = input.embeddingWaitAttempt ?? 0
        if (attempt >= MAX_EMBEDDING_WAIT_ATTEMPTS) {
          yield* Effect.annotateCurrentSpan("evaluation.embeddingsUnavailable", true)
          return {
            action: "skipped",
            reason: "embeddings-unavailable",
            evaluationId: input.evaluationId,
            traceId: input.traceId,
          } satisfies RunLiveEvaluationResult
        }
        const nextAttempt = attempt + 1
        const publisher = yield* QueuePublisher
        yield* publisher.publish(
          "live-evaluations",
          "execute",
          {
            organizationId: input.organizationId,
            projectId: input.projectId,
            evaluationId: input.evaluationId,
            traceId: input.traceId,
            embeddingWaitAttempt: nextAttempt,
          },
          {
            dedupeKey: `org:${input.organizationId}:live-eval-embedding-wait:${input.evaluationId}:${input.traceId}:${nextAttempt}`,
            debounceMs: EMBEDDING_WAIT_DELAY_MS,
          },
        )
        return {
          action: "skipped",
          reason: "awaiting-embeddings",
          evaluationId: input.evaluationId,
          traceId: input.traceId,
        } satisfies RunLiveEvaluationResult
      }
    }

    const signalContext = {
      name: issue.name,
      description: issue.description,
    } satisfies LiveEvaluationSignalContext

    const billingOrganizationId = OrganizationId(input.organizationId)
    // Every scan bills a baseline 1-credit `eval-scan`; LLM-capable scripts
    // additionally bill each generation (and query embed) at cost through the
    // metering scope. Authorization uses the larger estimate for LLM scripts so
    // the free-cap/spend-cap gate reflects the expensive path.
    const authorizeAction = hasLlmCapability(scriptCapabilities) ? ("llm-call" as const) : ("eval-scan" as const)
    const authorization = yield* authorizeBillableAction({
      organizationId: billingOrganizationId,
      action: authorizeAction,
      skipIfBlocked: true,
      idempotencyKey: buildBillingIdempotencyKey(authorizeAction, [
        input.organizationId,
        "live-eval",
        evaluation.id,
        input.traceId,
        "authorize",
      ]),
    })

    if (!authorization.allowed) {
      return {
        action: "skipped",
        reason: "billing-blocked",
        evaluationId: input.evaluationId,
        traceId: input.traceId,
      } satisfies RunLiveEvaluationResult
    }

    const session = yield* loadScriptSessionContext({
      organizationId: OrganizationId(input.organizationId),
      projectId,
      traceDetail,
    })

    // Per-primitive metering: every LLM call and query-time embedding the script
    // produces is recorded through this scope by the AI layer, in call order, so a
    // retried job replays the same idempotency keys instead of double-charging.
    const meteringScope = yield* makeAIMeteringScope({
      organizationId: billingOrganizationId,
      projectId: ProjectId(input.projectId),
      keyParts: ["live-eval", evaluation.id, input.traceId],
      context: authorization.context,
      traceId: TraceId(input.traceId),
    })

    const executionStartedAt = performance.now()
    const execution = yield* executeLiveEvaluationUseCase({
      organizationId: input.organizationId,
      projectId: input.projectId,
      evaluationId: evaluation.id,
      script: evaluation.script,
      session,
      telemetry: buildEvaluationJudgeLiveTelemetryCapture({
        organizationId: input.organizationId,
        projectId: input.projectId,
        evaluationId: evaluation.id,
        signalId: String(evaluation.signalId),
        traceId: input.traceId,
      }),
    }).pipe(
      provideAIMeteringScope(meteringScope),
      Effect.map(
        (result) =>
          ({
            kind: "completed",
            ...result,
          }) satisfies RunLiveEvaluationCompletedExecution,
      ),
      Effect.catchTags({
        // A metering-record failure is a billing persistence problem, not a judge
        // failure: re-fail so the worker retries (idempotency keys dedupe the replay)
        // instead of persisting a false errored score and losing the usage event.
        AIError: (error) =>
          error.cause instanceof AIMeteringRecordError
            ? Effect.fail(error)
            : Effect.succeed(toErroredExecution(error.message, executionStartedAt)),
        AICredentialError: (error) => Effect.succeed(toErroredExecution(error.message, executionStartedAt)),
        LiveEvaluationExecutionError: (error) => Effect.succeed(toErroredExecution(error.message, executionStartedAt)),
      }),
    )

    // The baseline scan credit is recorded AFTER the work has been attempted so a
    // crash between authorization and execution does not charge the customer for
    // work that never ran. Both completed and errored executions are recorded —
    // work was attempted — but not skips that returned earlier. AI calls the
    // script made were already billed on top through the metering scope.
    yield* recordBillableActionUseCase({
      organizationId: billingOrganizationId,
      projectId: ProjectId(input.projectId),
      action: "eval-scan",
      idempotencyKey: buildBillingIdempotencyKey("eval-scan", [input.organizationId, evaluation.id, input.traceId]),
      context: authorization.context,
      traceId: TraceId(input.traceId),
      metadata: {
        evaluationId: evaluation.id,
        traceId: input.traceId,
      },
    })

    // A failed run is a silent false negative, so runs/errors are counted per
    // owner as detector health. Accounting is best-effort: a cache hiccup
    // must never replace the run's own outcome.
    const detectorHealthTracker = yield* DetectorHealthTracker
    const detectorHealth = yield* detectorHealthTracker
      .recordRun({
        organizationId: billingOrganizationId,
        projectId,
        ownerType: "evaluation",
        ownerId: evaluation.id,
        errored: execution.kind === "errored",
      })
      .pipe(Effect.catch(() => Effect.succeed(null)))

    if (detectorHealth?.newlyDegraded) {
      const outboxEventWriter = yield* OutboxEventWriter
      yield* outboxEventWriter
        .write({
          eventName: "EvaluationDetectorDegraded",
          aggregateType: "evaluation",
          aggregateId: evaluation.id,
          organizationId: input.organizationId,
          payload: {
            organizationId: input.organizationId,
            projectId: input.projectId,
            evaluationId: evaluation.id,
            runs: detectorHealth.runs,
            errors: detectorHealth.errors,
            windowSeconds: DETECTOR_HEALTH_WINDOW_SECONDS,
          },
        })
        .pipe(Effect.catch(() => Effect.void))
    }

    const persistedSignalId =
      execution.kind === "completed" && execution.result.passed === true ? evaluation.signalId : null
    const scoreWriteExit = yield* Effect.exit(
      writeScoreUseCase({
        projectId: input.projectId,
        sourceType: "evaluation",
        sourceId: evaluation.id,
        sessionId: traceDetail.sessionId || null,
        traceId: traceDetail.traceId,
        spanId: traceDetail.rootSpanId || null,
        simulationId: traceDetail.simulationId || null,
        signalId: persistedSignalId,
        value: execution.kind === "completed" ? execution.result.value : 0,
        passed: execution.kind === "completed" ? execution.result.passed : false,
        feedback: execution.kind === "completed" ? execution.result.feedback : execution.error,
        metadata: {
          evaluationHash: evaluation.scriptHash ?? evaluation.alignment?.evaluationHash ?? "",
        },
        error: execution.kind === "errored" ? execution.error : null,
        duration: execution.duration,
        tokens: execution.tokens,
        cost: execution.cost,
      }),
    )

    let score: EvaluationScore | null = null
    if (Exit.isSuccess(scoreWriteExit)) {
      score = scoreWriteExit.value as EvaluationScore
    } else {
      const errorOption = Cause.findErrorOption(scoreWriteExit.cause)
      const uniqueConflict =
        errorOption._tag === "Some" &&
        isRepositoryError(errorOption.value) &&
        isUniqueViolationCause(errorOption.value.cause)

      if (!uniqueConflict) {
        return yield* scoreWriteExit
      }

      const persistedByWinner = yield* scoreRepository.findByEvaluationIdAndTraceId({
        projectId,
        evaluationId: evaluation.id,
        traceId: TraceId(input.traceId),
      })

      if (persistedByWinner === null) {
        return yield* scoreWriteExit
      }

      // The winner normally claims the reopen itself; re-claiming covers a
      // winner that died between its score commit and its claim transaction.
      yield* claimRegressionForPersistedScore({
        organizationId: input.organizationId,
        projectId: input.projectId,
        score: persistedByWinner,
      })
    }

    if (score === null) {
      return {
        action: "skipped",
        reason: "result-already-exists",
        evaluationId: input.evaluationId,
        traceId: input.traceId,
      } satisfies RunLiveEvaluationResult
    }

    // A present verdict on a manually resolved signal is a regression: reopen
    // it. The `issue` snapshot predates execution, so it only pre-gates; the
    // conditional claim re-checks current state and exactly one writer per
    // regression cycle wins and emits `SignalRegressed`.
    if (persistedSignalId !== null && issue.resolvedAt !== null) {
      yield* claimRegressionForPersistedScore({
        organizationId: input.organizationId,
        projectId: input.projectId,
        score,
      })
    }

    return {
      action: "persisted",
      summary: {
        evaluationId: evaluation.id,
        signalId: evaluation.signalId,
        traceId: traceDetail.traceId,
        sessionId: score.sessionId,
        scoreId: score.id,
      },
      context: {
        evaluation,
        traceDetail,
        issue: signalContext,
        execution,
        score,
      },
    } satisfies RunLiveEvaluationResult
  }).pipe(Effect.withSpan("evaluations.runLiveEvaluation")) as Effect.Effect<
    RunLiveEvaluationResult,
    RunLiveEvaluationError,
    | AI
    | BillingUsagePeriodRepository
    | BillingUsageEventRepository
    | DetectorHealthTracker
    | EvaluationSignalRepository
    | EvaluationRepository
    | MessageEmbeddingRepository
    | OutboxEventWriter
    | QueuePublisher
    | ScoreAnalyticsRepository
    | ScoreRepository
    | ScriptRuntime
    | SessionRepository
    | SettingsReader
    | SpanRepository
    | SqlClient
    | StripeSubscriptionLookup
    | TraceRepository
    | TraceSearchRepository
    | BillingOverrideRepository
    | BillingSpendReservation
  >
