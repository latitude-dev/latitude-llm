/**
 * BA's `mcp` plugin ships its own authorize handler at
 * `/api/auth/mcp/authorize` that is **different** from the standard OIDC
 * `/oauth2/authorize`: it bypasses the consent page entirely unless the
 * client sends `prompt=consent` in the query string (verified at
 * `better-auth@1.6.9/dist/plugins/mcp/authorize.mjs:103`).
 *
 * Real MCP clients (Claude Code, Cursor, …) don't pass `prompt=consent`.
 * Without it, our `/auth/consent` page never renders, the org-binding
 * step never runs, and tokens get issued with
 * `oauth_applications.organization_id IS NULL` — which the API auth
 * middleware rejects. The OAuth round-trip would silently break.
 *
 * Force the prompt server-side so the consent page always shows. The
 * downside (re-prompting on every authorize) is actually the desired
 * behavior here: re-authorizing is also how a user switches the org an
 * MCP client is bound to.
 *
 * Pure function: takes a Request, returns either the original (every
 * non-authorize URL passes through untouched) or a freshly-built Request
 * with `prompt=consent` set. Safe to call for every request.
 */
const MCP_AUTHORIZE_PATH = "/api/auth/mcp/authorize"

export const forceOAuthConsent = (request: Request): Request => {
  if (request.method !== "GET") return request
  const url = new URL(request.url)
  if (url.pathname !== MCP_AUTHORIZE_PATH) return request
  if (url.searchParams.get("prompt") === "consent") return request
  url.searchParams.set("prompt", "consent")
  return new Request(url.toString(), request)
}
