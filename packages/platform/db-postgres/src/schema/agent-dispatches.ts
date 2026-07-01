import { index, text, uniqueIndex } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, tzTimestamp } from "../schemaHelpers.ts"

export const agentDispatches = latitudeSchema.table(
  "agent_dispatches",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    configId: cuid("config_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    trigger: text("trigger").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    claimedAt: tzTimestamp("claimed_at").defaultNow().notNull(),
    dispatchedAt: tzTimestamp("dispatched_at"),
    externalAgentId: text("external_agent_id"),
    externalRunId: text("external_run_id"),
    externalUrl: text("external_url"),
    status: text("status").notNull(),
    errorCategory: text("error_category"),
    errorDetail: text("error_detail"),
  },
  (t) => [
    organizationRLSPolicy("agent_dispatches"),
    uniqueIndex("agent_dispatches_idempotency_uq").on(t.organizationId, t.idempotencyKey),
    index("agent_dispatches_project_idx").on(t.projectId),
    index("agent_dispatches_config_idx").on(t.configId),
  ],
)
