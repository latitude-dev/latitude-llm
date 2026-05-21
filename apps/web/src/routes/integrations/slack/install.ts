import { parseEnv } from "@platform/env"
import { buildSlackAuthorizeUrl, loadSlackConfig } from "@platform/slack"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { requireSession } from "../../../server/auth.ts"
import { getRedisClient } from "../../../server/clients.ts"
import { generateSlackOAuthState } from "../../../server/slack-oauth-state.ts"

/**
 * Public OAuth entry point. The user clicks "Connect Slack" in
 * settings, lands here, and we:
 *
 * 1. Confirm there's an authenticated session bound to an org.
 * 2. Generate a CSRF-bound state token and stash it in Redis (TTL 10min).
 * 3. Build the Slack authorize URL via `@slack/oauth` and 302 the
 *    browser to Slack's approval screen.
 *
 * The callback at `/integrations/slack/oauth/callback` reads the state
 * back out, exchanges the code, and persists the integration.
 */
export const Route = createFileRoute("/integrations/slack/install")({
  server: {
    handlers: {
      GET: async () => {
        const { organizationId, userId } = await requireSession()

        const config = await Effect.runPromise(loadSlackConfig)
        if (!config) {
          return new Response("Slack is not configured for this environment.", { status: 503 })
        }

        const rawWebUrl = await Effect.runPromise(parseEnv("LAT_WEB_URL", "string", "http://localhost:3000"))
        // Strip trailing slash so we never build `https://app//integrations/...`,
        // which Slack would reject as a redirect-URI mismatch.
        const webUrl = rawWebUrl.replace(/\/$/, "")
        const redirectUri = `${webUrl}/integrations/slack/oauth/callback`

        const state = await generateSlackOAuthState({
          redis: getRedisClient(),
          organizationId,
          userId,
        })

        const url = await Effect.runPromise(
          buildSlackAuthorizeUrl({
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            redirectUri,
            state,
          }),
        )

        const headers = new Headers()
        headers.set("Location", url)
        headers.set("Cache-Control", "no-store")
        return new Response(null, { status: 302, headers })
      },
    },
  },
})
