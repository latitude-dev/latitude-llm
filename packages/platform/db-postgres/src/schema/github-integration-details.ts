import { bigint, index, text } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/**
 * GitHub-specific extension of {@link integrations}. One row per GitHub App
 * installation, keyed by `integration_id` (1:1 with the parent, no FK per the
 * platform rule). The parent owns the lifecycle (`installed_at`, `revoked_at`)
 * and the cross-org claim (`vendor_account_id` = the stringified
 * `installation_id`); this table holds pure installation state.
 *
 * No GitHub secrets are stored — installation tokens live only in Redis (D6),
 * so there is nothing to encrypt here. `organization_id` is denormalized so the
 * same `organizationRLSPolicy` applies; the app writes both rows in one
 * transaction.
 */
export const githubIntegrationDetails = latitudeSchema.table(
  "github_integration_details",
  {
    integrationId: cuid("integration_id", { default: false }).primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    installationId: bigint("installation_id", { mode: "number" }).notNull(),
    accountLogin: text("account_login").notNull(),
    accountType: text("account_type").notNull(),
    repositorySelection: text("repository_selection").notNull(),
    suspendedAt: tzTimestamp("suspended_at"),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("github_integration_details"),
    index("github_integration_details_organization_id_idx").on(t.organizationId),
    index("github_integration_details_installation_idx").on(t.installationId),
  ],
)
