import {
  type Monitor,
  type MonitorAlert,
  type MonitorLastIncident,
  MonitorRepository,
  monitorSchema,
} from "@domain/monitors"
import { NotFoundError, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, asc, count, desc, eq, getTableColumns, ilike, inArray, isNull, max, ne, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { alertIncidents } from "../schema/alert-incidents.ts"
import { monitorAlerts } from "../schema/monitor-alerts.ts"
import { monitors } from "../schema/monitors.ts"

const toMonitorAlert = (row: typeof monitorAlerts.$inferSelect): MonitorAlert => ({
  id: row.id as MonitorAlert["id"],
  monitorId: row.monitorId as MonitorAlert["monitorId"],
  kind: row.kind,
  source: { type: row.sourceType, id: row.sourceId ?? null },
  condition: row.condition ?? null,
  severity: row.severity,
  createdAt: row.createdAt,
})

const toMonitor = (row: typeof monitors.$inferSelect, alerts: readonly MonitorAlert[]): Monitor =>
  monitorSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    system: row.system,
    alerts,
    mutedAt: row.mutedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const toMonitorRow = (monitor: Monitor): typeof monitors.$inferInsert => ({
  id: monitor.id,
  organizationId: monitor.organizationId,
  projectId: monitor.projectId,
  slug: monitor.slug,
  name: monitor.name,
  description: monitor.description,
  system: monitor.system,
  mutedAt: monitor.mutedAt,
  deletedAt: monitor.deletedAt,
  createdAt: monitor.createdAt,
  updatedAt: monitor.updatedAt,
})

const toMonitorAlertRow = (
  alert: MonitorAlert,
  organizationId: Monitor["organizationId"],
): typeof monitorAlerts.$inferInsert => ({
  id: alert.id,
  organizationId,
  monitorId: alert.monitorId,
  kind: alert.kind,
  sourceType: alert.source.type,
  sourceId: alert.source.id,
  condition: alert.condition,
  severity: alert.severity,
  createdAt: alert.createdAt,
})

const groupAlertsByMonitorId = (
  rows: readonly (typeof monitorAlerts.$inferSelect)[],
): ReadonlyMap<string, readonly MonitorAlert[]> => {
  const result = new Map<string, MonitorAlert[]>()
  for (const row of rows) {
    const list = result.get(row.monitorId) ?? []
    list.push(toMonitorAlert(row))
    result.set(row.monitorId, list)
  }
  return result
}

export const MonitorRepositoryLive = Layer.effect(
  MonitorRepository,
  Effect.succeed(
    MonitorRepository.of({
      findById: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const { organizationId } = sqlClient
          const [monitorRows, alertRows] = yield* sqlClient.query(async (db) => {
            const monitorPromise = db
              .select()
              .from(monitors)
              .where(and(eq(monitors.organizationId, organizationId), eq(monitors.id, id), isNull(monitors.deletedAt)))
              .limit(1)
            const alertsPromise = db
              .select()
              .from(monitorAlerts)
              .where(
                and(
                  eq(monitorAlerts.organizationId, organizationId),
                  eq(monitorAlerts.monitorId, id),
                  isNull(monitorAlerts.deletedAt),
                ),
              )
            return Promise.all([monitorPromise, alertsPromise])
          })
          const row = monitorRows[0]
          if (!row) return yield* new NotFoundError({ entity: "Monitor", id })
          return toMonitor(row, alertRows.map(toMonitorAlert))
        }),
      findBySlug: ({ projectId, slug }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const { organizationId } = sqlClient
          const monitorRows = yield* sqlClient.query((db) =>
            db
              .select()
              .from(monitors)
              .where(
                and(
                  eq(monitors.organizationId, organizationId),
                  eq(monitors.projectId, projectId),
                  eq(monitors.slug, slug),
                  isNull(monitors.deletedAt),
                ),
              )
              .limit(1),
          )
          const row = monitorRows[0]
          if (!row) return yield* new NotFoundError({ entity: "Monitor", id: slug })
          const alertRows = yield* sqlClient.query((db) =>
            db
              .select()
              .from(monitorAlerts)
              .where(
                and(
                  eq(monitorAlerts.organizationId, organizationId),
                  eq(monitorAlerts.monitorId, row.id),
                  isNull(monitorAlerts.deletedAt),
                ),
              ),
          )
          return toMonitor(row, alertRows.map(toMonitorAlert))
        }),
      list: ({ projectId, limit, offset, searchQuery }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const { organizationId } = sqlClient
          const where = and(
            eq(monitors.organizationId, organizationId),
            eq(monitors.projectId, projectId),
            isNull(monitors.deletedAt),
            searchQuery ? ilike(monitors.name, `%${searchQuery}%`) : undefined,
          )

          const [rows, totals] = yield* sqlClient.query(async (db) => {
            const lastIncident = db
              .select({
                monitorId: monitorAlerts.monitorId,
                lastStartedAt: max(alertIncidents.startedAt).as("last_started_at"),
              })
              .from(alertIncidents)
              .innerJoin(monitorAlerts, eq(monitorAlerts.id, alertIncidents.monitorAlertId))
              .groupBy(monitorAlerts.monitorId)
              .as("last_incident")

            const itemsPromise = db
              .select(getTableColumns(monitors))
              .from(monitors)
              .leftJoin(lastIncident, eq(lastIncident.monitorId, monitors.id))
              .where(where)
              .orderBy(sql`${lastIncident.lastStartedAt} desc nulls last`, desc(monitors.createdAt), asc(monitors.id))
              .limit(limit)
              .offset(offset)
            const totalPromise = db.select({ value: count() }).from(monitors).where(where)
            return Promise.all([itemsPromise, totalPromise])
          })

          const totalCount = Number(totals[0]?.value ?? 0)
          if (rows.length === 0) {
            return { items: [], lastIncidentByMonitorId: new Map(), totalCount, hasMore: false, limit, offset }
          }

          const ids = rows.map((r) => r.id)

          // Ordered so the first row per monitor is the latest; deduped in JS (DISTINCT ON isn't ergonomic via the query builder).
          const incidentRows = yield* sqlClient.query((db) =>
            db
              .select({
                monitorId: monitorAlerts.monitorId,
                startedAt: alertIncidents.startedAt,
                endedAt: alertIncidents.endedAt,
              })
              .from(alertIncidents)
              .innerJoin(monitorAlerts, eq(monitorAlerts.id, alertIncidents.monitorAlertId))
              .where(and(eq(alertIncidents.organizationId, organizationId), inArray(monitorAlerts.monitorId, ids)))
              .orderBy(asc(monitorAlerts.monitorId), desc(alertIncidents.startedAt), desc(alertIncidents.id)),
          )
          const lastIncidentByMonitorId = new Map<string, MonitorLastIncident>()
          for (const row of incidentRows) {
            if (!lastIncidentByMonitorId.has(row.monitorId)) {
              lastIncidentByMonitorId.set(row.monitorId, { startedAt: row.startedAt, endedAt: row.endedAt })
            }
          }

          const alertRows = yield* sqlClient.query((db) =>
            db
              .select()
              .from(monitorAlerts)
              .where(
                and(
                  eq(monitorAlerts.organizationId, organizationId),
                  inArray(monitorAlerts.monitorId, ids),
                  isNull(monitorAlerts.deletedAt),
                ),
              )
              .orderBy(asc(monitorAlerts.createdAt), asc(monitorAlerts.id)),
          )
          const alertsByMonitorId = groupAlertsByMonitorId(alertRows)

          const items = rows.map((row) => toMonitor(row, alertsByMonitorId.get(row.id) ?? []))

          return {
            items,
            lastIncidentByMonitorId,
            totalCount,
            hasMore: offset + rows.length < totalCount,
            limit,
            offset,
          }
        }),
      provisionSystemMonitors: (monitorsToProvision) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          // One transaction for the whole set. Each monitor inserts only when no
          // live `(project_id, slug)` row exists — `onConflictDoNothing` against
          // the partial unique index makes re-runs (and concurrent provisioners)
          // no-op. Alerts are inserted only for monitors we actually created.
          return yield* sqlClient.query(async (db) => {
            const inserted: Monitor[] = []
            for (const monitor of monitorsToProvision) {
              const created = await db
                .insert(monitors)
                .values(toMonitorRow(monitor))
                .onConflictDoNothing({
                  target: [monitors.projectId, monitors.slug],
                  where: sql`deleted_at IS NULL`,
                })
                .returning({ id: monitors.id })
              if (created.length === 0) continue
              if (monitor.alerts.length > 0) {
                await db
                  .insert(monitorAlerts)
                  .values(monitor.alerts.map((alert) => toMonitorAlertRow(alert, monitor.organizationId)))
              }
              inserted.push(monitor)
            }
            return inserted
          })
        }),
      resetSystemMonitors: (monitorsToReset) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          // Filters by the entity's projectId (NOT sqlClient.organizationId): this
          // runs from the admin/"system" RLS-off context. One transaction.
          return yield* sqlClient.query(async (db) => {
            const now = new Date()
            const reset: Monitor[] = []
            for (const monitor of monitorsToReset) {
              const existing = await db
                .select({ id: monitors.id, system: monitors.system })
                .from(monitors)
                .where(
                  and(
                    eq(monitors.projectId, monitor.projectId),
                    eq(monitors.slug, monitor.slug),
                    isNull(monitors.deletedAt),
                  ),
                )
                .limit(1)
              const existingRow = existing[0]
              // Don't clobber a user monitor that happens to hold a system slug.
              if (existingRow && !existingRow.system) continue

              const effectiveId = existingRow?.id ?? monitor.id
              if (existingRow) {
                await db
                  .update(monitors)
                  .set({ name: monitor.name, description: monitor.description, updatedAt: now })
                  .where(eq(monitors.id, effectiveId))
              } else {
                await db.insert(monitors).values(toMonitorRow(monitor))
              }

              // Reset alerts: soft-delete the live ones (keeps the incident→alert
              // join resolvable) and insert fresh from the definition.
              await db
                .update(monitorAlerts)
                .set({ deletedAt: now })
                .where(and(eq(monitorAlerts.monitorId, effectiveId), isNull(monitorAlerts.deletedAt)))
              if (monitor.alerts.length > 0) {
                await db.insert(monitorAlerts).values(
                  monitor.alerts.map((alert) => ({
                    ...toMonitorAlertRow(alert, monitor.organizationId),
                    monitorId: effectiveId,
                  })),
                )
              }
              reset.push(monitor)
            }
            return reset
          })
        }),
      create: (monitor) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          // Monitor + its alerts in one transactional callback so a partially
          // created monitor never lands.
          yield* sqlClient.query(async (db) => {
            await db.insert(monitors).values(toMonitorRow(monitor))
            if (monitor.alerts.length > 0) {
              await db
                .insert(monitorAlerts)
                .values(monitor.alerts.map((alert) => toMonitorAlertRow(alert, monitor.organizationId)))
            }
          })
        }),
      insertAlert: (alert) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const { organizationId } = sqlClient
          yield* sqlClient.query((db) => db.insert(monitorAlerts).values(toMonitorAlertRow(alert, organizationId)))
        }),
      softDeleteAlert: (alertId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const { organizationId } = sqlClient
          const updated = yield* sqlClient.query((db) =>
            db
              .update(monitorAlerts)
              .set({ deletedAt: new Date() })
              .where(
                and(
                  eq(monitorAlerts.organizationId, organizationId),
                  eq(monitorAlerts.id, alertId),
                  isNull(monitorAlerts.deletedAt),
                ),
              )
              .returning({ id: monitorAlerts.id }),
          )
          if (updated.length === 0) return yield* new NotFoundError({ entity: "MonitorAlert", id: alertId })
        }),
      setMuted: ({ id, mutedAt }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const { organizationId } = sqlClient
          const updated = yield* sqlClient.query((db) =>
            db
              .update(monitors)
              .set({ mutedAt, updatedAt: new Date() })
              .where(and(eq(monitors.organizationId, organizationId), eq(monitors.id, id), isNull(monitors.deletedAt)))
              .returning({ id: monitors.id }),
          )
          if (updated.length === 0) return yield* new NotFoundError({ entity: "Monitor", id })
        }),
      softDelete: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const { organizationId } = sqlClient
          // Monitor + its live alerts in one transaction: the alert cascade stops
          // firing (active-alert reads filter deleted_at), while the incident→alert
          // join (which ignores deleted_at) keeps history attributable.
          const deleted = yield* sqlClient.query(async (db) => {
            const now = new Date()
            const rows = await db
              .update(monitors)
              .set({ deletedAt: now, updatedAt: now })
              .where(and(eq(monitors.organizationId, organizationId), eq(monitors.id, id), isNull(monitors.deletedAt)))
              .returning({ id: monitors.id })
            if (rows.length > 0) {
              await db
                .update(monitorAlerts)
                .set({ deletedAt: now })
                .where(
                  and(
                    eq(monitorAlerts.organizationId, organizationId),
                    eq(monitorAlerts.monitorId, id),
                    isNull(monitorAlerts.deletedAt),
                  ),
                )
            }
            return rows
          })
          if (deleted.length === 0) return yield* new NotFoundError({ entity: "Monitor", id })
        }),
      updateMetadata: ({ id, name, slug, description }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const { organizationId } = sqlClient
          const updated = yield* sqlClient.query((db) =>
            db
              .update(monitors)
              .set({ name, slug, description, updatedAt: new Date() })
              .where(and(eq(monitors.organizationId, organizationId), eq(monitors.id, id), isNull(monitors.deletedAt)))
              .returning({ id: monitors.id }),
          )
          if (updated.length === 0) return yield* new NotFoundError({ entity: "Monitor", id })
        }),
      updateAlert: ({ alertId, kind, sourceId, condition, severity }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const { organizationId } = sqlClient
          // `sourceType` is omitted: the only mutable (saved-search) kinds all share the `savedSearch` source type.
          const updated = yield* sqlClient.query((db) =>
            db
              .update(monitorAlerts)
              .set({ kind, sourceId, condition, severity, updatedAt: new Date() })
              .where(
                and(
                  eq(monitorAlerts.organizationId, organizationId),
                  eq(monitorAlerts.id, alertId),
                  isNull(monitorAlerts.deletedAt),
                ),
              )
              .returning({ id: monitorAlerts.id }),
          )
          if (updated.length === 0) return yield* new NotFoundError({ entity: "MonitorAlert", id: alertId })
        }),
      countActiveBySlug: ({ projectId, slug, excludeId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const { organizationId } = sqlClient
          const rows = yield* sqlClient.query((db) =>
            db
              .select({ value: count() })
              .from(monitors)
              .where(
                and(
                  eq(monitors.organizationId, organizationId),
                  eq(monitors.projectId, projectId),
                  eq(monitors.slug, slug),
                  ne(monitors.id, excludeId),
                  isNull(monitors.deletedAt),
                ),
              ),
          )
          return Number(rows[0]?.value ?? 0)
        }),
    }),
  ),
)
