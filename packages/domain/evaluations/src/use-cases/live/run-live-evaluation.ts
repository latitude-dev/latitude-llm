import type { AI } from "@domain/ai"
import type { OutboxEventWriter } from "@domain/events"
import {
  type EvaluationScore,
  type ScoreAnalyticsRepository,
  ScoreRepository,
  type WriteScoreError,
  writeScoreUseCase,
} from "@domain/scores"
import {
  EvaluationId,
  IssueId,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  type SqlClient,
  TraceId,
} from "@domain/shared"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { Cause, Effect, Exit } from "effect"
import type { Evaluation } from "../../entities/evaluation.ts"
import { getLiveEvaluationEligibility } from "../../helpers.ts"
import { EvaluationIssueRepository } from "../../ports/evaluation-issue-repository.ts"
import { EvaluationRepository } from "../../ports/evaluation-repository.ts"
import { buildEvaluationJudgeLiveTelemetryCapture } from "../../runtime/ai-telemetry.ts"
import {
  executeLiveEvaluationUseCase,
  type LiveEvaluationExecutionResult,
  type LiveEvaluationIssueContext,
} from "./execute-live-evaluation.ts"

export interface RunLiveEvaluationInput {
  readonly organizationId: string
  readonly projectId: string
  readonly evaluationId: string
  readonly traceId: string
}

export interface RunLiveEvaluationPersistedSummary {
  readonly evaluationId: string
  readonly issueId: string
  readonly traceId: string
  readonly sessionId: string | null
  readonly scoreId: string
}

export interface RunLiveEvaluationPersistedContext {
  readonly evaluation: Evaluation
  readonly traceDetail: TraceDetail
  readonly issue: LiveEvaluationIssueContext
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
      readonly evaluationId: string
      readonly traceId: string
    }
  | {
      readonly action: "persisted"
      readonly summary: RunLiveEvaluationPersistedSummary
      readonly context: RunLiveEvaluationPersistedContext
    }

export type RunLiveEvaluationError = RepositoryError | WriteScoreError

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

    if (!liveEvaluationEligibility.eligible) {
      return {
        action: "skipped",
        reason: liveEvaluationEligibility.reason,
        evaluationId: input.evaluationId,
        traceId: input.traceId,
      } satisfies RunLiveEvaluationResult
    }

    const resultAlreadyExists = yield* scoreRepository.existsByEvaluationIdAndTraceId({
      projectId,
      evaluationId: evaluation.id,
      traceId: TraceId(input.traceId),
    })

    if (resultAlreadyExists) {
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

    const issueRepository = yield* EvaluationIssueRepository
    const issue = yield* issueRepository
      .findById(IssueId(evaluation.issueId))
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (issue === null || issue.projectId !== input.projectId) {
      return {
        action: "skipped",
        reason: "issue-not-found",
        evaluationId: input.evaluationId,
        traceId: input.traceId,
      } satisfies RunLiveEvaluationResult
    }

    const issueContext = {
      name: issue.name,
      description: issue.description,
    } satisfies LiveEvaluationIssueContext
    const executionStartedAt = performance.now()
    const execution = yield* executeLiveEvaluationUseCase({
      evaluationId: evaluation.id,
      script: evaluation.script,
      issue: issueContext,
      conversation: traceDetail.allMessages,
      telemetry: buildEvaluationJudgeLiveTelemetryCapture({
        organizationId: input.organizationId,
        projectId: input.projectId,
        evaluationId: evaluation.id,
        issueId: String(evaluation.issueId),
        traceId: input.traceId,
      }),
    }).pipe(
      Effect.map(
        (result) =>
          ({
            kind: "completed",
            ...result,
          }) satisfies RunLiveEvaluationCompletedExecution,
      ),
      Effect.catchTags({
        AIError: (error) => Effect.succeed(toErroredExecution(error.message, executionStartedAt)),
        AICredentialError: (error) => Effect.succeed(toErroredExecution(error.message, executionStartedAt)),
        LiveEvaluationExecutionError: (error) => Effect.succeed(toErroredExecution(error.message, executionStartedAt)),
      }),
    )
    const persistedIssueId =
      execution.kind === "completed" && execution.result.passed === false ? evaluation.issueId : null
    const scoreWriteExit = yield* Effect.exit(
      writeScoreUseCase({
        projectId: input.projectId,
        source: "evaluation",
        sourceId: evaluation.id,
        sessionId: traceDetail.sessionId ?? null,
        traceId: traceDetail.traceId,
        spanId: traceDetail.rootSpanId,
        simulationId: traceDetail.simulationId || null,
        issueId: persistedIssueId,
        value: execution.kind === "completed" ? execution.result.value : 0,
        passed: execution.kind === "completed" ? execution.result.passed : false,
        feedback: execution.kind === "completed" ? execution.result.feedback : execution.error,
        metadata: {
          evaluationHash: evaluation.alignment.evaluationHash,
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

      const resultNowExists = yield* scoreRepository.existsByEvaluationIdAndTraceId({
        projectId,
        evaluationId: evaluation.id,
        traceId: TraceId(input.traceId),
      })

      if (!resultNowExists) {
        return yield* scoreWriteExit
      }
    }

    if (score === null) {
      return {
        action: "skipped",
        reason: "result-already-exists",
        evaluationId: input.evaluationId,
        traceId: input.traceId,
      } satisfies RunLiveEvaluationResult
    }

    return {
      action: "persisted",
      summary: {
        evaluationId: evaluation.id,
        issueId: evaluation.issueId,
        traceId: traceDetail.traceId,
        sessionId: traceDetail.sessionId ?? null,
        scoreId: score.id,
      },
      context: {
        evaluation,
        traceDetail,
        issue: issueContext,
        execution,
        score,
      },
    } satisfies RunLiveEvaluationResult
  }).pipe(Effect.withSpan("evaluations.runLiveEvaluation")) as Effect.Effect<
    RunLiveEvaluationResult,
    RunLiveEvaluationError,
    | AI
    | EvaluationIssueRepository
    | EvaluationRepository
    | OutboxEventWriter
    | ScoreAnalyticsRepository
    | ScoreRepository
    | SqlClient
    | TraceRepository
  >
