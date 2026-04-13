import { ScoreRepository } from "@domain/scores"
import { OrganizationId, ProjectId, type RepositoryError, TraceId } from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import type { Evaluation } from "../../entities/evaluation.ts"
import { getLiveEvaluationEligibility, shouldSampleLiveEvaluation } from "../../helpers.ts"
import { EvaluationRepository } from "../../ports/evaluation-repository.ts"

const ACTIVE_EVALUATION_SCAN_PAGE_SIZE = 100

export interface EnqueueLiveEvaluationsInput {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
}

export interface EnqueueLiveEvaluationsSummary {
  readonly traceId: string
  readonly sessionId: string | null
  readonly activeEvaluationsScanned: number
  readonly filterMatchedCount: number
  readonly skippedPausedCount: number
  readonly skippedSamplingCount: number
  readonly skippedTurnCount: number
  readonly publishedExecuteCount: number
}

export type EnqueueLiveEvaluationsResult =
  | {
      readonly action: "skipped"
      readonly reason: "trace-not-found"
      readonly traceId: string
    }
  | {
      readonly action: "completed"
      readonly summary: EnqueueLiveEvaluationsSummary
    }

export type EnqueueLiveEvaluationsError = RepositoryError

const listAllActiveEvaluations = ({ projectId }: { readonly projectId: ProjectId }) =>
  Effect.gen(function* () {
    const evaluationRepository = yield* EvaluationRepository
    const evaluations: Evaluation[] = []
    let offset = 0

    while (true) {
      const page = yield* evaluationRepository.listByProjectId({
        projectId,
        options: {
          lifecycle: "active",
          limit: ACTIVE_EVALUATION_SCAN_PAGE_SIZE,
          offset,
        },
      })

      evaluations.push(...page.items)

      if (!page.hasMore) {
        return evaluations
      }

      offset += page.limit
    }
  })

export const enqueueLiveEvaluationsUseCase = (input: EnqueueLiveEvaluationsInput) =>
  Effect.gen(function* () {
    const scoreRepository = yield* ScoreRepository
    const traceRepository = yield* TraceRepository
    const traceDetail = yield* traceRepository
      .findByTraceId({
        organizationId: OrganizationId(input.organizationId),
        projectId: ProjectId(input.projectId),
        traceId: TraceId(input.traceId),
      })
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (traceDetail === null) {
      return {
        action: "skipped",
        reason: "trace-not-found",
        traceId: input.traceId,
      } satisfies EnqueueLiveEvaluationsResult
    }

    const activeEvaluations = yield* listAllActiveEvaluations({
      projectId: traceDetail.projectId,
    })
    const evaluationEligibility = activeEvaluations.map((evaluation) => ({
      evaluation,
      eligibility: getLiveEvaluationEligibility(evaluation),
    }))
    const skippedPausedCount = evaluationEligibility.reduce((count, item) => {
      if (!item.eligibility.eligible && item.eligibility.reason === "paused") {
        return count + 1
      }

      return count
    }, 0)
    const eligibleEvaluations = evaluationEligibility.flatMap((item) => {
      if (item.eligibility.eligible) {
        return [item.evaluation]
      }

      return []
    })
    const matchingFilterIds = yield* traceRepository.listMatchingFilterIdsByTraceId({
      organizationId: OrganizationId(input.organizationId),
      projectId: traceDetail.projectId,
      traceId: traceDetail.traceId,
      filterSets: eligibleEvaluations.map((evaluation) => ({
        filterId: evaluation.id,
        filters: evaluation.trigger.filter,
      })),
    })
    const matchingFilterIdSet = new Set(matchingFilterIds)
    const filterMatchedEvaluations = eligibleEvaluations.filter((evaluation) => matchingFilterIdSet.has(evaluation.id))
    const filterMatchedCount = filterMatchedEvaluations.length
    const sampledEvaluations: Evaluation[] = []
    let skippedSamplingCount = 0

    for (const evaluation of filterMatchedEvaluations) {
      const shouldSample = yield* Effect.tryPromise(() =>
        shouldSampleLiveEvaluation({
          organizationId: input.organizationId,
          projectId: input.projectId,
          evaluationId: evaluation.id,
          traceId: input.traceId,
          sampling: evaluation.trigger.sampling,
        }),
      ).pipe(Effect.orDie)

      if (!shouldSample) {
        skippedSamplingCount += 1
        continue
      }

      sampledEvaluations.push(evaluation)
    }

    let skippedTurnCount = 0

    for (const evaluation of sampledEvaluations) {
      if (evaluation.trigger.turn !== "first") {
        continue
      }

      const alreadyExists = yield* scoreRepository.existsByEvaluationIdAndScope({
        projectId: traceDetail.projectId,
        evaluationId: evaluation.id,
        traceId: traceDetail.traceId,
        sessionId: traceDetail.sessionId ?? null,
      })

      if (alreadyExists) {
        skippedTurnCount += 1
      }
    }

    return {
      action: "completed",
      summary: {
        traceId: traceDetail.traceId,
        sessionId: traceDetail.sessionId ?? null,
        activeEvaluationsScanned: activeEvaluations.length,
        filterMatchedCount,
        skippedPausedCount,
        skippedSamplingCount,
        skippedTurnCount,
        publishedExecuteCount: 0,
      },
    } satisfies EnqueueLiveEvaluationsResult
  }) as Effect.Effect<
    EnqueueLiveEvaluationsResult,
    EnqueueLiveEvaluationsError,
    TraceRepository | EvaluationRepository | ScoreRepository
  >
