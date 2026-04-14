import type { AI } from "@domain/ai"
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
import { Effect } from "effect"
import type { Evaluation } from "../../entities/evaluation.ts"
import { getLiveEvaluationEligibility } from "../../helpers.ts"
import { EvaluationIssueRepository } from "../../ports/evaluation-issue-repository.ts"
import { EvaluationRepository } from "../../ports/evaluation-repository.ts"
import {
  type ExecuteLiveEvaluationError,
  executeLiveEvaluationUseCase,
  type LiveEvaluationExecutionResult,
  type LiveEvaluationIssueContext,
} from "./execute-live-evaluation.ts"
import type { ScoreWriteOutboxEventWriter } from "./score-write-outbox-event-writer.ts"

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
  readonly execution: LiveEvaluationExecutionResult
  readonly score: EvaluationScore
}

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

export type RunLiveEvaluationError = RepositoryError | ExecuteLiveEvaluationError | WriteScoreError

export const runLiveEvaluationUseCase = (input: RunLiveEvaluationInput) =>
  Effect.gen(function* () {
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
    const execution = yield* executeLiveEvaluationUseCase({
      evaluationId: evaluation.id,
      script: evaluation.script,
      issue: issueContext,
      conversation: traceDetail.allMessages,
    })
    const score = (yield* writeScoreUseCase({
      projectId: input.projectId,
      source: "evaluation",
      sourceId: evaluation.id,
      sessionId: traceDetail.sessionId ?? null,
      traceId: traceDetail.traceId,
      spanId: traceDetail.rootSpanId,
      simulationId: traceDetail.simulationId || null,
      value: execution.result.value,
      passed: execution.result.passed,
      feedback: execution.result.feedback,
      metadata: {
        evaluationHash: evaluation.alignment.evaluationHash,
      },
      duration: execution.duration,
      tokens: execution.tokens,
      cost: execution.cost,
    })) as EvaluationScore

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
  }) as Effect.Effect<
    RunLiveEvaluationResult,
    RunLiveEvaluationError,
    | AI
    | EvaluationIssueRepository
    | EvaluationRepository
    | ScoreWriteOutboxEventWriter
    | ScoreAnalyticsRepository
    | ScoreRepository
    | SqlClient
    | TraceRepository
  >
