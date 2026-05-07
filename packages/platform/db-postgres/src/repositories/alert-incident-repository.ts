import { type AlertIncident, AlertIncidentRepository } from "@domain/alerts"
import { SqlClient, type SqlClientShape } from "@domain/shared"
import { and, eq, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { alertIncidents } from "../schema/alert-incidents.ts"

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
})

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
      closeOpen: ({ sourceType, sourceId, kind, endedAt }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db) =>
            db
              .update(alertIncidents)
              .set({ endedAt })
              .where(
                and(
                  eq(alertIncidents.sourceType, sourceType),
                  eq(alertIncidents.sourceId, sourceId),
                  eq(alertIncidents.kind, kind),
                  isNull(alertIncidents.endedAt),
                ),
              ),
          )
        }),
    }),
  ),
)
