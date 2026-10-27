import { type ProjectId, type SessionId, SqlClient, type SqlClientShape, type TraceId } from "@domain/shared"
import { TraceReferencePurgeRepository, type TraceReferencePurgeRepositoryShape } from "@domain/spans"
import { and, count, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { annotationQueueItems, annotationQueues } from "../schema/annotation-queues.ts"
import { scores } from "../schema/scores.ts"

interface PurgeKeys {
  readonly projectId: ProjectId
  readonly traceIds: readonly TraceId[]
  readonly sessionIds: readonly SessionId[]
}

const scoresWhere = (keys: PurgeKeys, organizationId: string): SQL | undefined => {
  const traceKeys = [...keys.traceIds] as string[]
  const sessionKeys = [...keys.sessionIds] as string[]
  return and(
    eq(scores.organizationId, organizationId),
    eq(scores.projectId, keys.projectId),
    or(
      traceKeys.length > 0 ? inArray(scores.traceId, traceKeys) : undefined,
      sessionKeys.length > 0 ? and(isNull(scores.traceId), inArray(scores.sessionId, sessionKeys)) : undefined,
    ),
  )
}

const queueItemsWhere = (keys: PurgeKeys, organizationId: string): SQL | undefined =>
  and(
    eq(annotationQueueItems.organizationId, organizationId),
    eq(annotationQueueItems.projectId, keys.projectId),
    inArray(annotationQueueItems.traceId, [...keys.traceIds] as string[]),
  )

const isEmpty = (keys: PurgeKeys) => keys.traceIds.length === 0 && keys.sessionIds.length === 0

export const TraceReferencePurgeRepositoryLive = Layer.succeed(TraceReferencePurgeRepository, {
  count: (keys) =>
    Effect.gen(function* () {
      if (isEmpty(keys)) return {}

      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      return yield* sqlClient.query(async (db, organizationId) => {
        const [scoreRows] = await db.select({ rows: count() }).from(scores).where(scoresWhere(keys, organizationId))
        const [itemRows] =
          keys.traceIds.length === 0
            ? [{ rows: 0 }]
            : await db.select({ rows: count() }).from(annotationQueueItems).where(queueItemsWhere(keys, organizationId))
        return { scores: scoreRows?.rows ?? 0, annotation_queue_items: itemRows?.rows ?? 0 }
      })
    }),

  purge: (keys) =>
    Effect.gen(function* () {
      if (isEmpty(keys)) return { scores: [] }

      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      return yield* sqlClient.query(async (db, organizationId) => {
        const deletedScores = await db.delete(scores).where(scoresWhere(keys, organizationId)).returning({
          id: scores.id,
          signalId: scores.signalId,
          draftedAt: scores.draftedAt,
          feedback: scores.feedback,
          sourceType: scores.sourceType,
          createdAt: scores.createdAt,
        })

        const deletedItems =
          keys.traceIds.length === 0
            ? []
            : await db
                .delete(annotationQueueItems)
                .where(queueItemsWhere(keys, organizationId))
                .returning({ queueId: annotationQueueItems.queueId })

        const queueIds = [...new Set(deletedItems.map((item) => item.queueId))]
        if (queueIds.length > 0) {
          await db
            .update(annotationQueues)
            .set({
              totalItems: sql`(select count(*) from ${annotationQueueItems} where ${annotationQueueItems.queueId} = ${annotationQueues.id})`,
              completedItems: sql`(select count(*) from ${annotationQueueItems} where ${annotationQueueItems.queueId} = ${annotationQueues.id} and ${annotationQueueItems.completedAt} is not null)`,
            })
            .where(and(eq(annotationQueues.organizationId, organizationId), inArray(annotationQueues.id, queueIds)))
        }

        return {
          scores: deletedScores.map((score) => ({
            scoreId: score.id,
            signalId: score.signalId,
            draftedAt: score.draftedAt?.toISOString() ?? null,
            feedback: score.feedback,
            source: score.sourceType,
            createdAt: score.createdAt.toISOString(),
          })),
        }
      })
    }),
} satisfies TraceReferencePurgeRepositoryShape)
