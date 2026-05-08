import { createFileRoute } from "@tanstack/react-router"
import { getBetterAuth } from "../../../server/clients.ts"
import { forceOAuthConsent } from "../../../server/force-oauth-consent.ts"

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        // No-op for everything except GET /api/auth/mcp/authorize — see
        // `force-oauth-consent.ts` for why we always force `prompt=consent`.
        return getBetterAuth().handler(forceOAuthConsent(request))
      },
      POST: async ({ request }: { request: Request }) => {
        return getBetterAuth().handler(request)
      },
    },
  },
})
