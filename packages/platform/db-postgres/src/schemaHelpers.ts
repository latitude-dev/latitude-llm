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
 * `varchar(24)` column holding a CUID2 — 24-character URL-safe unique id.
 *
 * `default` (defaults to `true`) controls whether Drizzle synthesises a
 * fresh CUID2 when the field is `undefined` at insert time. Pass `false`
 * for FK columns where the value is set by something outside our control
 * (e.g. Better Auth's adapter picks `userId` from the session and leaves
 * it undefined when there is no session): `undefined` then inserts as
 * `NULL` so the FK constraint accepts it, instead of letting Drizzle make
 * up an id that can't possibly match any existing row.
 *
 * Overloaded so each branch returns its own concrete type — a single
 * implementation with a ternary would collapse the return into a union,
 * which erases Drizzle's `hasDefault` flag on the default-true path and
 * forces every `id`-bearing insert in the codebase to pass `id`
 * explicitly.
 */
export function cuid(name: string): ReturnType<ReturnType<typeof varchar>["$defaultFn"]>
export function cuid(name: string, options: { default: false }): ReturnType<typeof varchar>
export function cuid(name: string, options?: { default?: boolean }) {
  const column = varchar(name, { length: 24 })
  return options?.default === false ? column : column.$defaultFn(() => createId())
}
