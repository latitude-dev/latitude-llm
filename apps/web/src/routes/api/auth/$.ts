import { createFileRoute } from "@tanstack/react-router"
import { getBetterAuth } from "../../../server/clients.ts"
import { rewriteOAuthTokenResponse } from "../../../server/oauth-token-prefix-rewriter.ts"

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        return getBetterAuth().handler(request)
      },
      POST: async ({ request }: { request: Request }) => {
        // The rewriter is a no-op for everything except the MCP/OIDC token
        // endpoint — see `oauth-token-prefix-rewriter.ts` for why every other
        // request passes through untouched.
        const response = await getBetterAuth().handler(request)
        return rewriteOAuthTokenResponse(request, response)
      },
    },
  },
})
