import { type AgentMessageRecord, AgentMessageRepository } from "@domain/agent"
import { AgentMessageId, AgentSessionId, OrganizationId, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, asc, eq, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { agentMessages } from "../schema/agent-messages.ts"

const toAgentMessageRecord = (row: typeof agentMessages.$inferSelect): AgentMessageRecord => ({
  id: AgentMessageId(row.id),
  organizationId: OrganizationId(row.organizationId),
  sessionId: AgentSessionId(row.sessionId),
  seq: row.seq,
  role: row.role,
  parts: row.parts,
  createdAt: row.createdAt,
})

export const AgentMessageRepositoryLive = Layer.effect(
  AgentMessageRepository,
  Effect.gen(function* () {
    return {
      append: (args) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          // Next per-session seq computed against pre-insert state; the caller runs this inside a
          // transaction and only one turn runs per session at a time, so no gap/collision in practice
          // (the unique (org, session, seq) index is the backstop).
          const nextSeq = sql<number>`(
            select coalesce(max(${agentMessages.seq}), -1) + 1
            from ${agentMessages}
            where ${agentMessages.organizationId} = ${sqlClient.organizationId}
              and ${agentMessages.sessionId} = ${args.sessionId}
          )`
          const [row] = yield* sqlClient.query((db) =>
            db
              .insert(agentMessages)
              .values({
                ...(args.id ? { id: args.id } : {}),
                organizationId: sqlClient.organizationId,
                sessionId: args.sessionId,
                seq: nextSeq,
                role: args.role,
                parts: [...args.parts],
              })
              .returning(),
          )
          return toAgentMessageRecord(row)
        }),

      listBySession: (sessionId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db
              .select()
              .from(agentMessages)
              .where(
                and(eq(agentMessages.organizationId, sqlClient.organizationId), eq(agentMessages.sessionId, sessionId)),
              )
              .orderBy(asc(agentMessages.seq)),
          )
          return rows.map(toAgentMessageRecord)
        }),
    }
  }),
)
