import type { AgentMessagePart, AgentMessageRole } from "@domain/agent"
import { integer, jsonb, unique, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, tzTimestamp } from "../schemaHelpers.ts"

export const agentMessages = latitudeSchema.table(
  "agent_messages",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    sessionId: cuid("session_id").notNull(),
    seq: integer("seq").notNull(),
    role: varchar("role", { length: 16 }).$type<AgentMessageRole>().notNull(),
    parts: jsonb("parts").$type<AgentMessagePart[]>().notNull(),
    createdAt: tzTimestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    organizationRLSPolicy("agent_messages"),
    unique("agent_messages_unique_seq_idx").on(t.organizationId, t.sessionId, t.seq),
  ],
)
