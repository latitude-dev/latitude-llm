import { index, text, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/**
 * API Keys table - stores API keys for organization access.
 *
 * The token is encrypted at the application level (AES-256-GCM)
 * before being persisted. A SHA-256 hex hash of the UTF-8 token bytes (token_hash)
 * is stored alongside for indexed lookups without decryption.
 *
 * Supports soft delete via deleted_at (for revocation).
 * RLS is enabled but NOT forced on this table to allow unscoped
 * authentication lookups (finding an API key by token hash before
 * organization context is known) while still enforcing tenant
 * isolation for regular queries. Authorization is primarily
 * enforced at the application layer.
 *
 * Scoped to the 'latitude' schema.
 */

export const apiKeys = latitudeSchema.table(
  "api_keys",
  {
    id: cuid("id").primaryKey(),
    token: text("token").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    organizationId: cuid("organization_id").notNull(),
    name: varchar("name", { length: 256 }).notNull().default(""),
    lastUsedAt: tzTimestamp("last_used_at"),
    deletedAt: tzTimestamp("deleted_at"),
    ...timestamps(),
  },
  (t) => [organizationRLSPolicy("api_keys"), index("api_keys_organization_id_idx").on(t.organizationId)],
)
