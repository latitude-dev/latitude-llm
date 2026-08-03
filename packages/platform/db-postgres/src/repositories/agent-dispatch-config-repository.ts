import {
  AgentDispatchConfigRepository,
  type AgentDispatchConfigRow,
  type AgentDispatchKind,
} from "@domain/agent-dispatch"
import {
  generateId,
  OrganizationId,
  ProjectId,
  SqlClient,
  type SqlClientShape,
  toRepositoryError,
} from "@domain/shared"
import { and, eq, gte, inArray, isNull, or, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { agentDispatchConfigs } from "../schema/agent-dispatch-configs.ts"
import { agentDispatches } from "../schema/agent-dispatches.ts"
import { projects } from "../schema/projects.ts"

const toDomainConfig = (row: typeof agentDispatchConfigs.$inferSelect): AgentDispatchConfigRow => ({
  id: row.id,
  organizationId: OrganizationId(row.organizationId),
  projectId: row.projectId === null ? null : ProjectId(row.projectId),
  integrationId: row.integrationId,
  kind: row.kind as AgentDispatchKind,
  enabled: row.enabled,
  triggers: row.triggers as AgentDispatchConfigRow["triggers"],
  target: row.target as AgentDispatchConfigRow["target"],
  promptTemplate: row.promptTemplate,
  guardrails: row.guardrails,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export const AgentDispatchConfigRepositoryLive = Layer.succeed(AgentDispatchConfigRepository, {
  listByProjectIncludingDefaults: (projectId) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select()
            .from(agentDispatchConfigs)
            .where(
              and(
                eq(agentDispatchConfigs.organizationId, organizationId),
                or(isNull(agentDispatchConfigs.projectId), eq(agentDispatchConfigs.projectId, projectId)),
              ),
            ),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "listAgentDispatchConfigsIncludingDefaults")))
      return rows.map(toDomainConfig)
    }),

  findDefaultByIntegration: (integrationId) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select()
            .from(agentDispatchConfigs)
            .where(
              and(
                isNull(agentDispatchConfigs.projectId),
                eq(agentDispatchConfigs.integrationId, integrationId),
                eq(agentDispatchConfigs.organizationId, organizationId),
              ),
            )
            .limit(1),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "findDefaultAgentDispatchConfig")))
      return rows[0] ? toDomainConfig(rows[0]) : null
    }),

  countProjectOverrides: (integrationId) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(agentDispatchConfigs)
            // Joined to live projects because nothing cleans these rows up on ProjectDeleted, and
            // the caller's total comes from live projects, so orphans would overshoot it.
            .innerJoin(
              projects,
              and(eq(projects.id, agentDispatchConfigs.projectId), isNull(projects.deletedAt)),
            )
            .where(
              and(
                sql`${agentDispatchConfigs.projectId} is not null`,
                eq(agentDispatchConfigs.integrationId, integrationId),
                eq(agentDispatchConfigs.organizationId, organizationId),
              ),
            ),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "countAgentDispatchProjectOverrides")))
      return rows[0]?.count ?? 0
    }),

  findOverrideByProjectAndIntegration: ({ projectId, integrationId }) =>
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
        .pipe(Effect.mapError((e) => toRepositoryError(e, "findAgentDispatchConfigOverride")))
      return rows[0] ? toDomainConfig(rows[0]) : null
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
              triggers: config.triggers ? [...config.triggers] : null,
              target: config.target as Record<string, unknown> | null,
              promptTemplate: config.promptTemplate,
              guardrails: config.guardrails,
            })
            .onConflictDoUpdate({
              target: agentDispatchConfigs.id,
              set: {
                enabled: config.enabled,
                triggers: config.triggers ? [...config.triggers] : null,
                target: config.target as Record<string, unknown> | null,
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

  countDispatchesInLast24h: ({ configId, projectId }) =>
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
                eq(agentDispatches.projectId, projectId),
                eq(agentDispatches.organizationId, organizationId),
                gte(agentDispatches.claimedAt, since),
                inArray(agentDispatches.status, ["claimed", "dispatched"]),
              ),
            ),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "countAgentDispatches24h")))
      return rows[0]?.count ?? 0
    }),

  hasRecentDispatchForSource: ({ configId, projectId, sourceId, cooldownMinutes }) =>
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
                eq(agentDispatches.projectId, projectId),
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
