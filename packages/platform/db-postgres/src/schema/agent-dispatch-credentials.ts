import { text } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps } from "../schemaHelpers.ts"

export const agentDispatchCredentials = latitudeSchema.table(
  "agent_dispatch_credentials",
  {
    integrationId: cuid("integration_id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    cursorApiKey: text("cursor_api_key"),
    claudeRoutineToken: text("claude_routine_token"),
    linearApiKey: text("linear_api_key"),
    webhookSecret: text("webhook_secret"),
    ...timestamps(),
  },
  (t) => [organizationRLSPolicy("agent_dispatch_credentials")],
)
