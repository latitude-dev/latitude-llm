import {
  DESTINATION_IDLE_BACKOFF_MAX_MS,
  type DestinationSourceCursor,
  DestinationSourceCursorRepository,
  destinationSourceCursorSchema,
} from "@domain/destinations"
import { SqlClient, type SqlClientShape, toRepositoryError } from "@domain/shared"
import { and, eq, isNull, or, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { getEncryptionKey } from "../encryption-key.ts"
import { organizations } from "../schema/better-auth.ts"
import { destinationSourceCursors } from "../schema/destination-source-cursors.ts"
import { destinations } from "../schema/destinations.ts"
import { toDomainDestination } from "./destination-repository.ts"

type CursorRow = typeof destinationSourceCursors.$inferSelect

const toDomainCursor = (row: CursorRow): DestinationSourceCursor =>
  destinationSourceCursorSchema.parse({
    organizationId: row.organizationId,
    destinationId: row.destinationId,
    source: row.source,
    watermark: row.watermark,
    watermarkId: row.watermarkId,
    lastRunAt: row.lastRunAt,
    consecutiveEmptyRuns: row.consecutiveEmptyRuns,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const toInsertRow = (cursor: DestinationSourceCursor) => ({
  organizationId: cursor.organizationId,
  destinationId: cursor.destinationId,
  source: cursor.source,
  watermark: cursor.watermark,
  watermarkId: cursor.watermarkId,
  lastRunAt: cursor.lastRunAt,
  consecutiveEmptyRuns: cursor.consecutiveEmptyRuns,
  createdAt: cursor.createdAt,
  updatedAt: cursor.updatedAt,
})

export const DestinationSourceCursorRepositoryLive = Layer.effect(
  DestinationSourceCursorRepository,
  Effect.gen(function* () {
    const encryptionKey = yield* getEncryptionKey()

    return {
      create: (cursor) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db) => db.insert(destinationSourceCursors).values(toInsertRow(cursor)))
            .pipe(Effect.mapError((e) => toRepositoryError(e, "createDestinationSourceCursor")))
        }),

      findByDestinationAndSource: ({ destinationId, source }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(destinationSourceCursors)
                .where(
                  and(
                    eq(destinationSourceCursors.destinationId, destinationId),
                    eq(destinationSourceCursors.source, source),
                    eq(destinationSourceCursors.organizationId, organizationId),
                  ),
                )
                .limit(1),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "findDestinationSourceCursor")))

          const row = rows[0]
          return row ? toDomainCursor(row) : null
        }),

      listDue: (now: Date) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          // Cross-org sweep selection on the admin client — no org filter; the
          // organizations join excludes sandbox orgs (parent_org_id IS NOT NULL).
          const rows = yield* sqlClient
            .query((db) =>
              db
                .select({ destination: destinations, cursor: destinationSourceCursors })
                .from(destinationSourceCursors)
                .innerJoin(destinations, eq(destinations.id, destinationSourceCursors.destinationId))
                .innerJoin(organizations, eq(organizations.id, destinations.organizationId))
                .where(
                  and(
                    eq(destinations.status, "active"),
                    isNull(organizations.parentOrgId),
                    or(
                      isNull(destinationSourceCursors.lastRunAt),
                      sql`${destinationSourceCursors.lastRunAt} + least((${destinations.config} ->> 'intervalMs')::double precision * power(2, ${destinationSourceCursors.consecutiveEmptyRuns}), ${DESTINATION_IDLE_BACKOFF_MAX_MS}::double precision) * interval '1 millisecond' <= ${now.toISOString()}::timestamptz`,
                    ),
                  ),
                ),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "listDueDestinationSourceCursors")))

          return yield* Effect.forEach(rows, (row) =>
            toDomainDestination(row.destination, encryptionKey).pipe(
              Effect.map((destination) => ({ destination, cursor: toDomainCursor(row.cursor) })),
            ),
          )
        }),

      advanceCursor: ({ destinationId, source, expected, next }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(destinationSourceCursors)
                .set({ watermark: next.watermark, watermarkId: next.id, updatedAt: new Date() })
                .where(
                  and(
                    eq(destinationSourceCursors.destinationId, destinationId),
                    eq(destinationSourceCursors.source, source),
                    eq(destinationSourceCursors.organizationId, organizationId),
                    eq(destinationSourceCursors.watermark, expected.watermark),
                    eq(destinationSourceCursors.watermarkId, expected.id),
                  ),
                )
                .returning({ destinationId: destinationSourceCursors.destinationId }),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "advanceDestinationSourceCursor")))

          return rows.length > 0
        }),

      updateRunState: ({ destinationId, source, consecutiveEmptyRuns, lastRunAt }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(destinationSourceCursors)
                .set({ consecutiveEmptyRuns, lastRunAt, updatedAt: new Date() })
                .where(
                  and(
                    eq(destinationSourceCursors.destinationId, destinationId),
                    eq(destinationSourceCursors.source, source),
                    eq(destinationSourceCursors.organizationId, organizationId),
                  ),
                ),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "updateDestinationSourceRunState")))
        }),

      deleteByDestinationId: (destinationId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db, organizationId) =>
              db
                .delete(destinationSourceCursors)
                .where(
                  and(
                    eq(destinationSourceCursors.destinationId, destinationId),
                    eq(destinationSourceCursors.organizationId, organizationId),
                  ),
                ),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "deleteDestinationSourceCursorsByDestinationId")))
        }),
    }
  }),
)
