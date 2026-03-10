import { bigint, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export type QuotaType = "seats" | "runs" | "credits"
export type GrantSource = "subscription" | "purchase" | "promocode"

/**
 * Grants table - stores quota allocations.
 *
 * Scoped to the 'latitude' schema.
 */

export const grants = latitudeSchema.table(
  "grants",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    subscriptionId: cuid("subscription_id").notNull(),
    source: varchar("source", { length: 50 }).notNull().$type<GrantSource>(),
    type: varchar("type", { length: 50 }).notNull().$type<QuotaType>(),
    amount: bigint("amount", { mode: "number" }),
    balance: bigint("balance", { mode: "number" }).notNull(),
    expiresAt: tzTimestamp("expires_at"),
    ...timestamps(),
  },
  () => [organizationRLSPolicy("grants")],
)
