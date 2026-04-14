import { EvaluationId, OrganizationId, ProjectId, type RepositoryError, TraceId } from "@domain/shared"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import type { Evaluation } from "../../entities/evaluation.ts"
import { getLiveEvaluationEligibility } from "../../helpers.ts"
import { EvaluationRepository } from "../../ports/evaluation-repository.ts"

export interface RunLiveEvaluationInput {
  readonly organizationId: string
  readonly projectId: string
  readonly evaluationId: string
  readonly traceId: string
}

export interface RunLiveEvaluationLoadedSummary {
  readonly evaluationId: string
  readonly issueId: string
  readonly traceId: string
  readonly sessionId: string | null
}

export interface RunLiveEvaluationLoadedContext {
  readonly evaluation: Evaluation
  readonly traceDetail: TraceDetail
}

export type RunLiveEvaluationResult =
  | {
      readonly action: "skipped"
      readonly reason: "evaluation-not-found" | "trace-not-found" | "deleted" | "archived" | "paused"
      readonly evaluationId: string
      readonly traceId: string
    }
  | {
      readonly action: "loaded"
      readonly summary: RunLiveEvaluationLoadedSummary
      readonly context: RunLiveEvaluationLoadedContext
    }

export type RunLiveEvaluationError = RepositoryError

export const runLiveEvaluationUseCase = (input: RunLiveEvaluationInput) =>
  Effect.gen(function* () {
    const evaluationRepository = yield* EvaluationRepository
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

    return {
      action: "loaded",
      summary: {
        evaluationId: evaluation.id,
        issueId: evaluation.issueId,
        traceId: traceDetail.traceId,
        sessionId: traceDetail.sessionId ?? null,
      },
      context: {
        evaluation,
        traceDetail,
      },
    } satisfies RunLiveEvaluationResult
  }) as Effect.Effect<RunLiveEvaluationResult, RunLiveEvaluationError, EvaluationRepository | TraceRepository>
