import { text, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/**
 * API Keys table - stores API keys for organization access.
 *
 * The token is encrypted at rest (AES-256-GCM). A SHA-256 hash
 * (token_hash) is stored alongside for indexed lookups without
 * decryption.
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
    token: text("token").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    organizationId: text("organization_id").notNull(),
    name: varchar("name", { length: 256 }),
    lastUsedAt: tzTimestamp("last_used_at"),
    deletedAt: tzTimestamp("deleted_at"),
    ...timestamps(),
  },
  () => [organizationRLSPolicy("api_keys")],
)
