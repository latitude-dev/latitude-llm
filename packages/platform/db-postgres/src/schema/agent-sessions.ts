import { index, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps } from "../schemaHelpers.ts"

export const agentSessions = latitudeSchema.table(
  "agent_sessions",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    userId: cuid("user_id").notNull(),
    projectId: cuid("project_id", { default: false }),
    title: varchar("title", { length: 256 }),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("agent_sessions"),
    index("agent_sessions_org_user_idx").on(t.organizationId, t.userId, t.updatedAt),
  ],
)
