import type { DestinationConfig, DestinationKind, DestinationStatus } from "@domain/destinations"
import { index, integer, jsonb, text, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/**
 * Outbound data destinations (spec: `specs/data-destinations.md`). One row per
 * connected destination, project-scoped, unique on `(project_id, kind)` in v1.
 *
 * - `config` is the kind-discriminated non-secret shape (host, redaction,
 *   interval, caps), validated by `destinationConfigSchema` in
 *   `@domain/destinations`.
 * - `credentials` is the whole kind-discriminated secret object, AES-256-GCM
 *   encrypted at the repository boundary (same scheme and key as
 *   {@link slackIntegrationDetails}); plaintext never lands in this column.
 * - `(cursor_ingested_at, cursor_span_id)` is the compound sync watermark;
 *   advances only via the repository's optimistic CAS update.
 * - `last_run_at` + `consecutive_empty_runs` drive sweep due-selection with
 *   idle backoff; `consecutive_failures` drives quarantine.
 *
 * No FKs on `project_id` / `created_by_user_id`, per the platform rule — the
 * `ProjectDeleted` consumer owns the cascade.
 */
export const destinations = latitudeSchema.table(
  "destinations",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id", { default: false }).notNull(),
    kind: varchar("kind", { length: 64 }).notNull().$type<DestinationKind>(),
    name: text("name").notNull(),
    config: jsonb("config").notNull().$type<DestinationConfig>(),
    credentials: text("credentials").notNull(),
    status: varchar("status", { length: 16 }).notNull().$type<DestinationStatus>(),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastFailureMessage: text("last_failure_message"),
    cursorIngestedAt: tzTimestamp("cursor_ingested_at").notNull(),
    cursorSpanId: varchar("cursor_span_id", { length: 16 }).notNull().default(""),
    lastRunAt: tzTimestamp("last_run_at"),
    consecutiveEmptyRuns: integer("consecutive_empty_runs").notNull().default(0),
    createdByUserId: cuid("created_by_user_id", { default: false }).notNull(),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("destinations"),
    uniqueIndex("destinations_project_id_kind_idx").on(t.projectId, t.kind),
    index("destinations_organization_id_idx").on(t.organizationId),
    index("destinations_status_last_run_at_idx").on(t.status, t.lastRunAt),
  ],
)
