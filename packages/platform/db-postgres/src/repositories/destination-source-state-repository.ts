import {
  DESTINATION_IDLE_BACKOFF_MAX_MS,
  type DestinationSourceState,
  DestinationSourceStateRepository,
  destinationSourceStateSchema,
} from "@domain/destinations"
import { SqlClient, type SqlClientShape, toRepositoryError } from "@domain/shared"
import { and, eq, isNull, lt, or, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { getEncryptionKey } from "../encryption-key.ts"
import { organizations } from "../schema/better-auth.ts"
import { destinationSources } from "../schema/destination-sources.ts"
import { destinations } from "../schema/destinations.ts"
import { toDomainDestination } from "./destination-repository.ts"

type SourceRow = typeof destinationSources.$inferSelect

const toDomainSourceState = (row: SourceRow): DestinationSourceState =>
  destinationSourceStateSchema.parse({
    organizationId: row.organizationId,
    destinationId: row.destinationId,
    source: row.source,
    status: row.status,
    config: row.config,
    watermark: row.watermark,
    watermarkId: row.watermarkId,
    coverageStartAt: row.coverageStartAt,
    backfillStartedAt: row.backfillStartedAt,
    backfillProgressAt: row.backfillProgressAt,
    lastRunAt: row.lastRunAt,
    consecutiveEmptyRuns: row.consecutiveEmptyRuns,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const toInsertRow = (sourceState: DestinationSourceState) => ({
  organizationId: sourceState.organizationId,
  destinationId: sourceState.destinationId,
  source: sourceState.source,
  status: sourceState.status,
  config: sourceState.config,
  watermark: sourceState.watermark,
  watermarkId: sourceState.watermarkId,
  coverageStartAt: sourceState.coverageStartAt,
  backfillStartedAt: sourceState.backfillStartedAt,
  backfillProgressAt: sourceState.backfillProgressAt,
  lastRunAt: sourceState.lastRunAt,
  consecutiveEmptyRuns: sourceState.consecutiveEmptyRuns,
  createdAt: sourceState.createdAt,
  updatedAt: sourceState.updatedAt,
})

export const DestinationSourceStateRepositoryLive = Layer.effect(
  DestinationSourceStateRepository,
  Effect.gen(function* () {
    const encryptionKey = yield* getEncryptionKey()

    return {
      create: (sourceState) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db) => db.insert(destinationSources).values(toInsertRow(sourceState)))
            .pipe(Effect.mapError((e) => toRepositoryError(e, "createDestinationSource")))
        }),

      findByDestinationAndSource: ({ destinationId, source }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(destinationSources)
                .where(
                  and(
                    eq(destinationSources.destinationId, destinationId),
                    eq(destinationSources.source, source),
                    eq(destinationSources.organizationId, organizationId),
                  ),
                )
                .limit(1),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "findDestinationSource")))

          const row = rows[0]
          return row ? toDomainSourceState(row) : null
        }),

      listByDestinationId: (destinationId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(destinationSources)
                .where(
                  and(
                    eq(destinationSources.destinationId, destinationId),
                    eq(destinationSources.organizationId, organizationId),
                  ),
                ),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "listDestinationSourcesByDestinationId")))

          return rows.map(toDomainSourceState)
        }),

      listDue: (now: Date) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          // Cross-org sweep selection on the admin client — no org filter; the
          // organizations join excludes sandbox orgs (parent_org_id IS NOT NULL).
          const rows = yield* sqlClient
            .query((db) =>
              db
                .select({ destination: destinations, sourceState: destinationSources })
                .from(destinationSources)
                .innerJoin(destinations, eq(destinations.id, destinationSources.destinationId))
                .innerJoin(organizations, eq(organizations.id, destinations.organizationId))
                .where(
                  and(
                    eq(destinations.status, "active"),
                    eq(destinationSources.status, "enabled"),
                    isNull(organizations.parentOrgId),
                    or(
                      isNull(destinationSources.lastRunAt),
                      sql`${destinationSources.lastRunAt} + least((${destinations.config} ->> 'intervalMs')::double precision * power(2, ${destinationSources.consecutiveEmptyRuns}), ${DESTINATION_IDLE_BACKOFF_MAX_MS}::double precision) * interval '1 millisecond' <= ${now.toISOString()}::timestamptz`,
                    ),
                  ),
                ),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "listDueDestinationSources")))

          return yield* Effect.forEach(rows, (row) =>
            toDomainDestination(row.destination, encryptionKey).pipe(
              Effect.map((destination) => ({ destination, sourceState: toDomainSourceState(row.sourceState) })),
            ),
          )
        }),

      advanceCursor: ({ destinationId, source, expected, next }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(destinationSources)
                .set({ watermark: next.watermark, watermarkId: next.id, updatedAt: new Date() })
                .where(
                  and(
                    eq(destinationSources.destinationId, destinationId),
                    eq(destinationSources.source, source),
                    eq(destinationSources.organizationId, organizationId),
                    eq(destinationSources.watermark, expected.watermark),
                    eq(destinationSources.watermarkId, expected.id),
                  ),
                )
                .returning({ destinationId: destinationSources.destinationId }),
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
                .update(destinationSources)
                .set({ consecutiveEmptyRuns, lastRunAt, updatedAt: new Date() })
                .where(
                  and(
                    eq(destinationSources.destinationId, destinationId),
                    eq(destinationSources.source, source),
                    eq(destinationSources.organizationId, organizationId),
                  ),
                ),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "updateDestinationSourceRunState")))
        }),

      setWatermark: ({ destinationId, source, watermark }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(destinationSources)
                .set({ watermark: watermark.watermark, watermarkId: watermark.id, updatedAt: new Date() })
                .where(
                  and(
                    eq(destinationSources.destinationId, destinationId),
                    eq(destinationSources.source, source),
                    eq(destinationSources.organizationId, organizationId),
                  ),
                ),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "setDestinationSourceWatermark")))
        }),

      updateConfig: ({ destinationId, source, config, status }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(destinationSources)
                .set({
                  ...(config === undefined ? {} : { config }),
                  ...(status === undefined ? {} : { status }),
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(destinationSources.destinationId, destinationId),
                    eq(destinationSources.source, source),
                    eq(destinationSources.organizationId, organizationId),
                  ),
                ),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "updateDestinationSourceConfig")))
        }),

      extendCoverageStart: ({ destinationId, source, to }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(destinationSources)
                .set({
                  coverageStartAt: sql`least(${destinationSources.coverageStartAt}, ${to.toISOString()}::timestamptz)`,
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(destinationSources.destinationId, destinationId),
                    eq(destinationSources.source, source),
                    eq(destinationSources.organizationId, organizationId),
                  ),
                ),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "extendDestinationSourceCoverageStart")))
        }),

      acquireBackfill: ({ destinationId, source, at, staleBefore }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(destinationSources)
                .set({ backfillStartedAt: at, updatedAt: new Date() })
                .where(
                  and(
                    eq(destinationSources.destinationId, destinationId),
                    eq(destinationSources.source, source),
                    eq(destinationSources.organizationId, organizationId),
                    or(isNull(destinationSources.backfillStartedAt), lt(destinationSources.updatedAt, staleBefore)),
                  ),
                )
                .returning({ destinationId: destinationSources.destinationId }),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "acquireDestinationSourceBackfill")))

          return rows.length > 0
        }),

      setBackfillStartedAt: ({ destinationId, source, at }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(destinationSources)
                .set({ backfillStartedAt: at, updatedAt: new Date() })
                .where(
                  and(
                    eq(destinationSources.destinationId, destinationId),
                    eq(destinationSources.source, source),
                    eq(destinationSources.organizationId, organizationId),
                  ),
                ),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "setDestinationSourceBackfillStartedAt")))
        }),

      setBackfillProgress: ({ destinationId, source, at }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(destinationSources)
                .set({ backfillProgressAt: at, updatedAt: new Date() })
                .where(
                  and(
                    eq(destinationSources.destinationId, destinationId),
                    eq(destinationSources.source, source),
                    eq(destinationSources.organizationId, organizationId),
                  ),
                ),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "setDestinationSourceBackfillProgress")))
        }),

      resetCoverageStart: (destinationId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(destinationSources)
                .set({ coverageStartAt: sql`${destinationSources.createdAt}`, updatedAt: new Date() })
                .where(
                  and(
                    eq(destinationSources.destinationId, destinationId),
                    eq(destinationSources.organizationId, organizationId),
                  ),
                ),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "resetDestinationSourceCoverageStart")))
        }),

      deleteByDestinationId: (destinationId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db, organizationId) =>
              db
                .delete(destinationSources)
                .where(
                  and(
                    eq(destinationSources.destinationId, destinationId),
                    eq(destinationSources.organizationId, organizationId),
                  ),
                ),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "deleteDestinationSourcesByDestinationId")))
        }),
    }
  }),
)
