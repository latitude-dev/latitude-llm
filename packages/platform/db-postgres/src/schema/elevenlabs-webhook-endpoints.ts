import { sql } from "drizzle-orm"
import { index, text, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const elevenlabsWebhookEndpoints = latitudeSchema.table(
  "elevenlabs_webhook_endpoints",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    webhookToken: varchar("webhook_token", { length: 64 }).notNull(),
    signingSecret: text("signing_secret").notNull(),
    createdByUserId: cuid("created_by_user_id").notNull(),
    revokedAt: tzTimestamp("revoked_at"),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("elevenlabs_webhook_endpoints"),
    index("elevenlabs_webhook_endpoints_organization_id_idx").on(t.organizationId),
    index("elevenlabs_webhook_endpoints_project_id_idx").on(t.projectId),
    uniqueIndex("elevenlabs_webhook_endpoints_active_project_idx").on(t.projectId).where(sql`${t.revokedAt} IS NULL`),
    uniqueIndex("elevenlabs_webhook_endpoints_active_token_idx").on(t.webhookToken).where(sql`${t.revokedAt} IS NULL`),
  ],
)
