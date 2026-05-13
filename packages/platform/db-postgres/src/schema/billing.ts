import { bigint, index, integer, primaryKey, text, uniqueIndex, varchar } from "drizzle-orm/pg-core"
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
    // Partitioned by `billing_period_start`; Postgres requires partitioned-table
    // primary/unique constraints to include the partition key.
    id: cuid("id").notNull(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    action: text("action").notNull(),
    credits: integer("credits").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    traceId: varchar("trace_id", { length: 32 }),
    metadata: text("metadata"),
    happenedAt: tzTimestamp("happened_at").notNull().defaultNow(),
    billingPeriodStart: tzTimestamp("billing_period_start").notNull(),
    billingPeriodEnd: tzTimestamp("billing_period_end").notNull(),
  },
  (t) => [
    organizationRLSPolicy("billing_usage_events"),
    primaryKey({ columns: [t.id, t.billingPeriodStart] }),
    uniqueIndex("billing_usage_events_period_idempotency_key_idx").on(t.billingPeriodStart, t.idempotencyKey),
    index("billing_usage_events_org_happened_at_idx").on(t.organizationId, t.happenedAt),
    index("billing_usage_events_idempotency_key_idx").on(t.idempotencyKey),
  ],
)

// Per-period aggregate state derived from append-only `billing_usage_events`.
// Billing writers upsert one row per `(organization_id, period_start, period_end)` and atomically
// advance the counters via repository helpers so retries and concurrent workers preserve idempotency.
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
    overageAmountMills: bigint("overage_amount_mills", { mode: "number" }).notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("billing_usage_periods"),
    uniqueIndex("billing_usage_periods_org_period_idx").on(t.organizationId, t.periodStart, t.periodEnd),
  ],
)
