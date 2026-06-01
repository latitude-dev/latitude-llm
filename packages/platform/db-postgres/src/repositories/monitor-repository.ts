import { type Monitor, type MonitorAlert, MonitorRepository, monitorSchema } from "@domain/monitors"
import { NotFoundError, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
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
            const itemsPromise = db
              .select()
              .from(monitors)
              .where(where)
              // System monitors land at the top, otherwise newest first.
              .orderBy(desc(monitors.system), desc(monitors.createdAt), asc(monitors.id))
              .limit(limit)
              .offset(offset)
            const totalPromise = db.select({ value: count() }).from(monitors).where(where)
            return Promise.all([itemsPromise, totalPromise])
          })

          const totalCount = Number(totals[0]?.value ?? 0)
          if (rows.length === 0) {
            return { items: [], totalCount, hasMore: false, limit, offset }
          }

          const ids = rows.map((r) => r.id)
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
      updateAlert: ({ alertId, sourceId, condition, severity }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const { organizationId } = sqlClient
          const updated = yield* sqlClient.query((db) =>
            db
              .update(monitorAlerts)
              .set({ sourceId, condition, severity, updatedAt: new Date() })
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
