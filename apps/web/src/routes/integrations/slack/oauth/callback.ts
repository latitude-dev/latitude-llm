import { installSlackIntegrationUseCase, SlackIntegrationConflictError } from "@domain/integrations"
import { SlackIntegrationRepositoryLive, withPostgres } from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { exchangeOAuthCode, loadSlackConfig } from "@platform/slack"
import { createLogger, withTracing } from "@repo/observability"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { getPostgresClient, getRedisClient } from "../../../../server/clients.ts"
import { consumeSlackOAuthState } from "../../../../server/slack-oauth-state.ts"

/**
 * OAuth callback Slack redirects to after the user approves the
 * install. Validates the CSRF state we wrote in `/integrations/slack/install`,
 * exchanges the code, persists the integration, and bounces back to
 * the settings page with a flash status param.
 *
 * The settings tree is project-scoped (`/projects/$slug/settings/integrations`)
 * but the callback URL is not — we 302 to `/?next=integrations&installed=ok`
 * and let `_authenticated/index.tsx` resolve the user's current project
 * and re-redirect.
 */

const logger = createLogger("slack-oauth-callback")

type FlashStatus = "installed=ok" | "error=workspace_taken" | "error=oauth_failed"

const redirectToSettings = (status: FlashStatus, webUrl: string): Response => {
  const headers = new Headers()
  headers.set("Location", `${webUrl}/?next=integrations&${status}`)
  headers.set("Cache-Control", "no-store")
  return new Response(null, { status: 302, headers })
}

/**
 * `Effect.runPromise` wraps domain failures in a `FiberFailure` whose
 * `cause` carries the actual tagged error. Walk one level deep — the
 * direct `instanceof` check handles cases where the caller already
 * unwrapped (e.g. via Effect.either) and the `_tag` check handles the
 * common FiberFailure shape.
 *
 * Exported for unit testing.
 */
export const isWorkspaceConflict = (cause: unknown): boolean => {
  if (cause instanceof SlackIntegrationConflictError) return true
  const inner = (cause as { cause?: { _tag?: string } })?.cause
  return inner?._tag === "SlackIntegrationConflictError"
}

export const Route = createFileRoute("/integrations/slack/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const rawWebUrl = await Effect.runPromise(parseEnv("LAT_WEB_URL", "string", "http://localhost:3000"))
        // Match the normalization in `/integrations/slack/install` so the
        // redirect URI we send to Slack here is byte-for-byte identical
        // to the one Slack matches against, and so the post-install
        // Location header never has a double slash.
        const webUrl = rawWebUrl.replace(/\/$/, "")

        const url = new URL(request.url)
        const code = url.searchParams.get("code")
        const state = url.searchParams.get("state")
        if (!code || !state) {
          logger.warn("slack oauth callback missing code or state")
          return redirectToSettings("error=oauth_failed", webUrl)
        }

        const stateEntry = await consumeSlackOAuthState({ redis: getRedisClient(), state })
        if (!stateEntry) {
          logger.warn("slack oauth state not found, expired, or already consumed")
          return redirectToSettings("error=oauth_failed", webUrl)
        }

        const config = await Effect.runPromise(loadSlackConfig)
        if (!config) {
          logger.warn("slack config missing at callback time")
          return redirectToSettings("error=oauth_failed", webUrl)
        }

        const redirectUri = `${webUrl}/integrations/slack/oauth/callback`

        try {
          const oauth = await Effect.runPromise(
            exchangeOAuthCode({
              code,
              redirectUri,
              clientId: config.clientId,
              clientSecret: config.clientSecret,
            }),
          )

          const tokenExpiresAt = oauth.expiresIn ? new Date(Date.now() + oauth.expiresIn * 1000) : null

          await Effect.runPromise(
            installSlackIntegrationUseCase({
              organizationId: stateEntry.organizationId,
              installedByUserId: stateEntry.userId,
              teamId: oauth.teamId,
              teamName: oauth.teamName,
              appId: oauth.appId,
              botUserId: oauth.botUserId,
              botAccessToken: oauth.botAccessToken,
              botTokenScopes: oauth.botTokenScopes,
              refreshToken: oauth.refreshToken ?? null,
              tokenExpiresAt,
            }).pipe(
              withPostgres(SlackIntegrationRepositoryLive, getPostgresClient(), stateEntry.organizationId),
              withTracing,
            ),
          )

          return redirectToSettings("installed=ok", webUrl)
        } catch (cause) {
          if (isWorkspaceConflict(cause)) {
            logger.info("slack workspace already claimed by another organization")
            return redirectToSettings("error=workspace_taken", webUrl)
          }
          logger.error("slack oauth callback failed", cause)
          return redirectToSettings("error=oauth_failed", webUrl)
        }
      },
    },
  },
})
