import { createFileRoute } from "@tanstack/react-router"
import { getBetterAuth } from "../../../server/clients.ts"
import { ensureConsentPromptOnMcpAuthorize } from "../../../server/oauth-authorize-prompt.ts"

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        // No-op for everything except GET /api/auth/mcp/authorize — see
        // `oauth-authorize-prompt.ts` for why we always force `prompt=consent`.
        return getBetterAuth().handler(ensureConsentPromptOnMcpAuthorize(request))
      },
      POST: async ({ request }: { request: Request }) => {
        return getBetterAuth().handler(request)
      },
    },
  },
})
