import { type AgentDispatchConfig, AgentDispatchConfigRepository, type AgentDispatchKind } from "@domain/agent-dispatch"
import {
  generateId,
  OrganizationId,
  ProjectId,
  SqlClient,
  type SqlClientShape,
  toRepositoryError,
} from "@domain/shared"
import { and, eq, gte, inArray, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { agentDispatchConfigs } from "../schema/agent-dispatch-configs.ts"
import { agentDispatches } from "../schema/agent-dispatches.ts"

const toDomainConfig = (row: typeof agentDispatchConfigs.$inferSelect): AgentDispatchConfig => ({
  id: row.id,
  organizationId: OrganizationId(row.organizationId),
  projectId: ProjectId(row.projectId),
  integrationId: row.integrationId,
  kind: row.kind as AgentDispatchKind,
  enabled: row.enabled,
  triggers: row.triggers as AgentDispatchConfig["triggers"],
  target: row.target as AgentDispatchConfig["target"],
  promptTemplate: row.promptTemplate,
  guardrails: row.guardrails,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export const AgentDispatchConfigRepositoryLive = Layer.succeed(AgentDispatchConfigRepository, {
  listEnabledByProject: (projectId) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select()
            .from(agentDispatchConfigs)
            .where(
              and(
                eq(agentDispatchConfigs.projectId, projectId),
                eq(agentDispatchConfigs.organizationId, organizationId),
                eq(agentDispatchConfigs.enabled, true),
              ),
            ),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "listAgentDispatchConfigs")))
      return rows.map(toDomainConfig)
    }),

  listByProject: (projectId) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select()
            .from(agentDispatchConfigs)
            .where(
              and(
                eq(agentDispatchConfigs.projectId, projectId),
                eq(agentDispatchConfigs.organizationId, organizationId),
              ),
            ),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "listAgentDispatchConfigsByProject")))
      return rows.map(toDomainConfig)
    }),

  findByProjectAndIntegration: ({ projectId, integrationId }) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select()
            .from(agentDispatchConfigs)
            .where(
              and(
                eq(agentDispatchConfigs.projectId, projectId),
                eq(agentDispatchConfigs.integrationId, integrationId),
                eq(agentDispatchConfigs.organizationId, organizationId),
              ),
            )
            .limit(1),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "findAgentDispatchConfigByProjectIntegration")))
      return rows[0] ? toDomainConfig(rows[0]) : null
    }),

  listByOrganization: () =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db.select().from(agentDispatchConfigs).where(eq(agentDispatchConfigs.organizationId, organizationId)),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "listAgentDispatchConfigsByOrg")))
      return rows.map(toDomainConfig)
    }),

  findById: (id) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select()
            .from(agentDispatchConfigs)
            .where(and(eq(agentDispatchConfigs.id, id), eq(agentDispatchConfigs.organizationId, organizationId)))
            .limit(1),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "findAgentDispatchConfig")))
      const row = rows[0]
      if (!row) return yield* Effect.fail(toRepositoryError(new Error("not found"), "findAgentDispatchConfig"))
      return toDomainConfig(row)
    }),

  upsert: (config) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .insert(agentDispatchConfigs)
            .values({
              id: config.id || generateId(),
              organizationId,
              projectId: config.projectId,
              integrationId: config.integrationId,
              kind: config.kind,
              enabled: config.enabled,
              triggers: [...config.triggers],
              target: config.target as Record<string, unknown>,
              promptTemplate: config.promptTemplate,
              guardrails: config.guardrails,
            })
            .onConflictDoUpdate({
              target: agentDispatchConfigs.id,
              set: {
                enabled: config.enabled,
                triggers: [...config.triggers],
                target: config.target as Record<string, unknown>,
                promptTemplate: config.promptTemplate,
                guardrails: config.guardrails,
                updatedAt: new Date(),
              },
            })
            .returning(),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "upsertAgentDispatchConfig")))
      const row = rows[0]
      if (!row) return yield* Effect.fail(toRepositoryError(new Error("empty returning"), "upsertAgentDispatchConfig"))
      return toDomainConfig(row)
    }),

  delete: (id) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      yield* sqlClient
        .query((db, organizationId) =>
          db
            .delete(agentDispatchConfigs)
            .where(and(eq(agentDispatchConfigs.id, id), eq(agentDispatchConfigs.organizationId, organizationId))),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "deleteAgentDispatchConfig")))
    }),

  deleteByIntegrationId: (integrationId) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      yield* sqlClient
        .query((db, organizationId) =>
          db
            .delete(agentDispatchConfigs)
            .where(
              and(
                eq(agentDispatchConfigs.integrationId, integrationId),
                eq(agentDispatchConfigs.organizationId, organizationId),
              ),
            ),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "deleteAgentDispatchConfigsByIntegration")))
    }),

  countDispatchesInLast24h: (configId) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(agentDispatches)
            .where(
              and(
                eq(agentDispatches.configId, configId),
                eq(agentDispatches.organizationId, organizationId),
                gte(agentDispatches.claimedAt, since),
                inArray(agentDispatches.status, ["claimed", "dispatched"]),
              ),
            ),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "countAgentDispatches24h")))
      return rows[0]?.count ?? 0
    }),

  hasRecentDispatchForSource: ({ configId, sourceId, cooldownMinutes }) =>
    Effect.gen(function* () {
      if (cooldownMinutes <= 0) return false
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const since = new Date(Date.now() - cooldownMinutes * 60 * 1000)
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select({ id: agentDispatches.id })
            .from(agentDispatches)
            .where(
              and(
                eq(agentDispatches.configId, configId),
                eq(agentDispatches.sourceId, sourceId),
                eq(agentDispatches.organizationId, organizationId),
                gte(agentDispatches.claimedAt, since),
                inArray(agentDispatches.status, ["claimed", "dispatched"]),
              ),
            )
            .limit(1),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "hasRecentAgentDispatch")))
      return rows.length > 0
    }),
})
