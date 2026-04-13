import { ScoreRepository } from "@domain/scores"
import { OrganizationId, ProjectId, type RepositoryError, TraceId } from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import type { Evaluation } from "../../entities/evaluation.ts"
import type { LiveEvaluationQueuePublishError } from "../../errors.ts"
import {
  buildLiveEvaluationExecuteScopeDedupeKey,
  buildLiveEvaluationExecuteTraceDedupeKey,
  getLiveEvaluationEligibility,
  shouldSampleLiveEvaluation,
  toLiveEvaluationDebounceMs,
} from "../../helpers.ts"
import { EvaluationRepository } from "../../ports/evaluation-repository.ts"
import {
  LiveEvaluationQueuePublisher,
  type PublishLiveEvaluationExecuteInput,
} from "../../ports/live-evaluation-queue-publisher.ts"

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

export type EnqueueLiveEvaluationsError = RepositoryError | LiveEvaluationQueuePublishError

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

const buildExecutePublication = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly sessionId?: string | null
  readonly evaluation: Evaluation
}): PublishLiveEvaluationExecuteInput => {
  const debounceMs = toLiveEvaluationDebounceMs(input.evaluation.trigger.debounce)
  const traceDedupeKey = buildLiveEvaluationExecuteTraceDedupeKey({
    organizationId: input.organizationId,
    projectId: input.projectId,
    evaluationId: input.evaluation.id,
    traceId: input.traceId,
  })
  const scopeDedupeKey = buildLiveEvaluationExecuteScopeDedupeKey({
    organizationId: input.organizationId,
    projectId: input.projectId,
    evaluationId: input.evaluation.id,
    traceId: input.traceId,
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
  })

  if (input.evaluation.trigger.turn === "every" && debounceMs === undefined) {
    return {
      organizationId: input.organizationId,
      projectId: input.projectId,
      evaluationId: input.evaluation.id,
      traceId: input.traceId,
      dedupeKey: traceDedupeKey,
    }
  }

  if (input.evaluation.trigger.turn === "last") {
    return {
      organizationId: input.organizationId,
      projectId: input.projectId,
      evaluationId: input.evaluation.id,
      traceId: input.traceId,
      dedupeKey: scopeDedupeKey,
      ...(debounceMs !== undefined ? { debounceMs } : {}),
    }
  }

  if (input.evaluation.trigger.turn === "every" && debounceMs !== undefined) {
    return {
      organizationId: input.organizationId,
      projectId: input.projectId,
      evaluationId: input.evaluation.id,
      traceId: input.traceId,
      dedupeKey: scopeDedupeKey,
      debounceMs,
    }
  }

  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    evaluationId: input.evaluation.id,
    traceId: input.traceId,
    dedupeKey: traceDedupeKey,
    ...(debounceMs !== undefined ? { debounceMs } : {}),
  }
}

export const enqueueLiveEvaluationsUseCase = (input: EnqueueLiveEvaluationsInput) =>
  Effect.gen(function* () {
    const scoreRepository = yield* ScoreRepository
    const liveEvaluationQueuePublisher = yield* LiveEvaluationQueuePublisher
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
    let publishedExecuteCount = 0

    for (const evaluation of sampledEvaluations) {
      if (evaluation.trigger.turn !== "first") {
        yield* liveEvaluationQueuePublisher.publishExecute(
          buildExecutePublication({
            organizationId: input.organizationId,
            projectId: input.projectId,
            traceId: input.traceId,
            sessionId: traceDetail.sessionId ?? null,
            evaluation,
          }),
        )
        publishedExecuteCount += 1
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
        continue
      }

      yield* liveEvaluationQueuePublisher.publishExecute(
        buildExecutePublication({
          organizationId: input.organizationId,
          projectId: input.projectId,
          traceId: input.traceId,
          sessionId: traceDetail.sessionId ?? null,
          evaluation,
        }),
      )
      publishedExecuteCount += 1
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
        publishedExecuteCount,
      },
    } satisfies EnqueueLiveEvaluationsResult
  }) as Effect.Effect<
    EnqueueLiveEvaluationsResult,
    EnqueueLiveEvaluationsError,
    TraceRepository | EvaluationRepository | LiveEvaluationQueuePublisher | ScoreRepository
  >
