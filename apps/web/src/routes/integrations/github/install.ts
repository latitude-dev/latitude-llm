import { buildGithubInstallUrl, loadGithubConfig } from "@platform/github"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { requireSession } from "../../../server/auth.ts"
import { getRedisClient } from "../../../server/clients.ts"
import { generateGithubInstallState } from "../../../server/github-oauth-state.ts"

/**
 * Public install entry point. Org admin clicks "Connect GitHub" in settings and
 * lands here; we mint a CSRF-bound nonce (Redis, 10min TTL), then 302 to the
 * GitHub App install page. The setup callback reads the nonce back and claims
 * the installation (5.2).
 */
export const Route = createFileRoute("/integrations/github/install")({
  server: {
    handlers: {
      GET: async () => {
        const { organizationId, userId } = await requireSession()

        const config = await Effect.runPromise(loadGithubConfig)
        if (!config) {
          return new Response("GitHub integration is not configured for this environment.", { status: 503 })
        }

        const state = await generateGithubInstallState({ redis: getRedisClient(), organizationId, userId })
        const url = buildGithubInstallUrl({ baseUrl: config.baseUrl, appSlug: config.appSlug, state })

        const headers = new Headers()
        headers.set("Location", url)
        headers.set("Cache-Control", "no-store")
        return new Response(null, { status: 302, headers })
      },
    },
  },
})
