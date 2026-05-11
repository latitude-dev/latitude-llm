/**
 * Splat companion to the sibling `oauth-authorization-server.ts` redirect.
 *
 * Catches RFC 8414 §3.1-compliant probes — when the issuer URL has a path
 * component (ours is `<webUrl>/api/auth`), the metadata URL is formed by
 * inserting `.well-known/oauth-authorization-server` between host and path:
 *
 *   issuer:       https://app.example.com/api/auth
 *   metadata URL: https://app.example.com/.well-known/oauth-authorization-server/api/auth
 *
 * The MCP Inspector and most spec-conformant clients probe at that path.
 * Better Auth, however, serves its metadata at the path-prefixed location
 * `/api/auth/.well-known/oauth-authorization-server`, so we 307 the probe
 * there. The redirect ignores the splat segment — BA serves a single
 * metadata document regardless of which suffix the client used to find it.
 */
import { createFileRoute } from "@tanstack/react-router"

const buildTargetUrl = (request: Request): string => {
  const target = new URL(request.url)
  target.pathname = "/api/auth/.well-known/oauth-authorization-server"
  target.search = ""
  return target.toString()
}

const handleRedirect = ({ request }: { request: Request }): Response => Response.redirect(buildTargetUrl(request), 307)

export const Route = createFileRoute("/.well-known/oauth-authorization-server/$")({
  server: {
    handlers: {
      GET: handleRedirect,
      HEAD: handleRedirect,
    },
  },
})
