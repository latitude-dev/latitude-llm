import {
  type AlertIncident,
  type AlertIncidentCursor,
  type AlertIncidentListPage,
  AlertIncidentRepository,
  alertIncidentSchema,
} from "@domain/alerts"
import { type AlertIncidentId, NotFoundError, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, asc, desc, eq, getTableColumns, gte, inArray, isNull, lt, lte, or, type SQL } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { alertIncidents } from "../schema/alert-incidents.ts"
import { monitorAlerts } from "../schema/monitor-alerts.ts"

/**
 * Keyset predicate for the `(started_at DESC, id DESC)` order: rows strictly
 * after `cursor`. `undefined` cursor → no predicate (first page).
 */
const afterCursor = (cursor: AlertIncidentCursor | undefined): SQL | undefined =>
  cursor
    ? or(
        lt(alertIncidents.startedAt, cursor.startedAt),
        and(eq(alertIncidents.startedAt, cursor.startedAt), lt(alertIncidents.id, cursor.id)),
      )
    : undefined

/** Trim the `limit + 1` probe row, deriving `hasMore` + `nextCursor` from the last kept incident. */
const toKeysetPage = (rows: readonly AlertIncident[], limit: number): AlertIncidentListPage => {
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items[items.length - 1]
  return { items, hasMore, nextCursor: hasMore && last ? { startedAt: last.startedAt, id: last.id } : null }
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
              .orderBy(desc(alertIncidents.startedAt), desc(alertIncidents.id))
              .limit(limit + 1),
          )
          return toKeysetPage(rows.map(toDomain), limit)
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
              .orderBy(desc(alertIncidents.startedAt), desc(alertIncidents.id))
              .limit(limit + 1),
          )
          return toKeysetPage(rows.map(toDomain), limit)
        }),
    }),
  ),
)
