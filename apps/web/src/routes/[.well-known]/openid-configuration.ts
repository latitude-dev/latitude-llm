/**
 * OIDC discovery probe redirect — companion to `oauth-authorization-server.ts`.
 *
 * Some MCP clients (including the MCP Inspector) try the OIDC discovery
 * endpoint `/.well-known/openid-configuration` as a fallback when the OAuth
 * AS metadata document doesn't resolve. Better Auth serves the OIDC document
 * at `/api/auth/.well-known/openid-configuration` via the OIDC Provider
 * plugin, so we 307 the probe to that location. Same shape as the
 * `oauth-authorization-server` redirect — see that file for the long
 * explanation of why we redirect rather than serve.
 */
import { createFileRoute } from "@tanstack/react-router"

const buildTargetUrl = (request: Request): string => {
  const target = new URL(request.url)
  target.pathname = "/api/auth/.well-known/openid-configuration"
  target.search = ""
  return target.toString()
}

const handleRedirect = ({ request }: { request: Request }): Response => Response.redirect(buildTargetUrl(request), 307)

export const Route = createFileRoute("/.well-known/openid-configuration")({
  server: {
    handlers: {
      GET: handleRedirect,
      HEAD: handleRedirect,
    },
  },
})
