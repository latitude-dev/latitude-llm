import { boolean, index, jsonb, text } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps } from "../schemaHelpers.ts"

export const agentDispatchConfigs = latitudeSchema.table(
  "agent_dispatch_configs",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    integrationId: cuid("integration_id").notNull(),
    kind: text("kind").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    triggers: jsonb("triggers").$type<readonly string[]>().notNull(),
    target: jsonb("target").$type<Record<string, unknown>>().notNull(),
    promptTemplate: text("prompt_template"),
    guardrails: jsonb("guardrails").$type<{ maxDispatchesPerDay: number; cooldownMinutes: number }>().notNull(),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("agent_dispatch_configs"),
    index("agent_dispatch_configs_project_idx").on(t.projectId),
    index("agent_dispatch_configs_integration_idx").on(t.integrationId),
  ],
)
