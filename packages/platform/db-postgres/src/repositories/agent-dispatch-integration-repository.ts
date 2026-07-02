import {
  type AgentDispatchIntegration,
  AgentDispatchIntegrationConflictError,
  AgentDispatchIntegrationRepository,
  type AgentDispatchKind,
} from "@domain/agent-dispatch"
import { generateId, OrganizationId, SqlClient, type SqlClientShape, toRepositoryError, UserId } from "@domain/shared"
import { and, eq, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { integrations } from "../schema/integrations.ts"

const toDomain = (row: typeof integrations.$inferSelect): AgentDispatchIntegration => ({
  id: row.id,
  organizationId: OrganizationId(row.organizationId),
  kind: row.kind as AgentDispatchKind,
  vendorAccountId: row.vendorAccountId,
  installedByUserId: row.installedByUserId,
  installedAt: row.installedAt,
  revokedAt: row.revokedAt,
})

export const AgentDispatchIntegrationRepositoryLive = Layer.succeed(AgentDispatchIntegrationRepository, {
  findActiveByKind: (kind) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select()
            .from(integrations)
            .where(
              and(
                eq(integrations.organizationId, organizationId),
                eq(integrations.kind, kind),
                isNull(integrations.revokedAt),
              ),
            )
            .limit(1),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "findAgentDispatchIntegration")))
      return rows[0] ? toDomain(rows[0]) : null
    }),

  install: ({ kind, vendorAccountId, installedByUserId }) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .insert(integrations)
            .values({
              id: generateId(),
              organizationId,
              kind,
              vendorAccountId,
              installedByUserId: UserId(installedByUserId),
            })
            .returning(),
        )
        .pipe(
          Effect.mapError((e) => {
            if (String(e).includes("unique") || String(e).includes("duplicate")) {
              return new AgentDispatchIntegrationConflictError({ kind, vendorAccountId })
            }
            return toRepositoryError(e, "installAgentDispatchIntegration")
          }),
        )
      return toDomain(rows[0]!)
    }),

  revoke: (integrationId) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      yield* sqlClient
        .query((db, organizationId) =>
          db
            .update(integrations)
            .set({ revokedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(integrations.id, integrationId), eq(integrations.organizationId, organizationId))),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "revokeAgentDispatchIntegration")))
    }),
})
