import { IncidentMonitorReader } from "@domain/notifications"
import { SqlClient, type SqlClientShape } from "@domain/shared"
import { and, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { monitors } from "../schema/monitors.ts"

export const IncidentMonitorReaderLive = Layer.effect(
  IncidentMonitorReader,
  Effect.succeed(
    IncidentMonitorReader.of({
      findByMonitorId: (monitorId) =>
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
              .from(monitors)
              .where(and(eq(monitors.organizationId, sqlClient.organizationId), eq(monitors.id, monitorId)))
              .limit(1),
          )
          const row = rows[0]
          return row ? { monitorId: row.monitorId, slug: row.slug, name: row.name, mutedAt: row.mutedAt } : null
        }),
    }),
  ),
)
