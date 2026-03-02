import { sql } from "drizzle-orm"
import { pgPolicy, pgSchema, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core"

/**
 * API Keys table - stores API keys for organization access.
 *
 * Supports soft delete via deleted_at (for revocation).
 * RLS is enabled on this table.
 * Uses text ID for consistency with Better Auth tables.
 *
 * Scoped to the 'latitude' schema.
 */

const latitudeSchema = pgSchema("latitude")

export const apiKeys = latitudeSchema.table(
  "api_keys",
  {
    id: text("id").primaryKey(), // UUID, consistent with Better Auth
    token: uuid("token").defaultRandom().unique().notNull(),
    organizationId: text("organization_id").notNull(),
    name: varchar("name", { length: 256 }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    pgPolicy("api_keys_organization_policy", {
      for: "all",
      to: "public",
      using: sql`organization_id = get_current_organization_id()`,
      withCheck: sql`organization_id = get_current_organization_id()`,
    }),
  ],
)
