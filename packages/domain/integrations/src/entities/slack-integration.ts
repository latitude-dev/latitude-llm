import { organizationIdSchema, slackIntegrationIdSchema, userIdSchema } from "@domain/shared"
import { z } from "zod"
import { slackRoutesSchema } from "./slack-route.ts"

/**
 * SlackIntegration entity — one row represents a Slack workspace
 * connected to a Latitude organization.
 *
 * `botAccessToken` is the plaintext bot user OAuth token (`xoxb-…`/`xoxe-…`)
 * at the domain layer; the repository encrypts on write and decrypts on
 * read. `refreshToken` and `tokenExpiresAt` stay `null` while token
 * rotation is disabled on the Slack app; with rotation on, the token is
 * refreshed on-use (`getOrRefreshBotToken`). `reconnectRequiredAt` is set
 * only when a refresh fails with `invalid_refresh_token` (dead chain → the
 * user must reconnect); it stays `null` while healthy.
 *
 * Active vs revoked is encoded by `revokedAt`: a row with
 * `revokedAt = null` is the workspace's currently-live install.
 * Re-installing into the same organization replaces the active row
 * (the previous one is soft-revoked first); a partial unique index on
 * `(team_id) WHERE revoked_at IS NULL` makes cross-organization
 * conflicts fail at insert time.
 */
export const slackIntegrationSchema = z.object({
  id: slackIntegrationIdSchema,
  organizationId: organizationIdSchema,
  teamId: z.string().min(1),
  teamName: z.string().min(1),
  appId: z.string().min(1),
  botUserId: z.string().min(1),
  botAccessToken: z.string().min(1),
  botTokenScopes: z.string().min(1),
  refreshToken: z.string().min(1).nullable(),
  tokenExpiresAt: z.date().nullable(),
  reconnectRequiredAt: z.date().nullable(),
  installedByUserId: userIdSchema,
  installedAt: z.date(),
  revokedAt: z.date().nullable(),
  /**
   * Per-notification-group channel routing for this workspace. Persisted
   * as jsonb on `slack_integration_details.routes`. New installs start
   * with `{}`; reinstall does not preserve routes — the previous row's
   * routes stay on the now-soft-revoked details row for audit, but the
   * new active row begins clean. Operator-configured via the settings
   * UI; consumed by the notifications producer fan-out.
   */
  routes: slackRoutesSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type SlackIntegration = z.infer<typeof slackIntegrationSchema>

export const isActive = (integration: SlackIntegration): boolean => integration.revokedAt === null
