import { createId } from "@paralleldrive/cuid2"
import { sql } from "drizzle-orm"
import { pgPolicy, pgSchema, timestamp, varchar } from "drizzle-orm/pg-core"

export const LATITUDE_SCHEMA = pgSchema("latitude")

export function organizationRLSPolicy() {
  return pgPolicy("projects_organization_policy", {
    for: "all",
    to: "public",
    using: sql`organization_id = get_current_organization_id()`,
    withCheck: sql`organization_id = get_current_organization_id()`,
  })
}

export function tzTimestamp(name: string) {
  return timestamp(name, { withTimezone: true })
}

export function timestamps() {
  return {
    createdAt: tzTimestamp("created_at").defaultNow().notNull(),
    updatedAt: tzTimestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  }
}

/**
 * Generate a unique ID using CUID2.
 * CUID2 provides 24-25 character URL-safe unique identifiers.
 */
export function cuid(name: string) {
  return varchar(name, { length: 128 }).$defaultFn(() => createId())
}
