import { boolean, integer, pgSchema, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Better Auth Stripe Plugin - Subscription table
 *
 * This table is managed by the Better Auth Stripe plugin.
 * It stores subscription data synchronized from Stripe.
 *
 * Schema based on Better Auth Stripe plugin requirements:
 * @see https://better-auth.com/docs/plugins/stripe
 *
 * Scoped to the 'latitude' schema.
 */

const latitudeSchema = pgSchema("latitude");

export const subscription = latitudeSchema.table("subscription", {
  id: text("id").primaryKey(),
  plan: text("plan").notNull(),
  referenceId: text("reference_id").notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 256 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 256 }),
  status: text("status").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end"),
  cancelAt: timestamp("cancel_at", { withTimezone: true }),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  seats: integer("seats"),
  trialStart: timestamp("trial_start", { withTimezone: true }),
  trialEnd: timestamp("trial_end", { withTimezone: true }),
  billingInterval: text("billing_interval"),
  stripeScheduleId: varchar("stripe_schedule_id", { length: 256 }),
});
