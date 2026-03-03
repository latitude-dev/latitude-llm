import { text, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/**
 * API Keys table - stores API keys for organization access.
 *
 * Supports soft delete via deleted_at (for revocation).
 * RLS is enabled on this table.
 *
 * Scoped to the 'latitude' schema.
 */

export const apiKeys = latitudeSchema.table(
  "api_keys",
  {
    id: cuid("id").primaryKey(),
    token: text("token").notNull().unique(),
    organizationId: text("organization_id").notNull(),
    name: varchar("name", { length: 256 }),
    lastUsedAt: tzTimestamp("last_used_at"),
    deletedAt: tzTimestamp("deleted_at"),
    ...timestamps(),
  },
  () => [organizationRLSPolicy("api_keys")],
)
