import { sql } from "drizzle-orm"
import { index, text, uniqueIndex } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/**
 * Slack workspace ↔ Latitude organization installations.
 *
 * One active row per organization (`UNIQUE organization_id WHERE revoked_at IS NULL`)
 * and one active row per Slack workspace (`UNIQUE team_id WHERE revoked_at IS NULL`).
 * Together these enforce a 1-to-1 mapping between the live Latitude org and the
 * live Slack workspace; soft-revoked rows are retained for audit and to let a
 * re-install replay decisions like channel routing configured on the org's settings.
 *
 * `bot_access_token` (and `refresh_token`, when token rotation is enabled) is
 * encrypted at the application layer with AES-256-GCM via `LAT_MASTER_ENCRYPTION_KEY`,
 * mirroring the {@link apiKeys} pattern. No tokenHash column is needed — lookups
 * happen by `team_id` or `organization_id`, not by token.
 *
 * No FK constraints, per the platform's no-FK rule.
 */
export const slackIntegrations = latitudeSchema.table(
  "slack_integrations",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    teamId: text("team_id").notNull(),
    teamName: text("team_name").notNull(),
    appId: text("app_id").notNull(),
    botUserId: text("bot_user_id").notNull(),
    botAccessToken: text("bot_access_token").notNull(),
    botTokenScopes: text("bot_token_scopes").notNull(),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: tzTimestamp("token_expires_at"),
    installedByUserId: cuid("installed_by_user_id").notNull(),
    installedAt: tzTimestamp("installed_at").notNull().defaultNow(),
    revokedAt: tzTimestamp("revoked_at"),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("slack_integrations"),
    index("slack_integrations_organization_id_idx").on(t.organizationId),
    uniqueIndex("slack_integrations_active_organization_idx").on(t.organizationId).where(sql`${t.revokedAt} IS NULL`),
    uniqueIndex("slack_integrations_active_team_idx").on(t.teamId).where(sql`${t.revokedAt} IS NULL`),
    index("slack_integrations_team_id_idx").on(t.teamId),
  ],
)
