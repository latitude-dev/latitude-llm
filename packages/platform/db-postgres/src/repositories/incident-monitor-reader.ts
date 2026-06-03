import { IncidentMonitorReader } from "@domain/notifications"
import { SqlClient, type SqlClientShape } from "@domain/shared"
import { and, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { monitorAlerts } from "../schema/monitor-alerts.ts"
import { monitors } from "../schema/monitors.ts"

/** Joins `monitor_alerts` → `monitors`. No `deleted_at` filter — the alert must resolve even after soft-delete so history stays attributable. */
export const IncidentMonitorReaderLive = Layer.effect(
  IncidentMonitorReader,
  Effect.succeed(
    IncidentMonitorReader.of({
      findByAlertId: (monitorAlertId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db
              .select({
                monitorId: monitors.id,
                slug: monitors.slug,
                name: monitors.name,
                mutedAt: monitors.mutedAt,
              })
              .from(monitorAlerts)
              .innerJoin(monitors, eq(monitors.id, monitorAlerts.monitorId))
              .where(
                and(eq(monitorAlerts.organizationId, sqlClient.organizationId), eq(monitorAlerts.id, monitorAlertId)),
              )
              .limit(1),
          )
          const row = rows[0]
          return row ? { monitorId: row.monitorId, slug: row.slug, name: row.name, mutedAt: row.mutedAt } : null
        }),
    }),
  ),
)
