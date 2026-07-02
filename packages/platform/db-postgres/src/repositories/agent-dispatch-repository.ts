import { type AgentDispatch, AgentDispatchRepository } from "@domain/agent-dispatch"
import {
  generateId,
  OrganizationId,
  ProjectId,
  SqlClient,
  type SqlClientShape,
  toRepositoryError,
} from "@domain/shared"
import { and, desc, eq, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { agentDispatches } from "../schema/agent-dispatches.ts"

const toDomainDispatch = (row: typeof agentDispatches.$inferSelect): AgentDispatch => ({
  id: row.id,
  organizationId: OrganizationId(row.organizationId),
  projectId: ProjectId(row.projectId),
  configId: row.configId,
  idempotencyKey: row.idempotencyKey,
  trigger: row.trigger as AgentDispatch["trigger"],
  sourceType: row.sourceType as AgentDispatch["sourceType"],
  sourceId: row.sourceId,
  claimedAt: row.claimedAt,
  dispatchedAt: row.dispatchedAt,
  externalAgentId: row.externalAgentId,
  externalRunId: row.externalRunId,
  externalUrl: row.externalUrl,
  status: row.status as AgentDispatch["status"],
  errorCategory: row.errorCategory as AgentDispatch["errorCategory"],
  errorDetail: row.errorDetail,
})

export const AgentDispatchRepositoryLive = Layer.succeed(AgentDispatchRepository, {
  claim: ({ configId, projectId, idempotencyKey, trigger, sourceType, sourceId }) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .insert(agentDispatches)
            .values({
              id: generateId(),
              organizationId,
              projectId,
              configId,
              idempotencyKey,
              trigger,
              sourceType,
              sourceId,
              status: "claimed",
            })
            .onConflictDoNothing({ target: [agentDispatches.organizationId, agentDispatches.idempotencyKey] })
            .returning({ id: agentDispatches.id }),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "claimAgentDispatch")))

      if (rows.length > 0) return { claimed: true, dispatchId: rows[0]!.id }

      const existing = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select({ id: agentDispatches.id, status: agentDispatches.status })
            .from(agentDispatches)
            .where(
              and(
                eq(agentDispatches.organizationId, organizationId),
                eq(agentDispatches.idempotencyKey, idempotencyKey),
              ),
            )
            .limit(1),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "findAgentDispatchClaim")))

      const row = existing[0]
      if (row?.status === "claimed") return { claimed: true, dispatchId: row.id }
      return { claimed: false, dispatchId: null }
    }),

  markDispatched: ({ dispatchId, externalAgentId, externalRunId, externalUrl }) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .update(agentDispatches)
            .set({
              status: "dispatched",
              dispatchedAt: new Date(),
              externalAgentId: externalAgentId ?? null,
              externalRunId: externalRunId ?? null,
              externalUrl: externalUrl ?? null,
            })
            .where(
              and(
                eq(agentDispatches.id, dispatchId),
                eq(agentDispatches.organizationId, organizationId),
                isNull(agentDispatches.dispatchedAt),
              ),
            )
            .returning({ id: agentDispatches.id }),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "markAgentDispatchDispatched")))
      return rows.length > 0
    }),

  markFailed: ({ dispatchId, errorCategory, errorDetail }) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .update(agentDispatches)
            .set({
              status: "failed",
              errorCategory,
              errorDetail,
            })
            .where(and(eq(agentDispatches.id, dispatchId), eq(agentDispatches.organizationId, organizationId)))
            .returning({ id: agentDispatches.id }),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "markAgentDispatchFailed")))
      return rows.length > 0
    }),

  listByProject: (projectId) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select()
            .from(agentDispatches)
            .where(and(eq(agentDispatches.projectId, projectId), eq(agentDispatches.organizationId, organizationId)))
            .orderBy(desc(agentDispatches.claimedAt))
            .limit(100),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "listAgentDispatches")))
      return rows.map(toDomainDispatch)
    }),
})
