import { OrganizationId, ProjectId, type RepositoryError, TraceId } from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import type { Evaluation } from "../../entities/evaluation.ts"
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

    // Later PR2 steps will fill these counters by applying filter, sampling, and turn logic.
    return {
      action: "completed",
      summary: {
        traceId: traceDetail.traceId,
        sessionId: traceDetail.sessionId ?? null,
        activeEvaluationsScanned: activeEvaluations.length,
        filterMatchedCount: 0,
        skippedPausedCount: 0,
        skippedSamplingCount: 0,
        skippedTurnCount: 0,
        publishedExecuteCount: 0,
      },
    } satisfies EnqueueLiveEvaluationsResult
  }) as Effect.Effect<EnqueueLiveEvaluationsResult, EnqueueLiveEvaluationsError, TraceRepository | EvaluationRepository>
