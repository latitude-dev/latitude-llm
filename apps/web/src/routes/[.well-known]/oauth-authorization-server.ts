/**
 * Convenience redirect for MCP clients that probe the AS-metadata endpoint
 * at the issuer root rather than the path-prefixed location BA serves it at.
 *
 * BA serves the OAuth 2.0 Authorization Server Metadata document (RFC 8414)
 * at `/api/auth/.well-known/oauth-authorization-server` because its base
 * path is `/api/auth`. RFC 8414 §3 lets clients derive the metadata path
 * from the issuer URL, so most MCP clients honor the path-prefixed form.
 * Some don't — they assume a hostname-rooted `/.well-known/...` instead.
 *
 * To accommodate both, this redirect catches root-level probes and 307s
 * them to the BA-served document. The 307 (rather than 301) preserves the
 * request method and signals "temporary" — if BA's path ever changes we
 * don't want stale 301-cached entries pointing at the wrong place.
 */
import { createFileRoute } from "@tanstack/react-router"

const buildTargetUrl = (request: Request): string => {
  const target = new URL(request.url)
  target.pathname = "/api/auth/.well-known/oauth-authorization-server"
  target.search = ""
  return target.toString()
}

const handleRedirect = ({ request }: { request: Request }): Response => Response.redirect(buildTargetUrl(request), 307)

export const Route = createFileRoute("/.well-known/oauth-authorization-server")({
  server: {
    handlers: {
      GET: handleRedirect,
      HEAD: handleRedirect,
    },
  },
})
