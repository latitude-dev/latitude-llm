import { bigint, index, integer, text, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { latitudeSchema, organizationRLSPolicy, tzTimestamp } from "../schemaHelpers.ts"

export const billingOverrides = latitudeSchema.table(
  "billing_overrides",
  {
    id: varchar("id", { length: 24 }).primaryKey(),
    organizationId: varchar("organization_id", { length: 24 }).notNull().unique(),
    plan: text("plan").notNull(),
    includedCredits: integer("included_credits"),
    retentionDays: integer("retention_days"),
    notes: text("notes"),
    createdAt: tzTimestamp("created_at").notNull().defaultNow(),
    updatedAt: tzTimestamp("updated_at").notNull().defaultNow(),
  },
  () => [organizationRLSPolicy("billing_overrides")],
)

export const billingUsageEvents = latitudeSchema.table(
  "billing_usage_events",
  {
    id: varchar("id", { length: 24 }).primaryKey(),
    organizationId: varchar("organization_id", { length: 24 }).notNull(),
    projectId: varchar("project_id", { length: 24 }).notNull(),
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
    id: varchar("id", { length: 24 }).primaryKey(),
    organizationId: varchar("organization_id", { length: 24 }).notNull(),
    planSlug: varchar("plan_slug", { length: 50 }).notNull(),
    periodStart: tzTimestamp("period_start").notNull(),
    periodEnd: tzTimestamp("period_end").notNull(),
    includedCredits: integer("included_credits").notNull().default(0),
    consumedCredits: integer("consumed_credits").notNull().default(0),
    overageCredits: integer("overage_credits").notNull().default(0),
    reportedOverageCredits: integer("reported_overage_credits").notNull().default(0),
    overageAmountMicrocents: bigint("overage_amount_microcents", { mode: "number" }).notNull().default(0),
    updatedAt: tzTimestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    organizationRLSPolicy("billing_usage_periods"),
    uniqueIndex("billing_usage_periods_org_period_idx").on(t.organizationId, t.periodStart, t.periodEnd),
  ],
)
