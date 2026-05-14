import { createFileRoute } from "@tanstack/react-router"
import { pickTrackingParams } from "../../../../lib/analytics/gtm.ts"
import { buildOAuthCallbackUrls } from "../../../../lib/auth/oauth-redirects.ts"
import { getBetterAuth } from "../../../../server/clients.ts"

const SUPPORTED_PROVIDERS = new Set(["google", "github"])

const respondError = (status: number, message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  })

export const Route = createFileRoute("/api/auth/$provider/start")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { provider: string } }) => {
        const provider = params.provider
        if (!SUPPORTED_PROVIDERS.has(provider)) {
          return respondError(400, `Unsupported OAuth provider: ${provider}`)
        }

        const url = new URL(request.url)
        const tracking = pickTrackingParams(url.searchParams)
        const { callbackURL, newUserCallbackURL, errorCallbackURL } = buildOAuthCallbackUrls({
          provider: provider as "google" | "github",
          redirect: url.searchParams.get("redirect"),
          tracking,
        })

        const apiResponse = await getBetterAuth().api.signInSocial({
          body: {
            provider: provider as "google" | "github",
            callbackURL,
            newUserCallbackURL,
            errorCallbackURL,
          },
          headers: request.headers,
          asResponse: true,
        })

        if (!apiResponse.ok) {
          return apiResponse
        }

        const payload = (await apiResponse.json().catch(() => null)) as { url?: string } | null
        if (!payload?.url) {
          return respondError(500, "Failed to initiate OAuth sign-in")
        }

        const headers = new Headers()
        headers.set("Location", payload.url)
        headers.set("Cache-Control", "no-store")
        // Use getSetCookie() to preserve multi-value Set-Cookie headers; iterating Headers collapses them.
        const setCookies = apiResponse.headers.getSetCookie()
        for (const cookie of setCookies) {
          headers.append("set-cookie", cookie)
        }

        return new Response(null, { status: 302, headers })
      },
    },
  },
})
