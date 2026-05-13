import { type AlertIncident, AlertIncidentRepository, alertIncidentSchema } from "@domain/alerts"
import { type AlertIncidentId, NotFoundError, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm"
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
            db.select().from(alertIncidents).where(eq(alertIncidents.id, id)).limit(1),
          )
          const row = rows[0]
          if (!row) return yield* new NotFoundError({ entity: "AlertIncident", id })
          return toDomain(row)
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
      listByProjectInRange: ({ organizationId, projectId, from, to, sourceType, sourceId }) =>
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
                  lte(alertIncidents.startedAt, to),
                  or(isNull(alertIncidents.endedAt), gte(alertIncidents.endedAt, from)),
                  sourceType ? eq(alertIncidents.sourceType, sourceType) : undefined,
                  sourceId ? eq(alertIncidents.sourceId, sourceId) : undefined,
                ),
              )
              .orderBy(asc(alertIncidents.startedAt)),
          )
          return rows.map(toDomain)
        }),
    }),
  ),
)
