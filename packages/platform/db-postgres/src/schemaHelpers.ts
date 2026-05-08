import { createId } from "@paralleldrive/cuid2"
import { sql } from "drizzle-orm"
import { pgPolicy, pgSchema, timestamp, varchar } from "drizzle-orm/pg-core"

export const latitudeSchema = pgSchema("latitude")

export function organizationRLSPolicy(tableName: string) {
  return pgPolicy(`${tableName}_organization_policy`, {
    for: "all",
    to: "public",
    using: sql`organization_id = get_current_organization_id()`,
    withCheck: sql`organization_id = get_current_organization_id()`,
  })
}

/** RLS for Better Auth Stripe `subscriptions` rows scoped by `reference_id` (org or user id). */
export function subscriptionReferenceRLSPolicy() {
  return pgPolicy("subscriptions_organization_policy", {
    for: "all",
    to: "public",
    using: sql`reference_id = get_current_organization_id()`,
    withCheck: sql`reference_id = get_current_organization_id()`,
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
 * CUID2 provides 24 character URL-safe unique identifiers.
 */
export function cuid(name: string) {
  return varchar(name, { length: 24 }).$defaultFn(() => createId())
}

/**
 * Foreign-key column holding a CUID2 written by the caller (or left NULL).
 * Same physical shape as {@link cuid} — `varchar(24)` — but without the
 * `$defaultFn`. The default would fire on `column: undefined` and Drizzle
 * would insert a fresh CUID2 that can't possibly satisfy the FK constraint.
 *
 * Use for FK columns where the value is set by something outside our control
 * (e.g. Better Auth's adapter picks `userId` from the session, leaving the
 * field undefined when there is no session). With this helper, `undefined`
 * inserts as `NULL` and the FK accepts it.
 */
export function cuidRef(name: string) {
  return varchar(name, { length: 24 })
}
