import { sql } from "drizzle-orm"
import { index, text, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/**
 * Third-party integrations an organization has connected (Slack today;
 * Telegram, Discord, GitHub Apps, … later). One row per integration
 * lifecycle, regardless of vendor.
 *
 * The parent table owns the **lifecycle and the cross-vendor invariants**:
 * - one active integration per `(organization_id, kind)`
 * - one active claim per `(kind, vendor_account_id)` across all orgs
 *
 * `vendor_account_id` is the integration's identifier in the vendor's
 * world — Slack's workspace `team_id`, Telegram's bot username,
 * GitHub's installation id. Lifting this concept to the parent lets
 * the cross-org uniqueness invariant live as a clean partial unique
 * index on real columns rather than a jsonb expression index, while
 * keeping vendor-specific shape isolated in the per-vendor `*_details`
 * tables (see `slackIntegrationDetails`).
 *
 * Per-vendor `_details` rows are 1:1 with this table by `integration_id`.
 * No FK constraint per the platform rule — application-layer integrity
 * keeps them in sync (insert in a single transaction; revoke updates
 * the parent's `revoked_at` only).
 */
export const integrations = latitudeSchema.table(
  "integrations",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    kind: varchar("kind", { length: 64 }).notNull(),
    vendorAccountId: text("vendor_account_id").notNull(),
    installedByUserId: cuid("installed_by_user_id").notNull(),
    installedAt: tzTimestamp("installed_at").notNull().defaultNow(),
    revokedAt: tzTimestamp("revoked_at"),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("integrations"),
    index("integrations_organization_id_idx").on(t.organizationId),
    uniqueIndex("integrations_active_organization_kind_idx")
      .on(t.organizationId, t.kind)
      .where(sql`${t.revokedAt} IS NULL`),
    uniqueIndex("integrations_active_kind_vendor_account_idx")
      .on(t.kind, t.vendorAccountId)
      .where(sql`${t.revokedAt} IS NULL`),
    index("integrations_kind_vendor_account_idx").on(t.kind, t.vendorAccountId),
  ],
)
