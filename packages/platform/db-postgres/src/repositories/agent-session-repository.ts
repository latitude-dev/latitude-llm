import { type AgentSession, AgentSessionNotFoundError, AgentSessionRepository } from "@domain/agent"
import { AgentSessionId, OrganizationId, ProjectId, SqlClient, type SqlClientShape, UserId } from "@domain/shared"
import { and, desc, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { agentSessions } from "../schema/agent-sessions.ts"

const toAgentSession = (row: typeof agentSessions.$inferSelect): AgentSession => ({
  id: AgentSessionId(row.id),
  organizationId: OrganizationId(row.organizationId),
  userId: UserId(row.userId),
  projectId: row.projectId ? ProjectId(row.projectId) : null,
  title: row.title ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export const AgentSessionRepositoryLive = Layer.effect(
  AgentSessionRepository,
  Effect.gen(function* () {
    return {
      create: (args) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient.query((db) =>
            db
              .insert(agentSessions)
              .values({
                ...(args.id ? { id: args.id } : {}),
                organizationId: sqlClient.organizationId,
                userId: args.userId,
                projectId: args.projectId ?? undefined,
                title: args.title ?? undefined,
              })
              .returning(),
          )
          return toAgentSession(row)
        }),

      findById: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient.query((db) =>
            db
              .select()
              .from(agentSessions)
              .where(and(eq(agentSessions.organizationId, sqlClient.organizationId), eq(agentSessions.id, id)))
              .limit(1),
          )
          if (!row) return yield* new AgentSessionNotFoundError({ sessionId: id })
          return toAgentSession(row)
        }),

      touch: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient.query((db) =>
            db
              .update(agentSessions)
              .set({ updatedAt: new Date() })
              .where(and(eq(agentSessions.organizationId, sqlClient.organizationId), eq(agentSessions.id, id)))
              .returning({ id: agentSessions.id }),
          )
          if (!row) return yield* new AgentSessionNotFoundError({ sessionId: id })
        }),

      listByUser: ({ userId, limit }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db
              .select()
              .from(agentSessions)
              .where(and(eq(agentSessions.organizationId, sqlClient.organizationId), eq(agentSessions.userId, userId)))
              .orderBy(desc(agentSessions.updatedAt))
              .limit(limit),
          )
          return rows.map(toAgentSession)
        }),
    }
  }),
)
