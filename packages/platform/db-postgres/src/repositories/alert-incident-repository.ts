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
import { alertIncidents } from "../schema/alert-incidents.ts"

/** Keyset predicate for `ended_at DESC NULLS FIRST, id DESC`: a null `endedAt` cursor is still inside the ongoing block (remaining ongoing rows + all closed rows); a non-null cursor compares closed rows on `(ended_at, id)`. */
const afterCursor = (cursor: IncidentCursor | undefined): SQL | undefined => {
  if (!cursor) return undefined
  if (cursor.endedAt === null) {
    return or(and(isNull(alertIncidents.endedAt), lt(alertIncidents.id, cursor.id)), isNotNull(alertIncidents.endedAt))
  }
  return or(
    lt(alertIncidents.endedAt, cursor.endedAt),
    and(eq(alertIncidents.endedAt, cursor.endedAt), lt(alertIncidents.id, cursor.id)),
  )
}

/** Trim the `limit + 1` probe row, deriving `hasMore` + `nextCursor` from the last kept incident. */
const toKeysetPage = (rows: readonly Incident[], limit: number): IncidentListPage => {
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items[items.length - 1]
  return { items, hasMore, nextCursor: hasMore && last ? { endedAt: last.endedAt, id: last.id } : null }
}

const toInsertRow = (incident: Incident): typeof alertIncidents.$inferInsert => ({
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

const toDomain = (row: typeof alertIncidents.$inferSelect): Incident => incidentSchema.parse(row)

const makeIncidentRepository = (): IncidentRepositoryShape =>
  IncidentRepository.of({
    insert: (incident) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const row = toInsertRow(incident)
        yield* sqlClient.query((db) => db.insert(alertIncidents).values(row))
      }),
    findById: (id) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const rows = yield* sqlClient.query((db) =>
          db
            .select()
            .from(alertIncidents)
            .where(and(eq(alertIncidents.id, id), eq(alertIncidents.organizationId, sqlClient.organizationId)))
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
            .from(alertIncidents)
            .where(
              and(
                eq(alertIncidents.organizationId, sqlClient.organizationId),
                eq(alertIncidents.sourceType, sourceType),
                eq(alertIncidents.sourceId, sourceId),
                isNull(alertIncidents.endedAt),
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
            .update(alertIncidents)
            .set({ endedAt })
            .where(
              and(
                eq(alertIncidents.organizationId, sqlClient.organizationId),
                eq(alertIncidents.sourceType, sourceType),
                eq(alertIncidents.sourceId, sourceId),
                isNull(alertIncidents.endedAt),
              ),
            )
            .returning({ id: alertIncidents.id }),
        )
        const closedId = rows[0]?.id
        return closedId ? (closedId as AlertIncidentId) : null
      }),
    updateExitDwell: ({ id, exitEligibleSince }) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        yield* sqlClient.query((db) =>
          db
            .update(alertIncidents)
            .set({ exitEligibleSince })
            .where(and(eq(alertIncidents.id, id), eq(alertIncidents.organizationId, sqlClient.organizationId))),
        )
      }),
    setEndedAt: ({ id, endedAt }) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        yield* sqlClient.query((db) =>
          db
            .update(alertIncidents)
            .set({ endedAt })
            .where(and(eq(alertIncidents.id, id), eq(alertIncidents.organizationId, sqlClient.organizationId))),
        )
      }),
    closeById: ({ id, endedAt }) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const rows = yield* sqlClient.query((db) =>
          db
            .update(alertIncidents)
            .set({ endedAt })
            .where(
              and(
                eq(alertIncidents.id, id),
                eq(alertIncidents.organizationId, sqlClient.organizationId),
                isNull(alertIncidents.endedAt),
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
            .from(alertIncidents)
            .where(
              and(
                eq(alertIncidents.organizationId, organizationId),
                eq(alertIncidents.projectId, projectId),
                to ? lte(alertIncidents.startedAt, to) : undefined,
                from ? or(isNull(alertIncidents.endedAt), gte(alertIncidents.endedAt, from)) : undefined,
                sourceTypes && sourceTypes.length > 0 ? inArray(alertIncidents.sourceType, sourceTypes) : undefined,
                sourceId ? eq(alertIncidents.sourceId, sourceId) : undefined,
                severities && severities.length > 0 ? inArray(alertIncidents.severity, severities) : undefined,
              ),
            )
            .orderBy(asc(alertIncidents.startedAt)),
        )
        return rows.map(toDomain)
      }),
    listOpenBySourceType: (sourceType) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const rows = yield* sqlClient.query((db) =>
          db
            .select()
            .from(alertIncidents)
            .where(and(eq(alertIncidents.sourceType, sourceType), isNull(alertIncidents.endedAt)))
            .orderBy(asc(alertIncidents.startedAt)),
        )
        return rows.map(toDomain)
      }),
    listByMonitorId: ({ monitorId, limit, cursor }) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const where = and(
          eq(alertIncidents.organizationId, sqlClient.organizationId),
          eq(alertIncidents.sourceType, "monitor"),
          eq(alertIncidents.sourceId, monitorId),
          afterCursor(cursor),
        )
        const rows = yield* sqlClient.query((db) =>
          db
            .select(getTableColumns(alertIncidents))
            .from(alertIncidents)
            .where(where)
            // ended_at DESC defaults to NULLS FIRST in Postgres, so ongoing incidents lead.
            .orderBy(desc(alertIncidents.endedAt), desc(alertIncidents.id))
            .limit(limit + 1),
        )
        return toKeysetPage(rows.map(toDomain), limit)
      }),
    statsByMonitorId: (monitorId) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const where = and(
          eq(alertIncidents.organizationId, sqlClient.organizationId),
          eq(alertIncidents.sourceType, "monitor"),
          eq(alertIncidents.sourceId, monitorId),
        )
        const [aggRows, lastRows] = yield* sqlClient.query((db) => {
          const aggPromise = db
            .select({ total: count(), firstStartedAt: min(alertIncidents.startedAt) })
            .from(alertIncidents)
            .where(where)
          const lastPromise = db
            .select({ id: alertIncidents.id, startedAt: alertIncidents.startedAt, endedAt: alertIncidents.endedAt })
            .from(alertIncidents)
            .where(where)
            .orderBy(desc(alertIncidents.endedAt), desc(alertIncidents.id))
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
