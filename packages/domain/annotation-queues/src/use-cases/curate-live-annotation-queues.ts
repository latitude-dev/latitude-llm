import {
  type ConcurrentSqlTransactionError,
  deterministicSampling,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import { LIVE_QUEUE_DEFAULT_SAMPLING } from "../constants.ts"
import type { AnnotationQueue } from "../entities/annotation-queue.ts"
import { AnnotationQueueItemRepository } from "../ports/annotation-queue-item-repository.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"

export interface CurateLiveAnnotationQueuesInput {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
}

export interface CurateLiveAnnotationQueuesSummary {
  readonly traceId: string
  readonly liveQueuesScanned: number
  readonly filterMatchedCount: number
  readonly skippedSamplingCount: number
  readonly insertedItemCount: number
}

export type CurateLiveAnnotationQueuesResult =
  | {
      readonly action: "skipped"
      readonly reason: "trace-not-found"
      readonly traceId: string
    }
  | {
      readonly action: "completed"
      readonly summary: CurateLiveAnnotationQueuesSummary
    }

export type CurateLiveAnnotationQueuesError = RepositoryError | ConcurrentSqlTransactionError

const shouldSampleLiveQueue = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly queueId: string
  readonly traceId: string
  readonly sampling: number
}): Promise<boolean> =>
  deterministicSampling({
    sampling: input.sampling,
    keyParts: [input.organizationId, input.projectId, input.queueId, input.traceId],
  })

export const curateLiveAnnotationQueuesUseCase = (input: CurateLiveAnnotationQueuesInput) =>
  Effect.gen(function* () {
    const traceRepository = yield* TraceRepository
    const queueRepository = yield* AnnotationQueueRepository
    const queueItemRepository = yield* AnnotationQueueItemRepository

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
      } satisfies CurateLiveAnnotationQueuesResult
    }

    const liveQueues = yield* queueRepository.listLiveQueuesByProject({
      projectId: traceDetail.projectId,
    })

    if (liveQueues.length === 0) {
      return {
        action: "completed",
        summary: {
          traceId: traceDetail.traceId,
          liveQueuesScanned: 0,
          filterMatchedCount: 0,
          skippedSamplingCount: 0,
          insertedItemCount: 0,
        },
      } satisfies CurateLiveAnnotationQueuesResult
    }

    // TODO: Share filter evaluation with live evaluations to reduce duplication.
    // Both live queues and live evaluations evaluate FilterSets against the same trace after SpanIngested debounce.
    // A unified abstraction would batch both into a single listMatchingFilterIdsByTraceId call,
    // improving performance and reducing ClickHouse queries.
    const filterSets = liveQueues.flatMap((queue) => {
      const { filter } = queue.settings
      if (filter === undefined) return []
      return [{ filterId: queue.id, filters: filter }]
    })

    const matchingFilterIds = yield* traceRepository.listMatchingFilterIdsByTraceId({
      organizationId: OrganizationId(input.organizationId),
      projectId: traceDetail.projectId,
      traceId: traceDetail.traceId,
      filterSets,
    })

    const matchingFilterIdSet = new Set(matchingFilterIds)
    const filterMatchedQueues = liveQueues.filter((queue) => matchingFilterIdSet.has(queue.id))

    const sampledQueues: AnnotationQueue[] = []
    let skippedSamplingCount = 0

    for (const queue of filterMatchedQueues) {
      const shouldSample = yield* Effect.tryPromise(() =>
        shouldSampleLiveQueue({
          organizationId: input.organizationId,
          projectId: input.projectId,
          queueId: queue.id,
          traceId: input.traceId,
          sampling: queue.settings.sampling ?? LIVE_QUEUE_DEFAULT_SAMPLING,
        }),
      ).pipe(Effect.orDie)

      if (!shouldSample) {
        skippedSamplingCount += 1
        continue
      }

      sampledQueues.push(queue)
    }

    const sqlClient = yield* SqlClient

    const insertedItemCount = yield* sqlClient.transaction(
      Effect.gen(function* () {
        const { insertedQueueIds } = yield* queueItemRepository.insertManyAcrossQueues({
          projectId: traceDetail.projectId,
          traceId: traceDetail.traceId,
          traceCreatedAt: traceDetail.startTime,
          queueIds: sampledQueues.map((q) => q.id),
        })

        yield* queueRepository.incrementTotalItemsMany({
          projectId: traceDetail.projectId,
          queueIds: insertedQueueIds,
        })

        return insertedQueueIds.length
      }),
    )

    return {
      action: "completed",
      summary: {
        traceId: traceDetail.traceId,
        liveQueuesScanned: liveQueues.length,
        filterMatchedCount: filterMatchedQueues.length,
        skippedSamplingCount,
        insertedItemCount,
      },
    } satisfies CurateLiveAnnotationQueuesResult
  }) as Effect.Effect<
    CurateLiveAnnotationQueuesResult,
    CurateLiveAnnotationQueuesError,
    SqlClient | TraceRepository | AnnotationQueueRepository | AnnotationQueueItemRepository
  >
