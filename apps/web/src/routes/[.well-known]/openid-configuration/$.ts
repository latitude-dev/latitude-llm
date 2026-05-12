/**
 * Splat companion to the sibling `openid-configuration.ts` redirect.
 *
 * Catches RFC 8414 §3.1-style probes with a path suffix
 * (`/.well-known/openid-configuration/api/auth`) and redirects them to BA's
 * actual OIDC discovery endpoint. See `openid-configuration.ts` and the
 * sibling `oauth-authorization-server/$.ts` for the rationale.
 */
import { createFileRoute } from "@tanstack/react-router"

const buildTargetUrl = (request: Request): string => {
  const target = new URL(request.url)
  target.pathname = "/api/auth/.well-known/openid-configuration"
  target.search = ""
  return target.toString()
}

const handleRedirect = ({ request }: { request: Request }): Response => Response.redirect(buildTargetUrl(request), 307)

export const Route = createFileRoute("/.well-known/openid-configuration/$")({
  server: {
    handlers: {
      GET: handleRedirect,
      HEAD: handleRedirect,
    },
  },
})
