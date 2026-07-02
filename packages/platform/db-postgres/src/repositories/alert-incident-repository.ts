import {
  type Incident,
  type IncidentCursor,
  type IncidentListPage,
  IncidentRepository,
  type IncidentRepositoryShape,
  incidentSchema,
} from "@domain/incidents"
import { type AlertIncidentId, NotFoundError, SqlClient, type SqlClientShape } from "@domain/shared"
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  min,
  or,
  type SQL,
} from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { incidents } from "../schema/alert-incidents.ts"

/** Keyset predicate for `ended_at DESC NULLS FIRST, id DESC`: a null `endedAt` cursor is still inside the ongoing block (remaining ongoing rows + all closed rows); a non-null cursor compares closed rows on `(ended_at, id)`. */
const afterCursor = (cursor: IncidentCursor | undefined): SQL | undefined => {
  if (!cursor) return undefined
  if (cursor.endedAt === null) {
    return or(and(isNull(incidents.endedAt), lt(incidents.id, cursor.id)), isNotNull(incidents.endedAt))
  }
  return or(
    lt(incidents.endedAt, cursor.endedAt),
    and(eq(incidents.endedAt, cursor.endedAt), lt(incidents.id, cursor.id)),
  )
}

/** Trim the `limit + 1` probe row, deriving `hasMore` + `nextCursor` from the last kept incident. */
const toKeysetPage = (rows: readonly Incident[], limit: number): IncidentListPage => {
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items[items.length - 1]
  return { items, hasMore, nextCursor: hasMore && last ? { endedAt: last.endedAt, id: last.id } : null }
}

const toInsertRow = (incident: Incident): typeof incidents.$inferInsert => ({
  id: incident.id,
  organizationId: incident.organizationId,
  projectId: incident.projectId,
  sourceType: incident.sourceType,
  sourceId: incident.sourceId,
  severity: incident.severity,
  startedAt: incident.startedAt,
  endedAt: incident.endedAt,
  createdAt: incident.createdAt,
  entrySignals: incident.entrySignals,
  exitEligibleSince: incident.exitEligibleSince,
  condition: incident.condition,
})

const toDomain = (row: typeof incidents.$inferSelect): Incident => incidentSchema.parse(row)

const makeIncidentRepository = (): IncidentRepositoryShape =>
  IncidentRepository.of({
    insert: (incident) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const row = toInsertRow(incident)
        yield* sqlClient.query((db) => db.insert(incidents).values(row))
      }),
    findById: (id) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const rows = yield* sqlClient.query((db) =>
          db
            .select()
            .from(incidents)
            .where(and(eq(incidents.id, id), eq(incidents.organizationId, sqlClient.organizationId)))
            .limit(1),
        )
        const row = rows[0]
        if (!row) return yield* new NotFoundError({ entity: "Incident", id })
        return toDomain(row)
      }),
    findOpen: ({ sourceType, sourceId }) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const rows = yield* sqlClient.query((db) =>
          db
            .select()
            .from(incidents)
            .where(
              and(
                eq(incidents.organizationId, sqlClient.organizationId),
                eq(incidents.sourceType, sourceType),
                eq(incidents.sourceId, sourceId),
                isNull(incidents.endedAt),
              ),
            )
            .limit(1),
        )
        const row = rows[0]
        return row ? toDomain(row) : null
      }),
    closeOpen: ({ sourceType, sourceId, endedAt }) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const rows = yield* sqlClient.query((db) =>
          db
            .update(incidents)
            .set({ endedAt })
            .where(
              and(
                eq(incidents.organizationId, sqlClient.organizationId),
                eq(incidents.sourceType, sourceType),
                eq(incidents.sourceId, sourceId),
                isNull(incidents.endedAt),
              ),
            )
            .returning({ id: incidents.id }),
        )
        const closedId = rows[0]?.id
        return closedId ? (closedId as AlertIncidentId) : null
      }),
    updateExitDwell: ({ id, exitEligibleSince }) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        yield* sqlClient.query((db) =>
          db
            .update(incidents)
            .set({ exitEligibleSince })
            .where(and(eq(incidents.id, id), eq(incidents.organizationId, sqlClient.organizationId))),
        )
      }),
    setEndedAt: ({ id, endedAt }) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        yield* sqlClient.query((db) =>
          db
            .update(incidents)
            .set({ endedAt })
            .where(and(eq(incidents.id, id), eq(incidents.organizationId, sqlClient.organizationId))),
        )
      }),
    closeById: ({ id, endedAt }) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const rows = yield* sqlClient.query((db) =>
          db
            .update(incidents)
            .set({ endedAt })
            .where(
              and(
                eq(incidents.id, id),
                eq(incidents.organizationId, sqlClient.organizationId),
                isNull(incidents.endedAt),
              ),
            )
            .returning(),
        )
        const row = rows[0]
        return row ? toDomain(row) : null
      }),
    listByProjectId: ({ organizationId, projectId, from, to, sourceTypes, sourceId, severities }) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const rows = yield* sqlClient.query((db) =>
          db
            .select()
            .from(incidents)
            .where(
              and(
                eq(incidents.organizationId, organizationId),
                eq(incidents.projectId, projectId),
                to ? lte(incidents.startedAt, to) : undefined,
                from ? or(isNull(incidents.endedAt), gte(incidents.endedAt, from)) : undefined,
                sourceTypes && sourceTypes.length > 0 ? inArray(incidents.sourceType, sourceTypes) : undefined,
                sourceId ? eq(incidents.sourceId, sourceId) : undefined,
                severities && severities.length > 0 ? inArray(incidents.severity, severities) : undefined,
              ),
            )
            .orderBy(asc(incidents.startedAt)),
        )
        return rows.map(toDomain)
      }),
    listOpenBySourceType: (sourceType) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const rows = yield* sqlClient.query((db) =>
          db
            .select()
            .from(incidents)
            .where(and(eq(incidents.sourceType, sourceType), isNull(incidents.endedAt)))
            .orderBy(asc(incidents.startedAt)),
        )
        return rows.map(toDomain)
      }),
    listByMonitorId: ({ monitorId, limit, cursor }) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const where = and(
          eq(incidents.organizationId, sqlClient.organizationId),
          eq(incidents.sourceType, "monitor"),
          eq(incidents.sourceId, monitorId),
          afterCursor(cursor),
        )
        const rows = yield* sqlClient.query((db) =>
          db
            .select(getTableColumns(incidents))
            .from(incidents)
            .where(where)
            // ended_at DESC defaults to NULLS FIRST in Postgres, so ongoing incidents lead.
            .orderBy(desc(incidents.endedAt), desc(incidents.id))
            .limit(limit + 1),
        )
        return toKeysetPage(rows.map(toDomain), limit)
      }),
    statsByMonitorId: (monitorId) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const where = and(
          eq(incidents.organizationId, sqlClient.organizationId),
          eq(incidents.sourceType, "monitor"),
          eq(incidents.sourceId, monitorId),
        )
        const [aggRows, lastRows] = yield* sqlClient.query((db) => {
          const aggPromise = db
            .select({ total: count(), firstStartedAt: min(incidents.startedAt) })
            .from(incidents)
            .where(where)
          const lastPromise = db
            .select({ id: incidents.id, startedAt: incidents.startedAt, endedAt: incidents.endedAt })
            .from(incidents)
            .where(where)
            .orderBy(desc(incidents.endedAt), desc(incidents.id))
            .limit(1)
          return Promise.all([aggPromise, lastPromise])
        })
        const agg = aggRows[0]
        const last = lastRows[0]
        return {
          total: agg?.total ?? 0,
          firstStartedAt: agg?.firstStartedAt ? new Date(agg.firstStartedAt) : null,
          lastIncidentId: last ? (last.id as AlertIncidentId) : null,
          lastStartedAt: last?.startedAt ? new Date(last.startedAt) : null,
          lastEndedAt: last?.endedAt ? new Date(last.endedAt) : null,
        }
      }),
  })

export const IncidentRepositoryLive = Layer.effect(IncidentRepository, Effect.succeed(makeIncidentRepository()))
