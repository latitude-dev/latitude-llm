import { createFileRoute } from "@tanstack/react-router"
import { getBetterAuth } from "../../../server/clients.ts"
import {
  rewriteOAuthTokenResponse,
  stripIncomingOAuthRefreshTokenPrefix,
} from "../../../server/oauth-token-prefix-rewriter.ts"

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        return getBetterAuth().handler(request)
      },
      POST: async ({ request }: { request: Request }) => {
        // Both rewriters are no-ops for everything except the MCP/OIDC token
        // endpoint. The strip happens *before* BA so the refresh-grant lookup
        // matches the raw value in the DB; the response wrap happens *after*
        // BA so the client stores `loa_…`/`lor_…` shapes.
        const stripped = await stripIncomingOAuthRefreshTokenPrefix(request)
        const response = await getBetterAuth().handler(stripped)
        return rewriteOAuthTokenResponse(stripped, response)
      },
    },
  },
})
