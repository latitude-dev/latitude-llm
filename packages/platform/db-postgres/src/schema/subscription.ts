import { sql } from "drizzle-orm"
import { boolean, integer, pgPolicy, text, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, tzTimestamp } from "../schemaHelpers.ts"

/**
 * Better Auth Stripe Plugin - Subscription table
 *
 * This table is managed by the Better Auth Stripe plugin.
 * It stores subscription data synchronized from Stripe.
 * The `reference_id` column holds the organization ID (plugin convention).
 *
 * Schema based on Better Auth Stripe plugin requirements:
 * @see https://better-auth.com/docs/plugins/stripe
 *
 * Scoped to the 'latitude' schema.
 */

export const subscription = latitudeSchema.table(
  "subscription",
  {
    id: cuid("id").primaryKey(),
    plan: text("plan").notNull(),
    referenceId: cuid("reference_id").notNull(),
    stripeCustomerId: varchar("stripe_customer_id", { length: 256 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 256 }),
    status: text("status").notNull(),
    periodStart: tzTimestamp("period_start"),
    periodEnd: tzTimestamp("period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end"),
    cancelAt: tzTimestamp("cancel_at"),
    canceledAt: tzTimestamp("canceled_at"),
    endedAt: tzTimestamp("ended_at"),
    seats: integer("seats"),
    trialStart: tzTimestamp("trial_start"),
    trialEnd: tzTimestamp("trial_end"),
    billingInterval: text("billing_interval"),
    stripeScheduleId: varchar("stripe_schedule_id", { length: 256 }),
  },
  () => [
    pgPolicy("subscription_organization_policy", {
      for: "all",
      to: "public",
      using: sql`reference_id = get_current_organization_id()`,
      withCheck: sql`reference_id = get_current_organization_id()`,
    }),
  ],
)
