import { CACHE_FINDING_FINGERPRINT_MAX_LENGTH } from "@domain/spans"
import { bigint, doublePrecision, index, integer, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/**
 * The measured cache verdict behind one open cost signal.
 *
 * A projection, not a source of truth: the judgment lives in `judgeCacheEconomics` over
 * ClickHouse spans and is recomputed on every sweep. What this table holds is the
 * lifecycle state that cannot be recomputed — which finding already has a signal, and
 * when it was first seen — plus the payload a dispatched coding agent receives.
 *
 * `fingerprint` is `(provider, model, state)` and unique per project, so the fire-once
 * rule is a database constraint rather than a read the sweep could race on.
 */
export const cacheFindings = latitudeSchema.table(
  "cache_findings",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    signalId: cuid("signal_id", { default: false }).notNull(), // no FK (repo convention); the signal is soft-deleted, this row is hard-deleted with it
    fingerprint: varchar("fingerprint", { length: CACHE_FINDING_FINGERPRINT_MAX_LENGTH }).notNull(),
    provider: varchar("provider", { length: 128 }).notNull(),
    model: varchar("model", { length: 256 }).notNull(),
    state: varchar("state", { length: 32 }).notNull(),
    urgency: varchar("urgency", { length: 32 }),
    actualRate: doublePrecision("actual_rate").notNull(),
    breakEvenRate: doublePrecision("break_even_rate").notNull(),
    ceilingRate: doublePrecision("ceiling_rate").notNull(),
    modeledSavingsMicrocents: bigint("modeled_savings_microcents", { mode: "number" }).notNull(),
    calls: bigint("calls", { mode: "number" }).notNull(),
    spendMicrocents: bigint("spend_microcents", { mode: "number" }).notNull(),
    cacheLifetimeSeconds: integer("cache_lifetime_seconds").notNull(),
    firstObservedAt: tzTimestamp("first_observed_at").notNull(), // survives a refresh; how long a finding has gone unacted is what tells a reader whether anyone is on it
    lastObservedAt: tzTimestamp("last_observed_at").notNull(),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("cache_findings"),
    uniqueIndex("cache_findings_unique_fingerprint_idx").on(t.organizationId, t.projectId, t.fingerprint),
    index("cache_findings_signal_idx").on(t.organizationId, t.signalId),
  ],
)
