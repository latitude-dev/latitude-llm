import { sql } from "drizzle-orm";
import { bigint, pgEnum, pgPolicy, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Quota type enum for grants.
 */
export const quotaTypeEnum = pgEnum("quota_type", ["seats", "runs", "credits"]);

/**
 * Grant source enum.
 */
export const grantSourceEnum = pgEnum("grant_source", ["subscription", "purchase", "promocode"]);

/**
 * Grants table - stores quota allocations.
 *
 * Scoped to the 'latitude' schema.
 */

const latitudeSchema = pgSchema("latitude");

export const grants = latitudeSchema.table(
  "grants",
  {
    id: text("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    organizationId: text("organization_id").notNull(),
    subscriptionId: text("subscription_id").notNull(),
    source: grantSourceEnum("source").notNull(),
    type: quotaTypeEnum("type").notNull(),
    amount: bigint("amount", { mode: "number" }), // null means unlimited
    balance: bigint("balance", { mode: "number" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    pgPolicy("grants_organization_policy", {
      for: "all",
      to: "public",
      using: sql`organization_id = get_current_organization_id()`,
      withCheck: sql`organization_id = get_current_organization_id()`,
    }),
  ],
);
