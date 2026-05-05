import { bigint, index, integer, text, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const billingOverrides = latitudeSchema.table(
  "billing_overrides",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull().unique(),
    plan: text("plan").notNull(),
    includedCredits: integer("included_credits"),
    retentionDays: integer("retention_days"),
    notes: text("notes"),
    ...timestamps(),
  },
  () => [organizationRLSPolicy("billing_overrides")],
)

export const billingUsageEvents = latitudeSchema.table(
  "billing_usage_events",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    action: text("action").notNull(),
    credits: integer("credits").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    traceId: varchar("trace_id", { length: 32 }),
    metadata: text("metadata"),
    happenedAt: tzTimestamp("happened_at").notNull().defaultNow(),
    billingPeriodStart: tzTimestamp("billing_period_start").notNull(),
    billingPeriodEnd: tzTimestamp("billing_period_end").notNull(),
  },
  (t) => [
    organizationRLSPolicy("billing_usage_events"),
    index("billing_usage_events_org_happened_at_idx").on(t.organizationId, t.happenedAt),
  ],
)

export const billingUsagePeriods = latitudeSchema.table(
  "billing_usage_periods",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    planSlug: varchar("plan_slug", { length: 50 }).notNull(),
    periodStart: tzTimestamp("period_start").notNull(),
    periodEnd: tzTimestamp("period_end").notNull(),
    includedCredits: integer("included_credits").notNull().default(0),
    consumedCredits: integer("consumed_credits").notNull().default(0),
    overageCredits: integer("overage_credits").notNull().default(0),
    reportedOverageCredits: integer("reported_overage_credits").notNull().default(0),
    overageAmountMicrocents: bigint("overage_amount_microcents", { mode: "number" }).notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("billing_usage_periods"),
    uniqueIndex("billing_usage_periods_org_period_idx").on(t.organizationId, t.periodStart, t.periodEnd),
  ],
)
