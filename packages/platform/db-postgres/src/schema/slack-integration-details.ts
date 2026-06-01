import type { SlackRoutes } from "@domain/integrations"
import { sql } from "drizzle-orm"
import { index, jsonb, text } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/**
 * Slack-specific extension of {@link integrations}. One row per
 * Slack integration, keyed by `integration_id` (1:1 with the parent).
 * The parent owns the lifecycle (`installed_at`, `revoked_at`) and the
 * cross-org workspace claim (`vendor_account_id` = Slack `team_id`).
 *
 * This table holds the Slack-only shape:
 * - `bot_access_token` and `refresh_token` are AES-256-GCM encrypted at
 *   the application layer (same scheme as {@link apiKeys}, same key
 *   `LAT_MASTER_ENCRYPTION_KEY`)
 * - `team_name` is a display cache; the authoritative workspace id is
 *   `integrations.vendor_account_id`
 *
 * `organization_id` is denormalized onto this table so the same
 * `organizationRLSPolicy` applies — the parent's org id is the source
 * of truth, the application writes both in the same transaction.
 *
 * No FK on `integration_id`, per the platform rule. The 1:1
 * relationship is application-layer: the install use case creates both
 * rows in the same `SqlClient.transaction`; the revoke use case only
 * touches the parent's `revoked_at`. Soft-revoked details rows are
 * retained for audit (no orphaning).
 */
export const slackIntegrationDetails = latitudeSchema.table(
  "slack_integration_details",
  {
    integrationId: cuid("integration_id", { default: false }).primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    teamName: text("team_name").notNull(),
    appId: text("app_id").notNull(),
    botUserId: text("bot_user_id").notNull(),
    botAccessToken: text("bot_access_token").notNull(),
    botTokenScopes: text("bot_token_scopes").notNull(),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: tzTimestamp("token_expires_at"),
    /**
     * Set when a token refresh fails with `invalid_refresh_token` — the
     * rotation chain is dead and the workspace must be reconnected.
     * `null` while healthy; cleared on a successful refresh and on
     * reinstall. Drives the "Reconnect" banner. An expired access token
     * alone is normal (refresh-on-use), so this is the only "broken" signal.
     */
    reconnectRequiredAt: tzTimestamp("reconnect_required_at"),
    /**
     * Per-notification-group channel routing. Empty object `{}` means
     * "no Slack delivery anywhere"; keys are `NotificationGroup` values
     * and values are arrays of `{ channelId, channelName }`. Operator-
     * configured via the settings UI; consumed by the notifications
     * worker's producer fan-out at notification-firing time.
     */
    routes: jsonb("routes").$type<SlackRoutes>().notNull().default(sql`'{}'::jsonb`),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("slack_integration_details"),
    index("slack_integration_details_organization_id_idx").on(t.organizationId),
  ],
)
