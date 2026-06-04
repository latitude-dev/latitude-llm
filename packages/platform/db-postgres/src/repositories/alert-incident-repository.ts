import {
  type AlertIncident,
  type AlertIncidentCursor,
  type AlertIncidentListPage,
  AlertIncidentRepository,
  alertIncidentSchema,
} from "@domain/alerts"
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
import { monitorAlerts } from "../schema/monitor-alerts.ts"

/** Keyset predicate for `ended_at DESC NULLS FIRST, id DESC`: a null `endedAt` cursor is still inside the ongoing block (remaining ongoing rows + all closed rows); a non-null cursor compares closed rows on `(ended_at, id)`. */
const afterCursor = (cursor: AlertIncidentCursor | undefined): SQL | undefined => {
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
const toKeysetPage = (rows: readonly AlertIncident[], limit: number): AlertIncidentListPage => {
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items[items.length - 1]
  return { items, hasMore, nextCursor: hasMore && last ? { endedAt: last.endedAt, id: last.id } : null }
}

const toInsertRow = (incident: AlertIncident): typeof alertIncidents.$inferInsert => ({
  id: incident.id,
  organizationId: incident.organizationId,
  projectId: incident.projectId,
  sourceType: incident.sourceType,
  sourceId: incident.sourceId,
  kind: incident.kind,
  severity: incident.severity,
  startedAt: incident.startedAt,
  endedAt: incident.endedAt,
  createdAt: incident.createdAt,
  entrySignals: incident.entrySignals,
  exitEligibleSince: incident.exitEligibleSince,
  monitorAlertId: incident.monitorAlertId,
  condition: incident.condition,
})

const toDomain = (row: typeof alertIncidents.$inferSelect): AlertIncident => alertIncidentSchema.parse(row)

export const AlertIncidentRepositoryLive = Layer.effect(
  AlertIncidentRepository,
  Effect.succeed(
    AlertIncidentRepository.of({
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
          if (!row) return yield* new NotFoundError({ entity: "AlertIncident", id })
          return toDomain(row)
        }),
      findOpen: ({ sourceType, sourceId, kind }) =>
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
                  eq(alertIncidents.kind, kind),
                  isNull(alertIncidents.endedAt),
                ),
              )
              .limit(1),
          )
          const row = rows[0]
          return row ? toDomain(row) : null
        }),
      closeOpen: ({ sourceType, sourceId, kind, endedAt }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          // RETURNING the id lets the caller (close use case) emit the
          // `IncidentClosed` outbox event with a stable identifier instead
          // of having to re-query for the freshly-closed row.
          const rows = yield* sqlClient.query((db) =>
            db
              .update(alertIncidents)
              .set({ endedAt })
              .where(
                and(
                  eq(alertIncidents.organizationId, sqlClient.organizationId),
                  eq(alertIncidents.sourceType, sourceType),
                  eq(alertIncidents.sourceId, sourceId),
                  eq(alertIncidents.kind, kind),
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
      findOpenByMonitorAlertId: (monitorAlertId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db
              .select()
              .from(alertIncidents)
              .where(
                and(
                  eq(alertIncidents.organizationId, sqlClient.organizationId),
                  eq(alertIncidents.monitorAlertId, monitorAlertId),
                  isNull(alertIncidents.endedAt),
                ),
              )
              .limit(1),
          )
          const row = rows[0]
          return row ? toDomain(row) : null
        }),
      existsByMonitorAlertId: (monitorAlertId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db
              .select({ id: alertIncidents.id })
              .from(alertIncidents)
              .where(
                and(
                  eq(alertIncidents.organizationId, sqlClient.organizationId),
                  eq(alertIncidents.monitorAlertId, monitorAlertId),
                ),
              )
              .limit(1),
          )
          return rows.length > 0
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
      listByProjectId: ({ organizationId, projectId, from, to, sourceTypes, sourceId, kinds, severities }) =>
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
                  kinds && kinds.length > 0 ? inArray(alertIncidents.kind, kinds) : undefined,
                  severities && severities.length > 0 ? inArray(alertIncidents.severity, severities) : undefined,
                ),
              )
              .orderBy(asc(alertIncidents.startedAt)),
          )
          return rows.map(toDomain)
        }),
      listOpenByKind: (kind) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db
              .select()
              .from(alertIncidents)
              .where(and(eq(alertIncidents.kind, kind), isNull(alertIncidents.endedAt)))
              .orderBy(asc(alertIncidents.startedAt)),
          )
          return rows.map(toDomain)
        }),
      listByMonitorId: ({ monitorId, limit, cursor }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          // Join through monitor_alerts (the monitor isn't denormalised). No
          // deleted_at filter: incidents from removed alerts must still show.
          const where = and(
            eq(alertIncidents.organizationId, sqlClient.organizationId),
            eq(monitorAlerts.monitorId, monitorId),
            afterCursor(cursor),
          )
          const rows = yield* sqlClient.query((db) =>
            db
              .select(getTableColumns(alertIncidents))
              .from(alertIncidents)
              .innerJoin(monitorAlerts, eq(monitorAlerts.id, alertIncidents.monitorAlertId))
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
          // No deleted_at filter: soft-deleted alerts still count toward history.
          const where = and(
            eq(alertIncidents.organizationId, sqlClient.organizationId),
            eq(monitorAlerts.monitorId, monitorId),
          )
          const [aggRows, lastRows] = yield* sqlClient.query((db) => {
            const aggPromise = db
              .select({ total: count(), firstStartedAt: min(alertIncidents.startedAt) })
              .from(alertIncidents)
              .innerJoin(monitorAlerts, eq(monitorAlerts.id, alertIncidents.monitorAlertId))
              .where(where)
            // The "last incident" is the same ongoing-first row as `listByMonitorId`, not
            // the latest-started one. We surface both ends: `ended_at` is "last detected at"
            // (the close time), `started_at` is the fallback while it's still ongoing.
            const lastPromise = db
              .select({ startedAt: alertIncidents.startedAt, endedAt: alertIncidents.endedAt })
              .from(alertIncidents)
              .innerJoin(monitorAlerts, eq(monitorAlerts.id, alertIncidents.monitorAlertId))
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
            lastStartedAt: last?.startedAt ? new Date(last.startedAt) : null,
            lastEndedAt: last?.endedAt ? new Date(last.endedAt) : null,
          }
        }),
      listByMonitorAlertId: ({ monitorAlertId, limit, cursor }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const where = and(
            eq(alertIncidents.organizationId, sqlClient.organizationId),
            eq(alertIncidents.monitorAlertId, monitorAlertId),
            afterCursor(cursor),
          )
          const rows = yield* sqlClient.query((db) =>
            db
              .select()
              .from(alertIncidents)
              .where(where)
              .orderBy(desc(alertIncidents.endedAt), desc(alertIncidents.id))
              .limit(limit + 1),
          )
          return toKeysetPage(rows.map(toDomain), limit)
        }),
    }),
  ),
)
