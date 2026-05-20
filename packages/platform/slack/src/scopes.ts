/**
 * Bot scopes requested at install time. Locked at OAuth approval — adding
 * a scope later forces every customer to re-install. Includes
 * `app_mentions:read` even though the mentions feature is Phase 4, so
 * Phase 4 ships without a re-install.
 */
export const SLACK_BOT_SCOPES = [
  "chat:write",
  "chat:write.public",
  "channels:read",
  "groups:read",
  "team:read",
  "app_mentions:read",
] as const

export type SlackBotScope = (typeof SLACK_BOT_SCOPES)[number]
