import { sql } from "drizzle-orm"
import { boolean, index, jsonb, text, uniqueIndex } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps } from "../schemaHelpers.ts"

/**
 * Dispatch behavior for a connected agent integration.
 *
 * Two row shapes share this table, keyed by `project_id`:
 * - `project_id IS NULL` — the organization-wide default for the integration
 *   (at most one per `integration_id`).
 * - `project_id` set — a per-project override; each overridable field
 *   (`enabled`, `triggers`, `target`, `guardrails`, `prompt_template`) is
 *   NULL to inherit from the default or non-NULL to replace it wholly.
 */
export const agentDispatchConfigs = latitudeSchema.table(
  "agent_dispatch_configs",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id"),
    integrationId: cuid("integration_id").notNull(),
    kind: text("kind").notNull(),
    enabled: boolean("enabled"),
    triggers: jsonb("triggers").$type<readonly string[]>(),
    target: jsonb("target").$type<Record<string, unknown>>(),
    promptTemplate: text("prompt_template"),
    guardrails: jsonb("guardrails").$type<{ maxDispatchesPerDay: number; cooldownMinutes: number }>(),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("agent_dispatch_configs"),
    index("agent_dispatch_configs_project_idx").on(t.projectId),
    index("agent_dispatch_configs_integration_idx").on(t.integrationId),
    uniqueIndex("agent_dispatch_configs_default_uq").on(t.integrationId).where(sql`${t.projectId} IS NULL`),
    uniqueIndex("agent_dispatch_configs_project_integration_uq")
      .on(t.projectId, t.integrationId)
      .where(sql`${t.projectId} IS NOT NULL`),
  ],
)
