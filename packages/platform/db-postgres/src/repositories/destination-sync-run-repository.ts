import { type DestinationSyncRun, DestinationSyncRunRepository, destinationSyncRunSchema } from "@domain/destinations"
import { SqlClient, type SqlClientShape, toRepositoryError } from "@domain/shared"
import { and, desc, eq, inArray, lt } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { destinationSyncRuns } from "../schema/destination-sync-runs.ts"

type DestinationSyncRunRow = typeof destinationSyncRuns.$inferSelect

const toDomainDestinationSyncRun = (row: DestinationSyncRunRow): DestinationSyncRun =>
  destinationSyncRunSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    destinationId: row.destinationId,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    status: row.status,
    spansRead: row.spansRead,
    eventsSent: row.eventsSent,
    eventsDropped: row.eventsDropped,
    error: row.error,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const toInsertRow = (run: DestinationSyncRun, organizationId: string) => ({
  id: run.id,
  organizationId,
  destinationId: run.destinationId,
  windowStart: run.windowStart,
  windowEnd: run.windowEnd,
  status: run.status,
  spansRead: run.spansRead,
  eventsSent: run.eventsSent,
  eventsDropped: run.eventsDropped,
  error: run.error,
  startedAt: run.startedAt,
  finishedAt: run.finishedAt,
  createdAt: run.createdAt,
  updatedAt: run.updatedAt,
})

export const DestinationSyncRunRepositoryLive = Layer.effect(
  DestinationSyncRunRepository,
  Effect.gen(function* () {
    return {
      insert: (run: DestinationSyncRun) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db, organizationId) => db.insert(destinationSyncRuns).values(toInsertRow(run, organizationId)))
            .pipe(Effect.mapError((e) => toRepositoryError(e, "insertDestinationSyncRun")))
        }),

      listByDestinationId: ({ destinationId, limit }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(destinationSyncRuns)
                .where(
                  and(
                    eq(destinationSyncRuns.organizationId, organizationId),
                    eq(destinationSyncRuns.destinationId, destinationId),
                  ),
                )
                .orderBy(desc(destinationSyncRuns.startedAt))
                .limit(limit),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "listDestinationSyncRunsByDestinationId")))

          return rows.map(toDomainDestinationSyncRun)
        }),

      deleteByDestinationIds: (ids) =>
        Effect.gen(function* () {
          if (ids.length === 0) return
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db, organizationId) =>
              db
                .delete(destinationSyncRuns)
                .where(
                  and(
                    eq(destinationSyncRuns.organizationId, organizationId),
                    inArray(destinationSyncRuns.destinationId, [...ids]),
                  ),
                ),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "deleteDestinationSyncRunsByDestinationIds")))
        }),

      pruneFinishedBefore: (cutoff) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          // Cross-org prune on the admin client — no org filter by design.
          const rows = yield* sqlClient
            .query((db) =>
              db
                .delete(destinationSyncRuns)
                .where(lt(destinationSyncRuns.finishedAt, cutoff))
                .returning({ id: destinationSyncRuns.id }),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "pruneDestinationSyncRunsFinishedBefore")))

          return rows.length
        }),
    }
  }),
)
