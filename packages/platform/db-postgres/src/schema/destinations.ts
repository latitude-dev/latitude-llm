import type { DestinationConfig, DestinationKind, DestinationStatus } from "@domain/destinations"
import { index, integer, jsonb, text, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps } from "../schemaHelpers.ts"

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
 * - `consecutive_failures` + `last_failure_message` drive quarantine —
 *   destination-level because credentials/host are shared across sources.
 *
 * Per-source sync state (watermark cursor, `last_run_at`, idle-backoff counter)
 * lives in {@link destinationSourceCursors}, one row per `(destination, source)`.
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
    createdByUserId: cuid("created_by_user_id", { default: false }).notNull(),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("destinations"),
    uniqueIndex("destinations_project_id_kind_idx").on(t.projectId, t.kind),
    index("destinations_organization_id_idx").on(t.organizationId),
  ],
)
