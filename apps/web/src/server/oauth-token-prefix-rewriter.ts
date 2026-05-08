import { OAUTH_ACCESS_TOKEN_PREFIX, OAUTH_REFRESH_TOKEN_PREFIX } from "@platform/db-postgres"

/**
 * The Better Auth `mcp` plugin's token endpoint. The plugin's `path` value is
 * `/mcp/token` relative to the `basePath` (`/api/auth` in our setup).
 */
const MCP_TOKEN_PATH = "/api/auth/mcp/token"

/**
 * RFC 6749 token endpoint response shape that we mutate. Other fields BA may
 * include (`token_type`, `expires_in`, `scope`, `id_token`) pass through as
 * unknown values.
 */
interface OAuthTokenResponseBody {
  access_token?: unknown
  refresh_token?: unknown
}

/**
 * Wraps a Better Auth response so MCP clients receive `loa_…`-prefixed access
 * tokens and `lor_…`-prefixed refresh tokens on the wire.
 *
 * Why a rewriter, not a hook: the OIDC Provider plugin's token endpoint
 * generates the random token string in-memory (`generateRandomString(32, …)`),
 * persists it via `adapter.create({ model: "oauthAccessToken", … })`, then
 * returns the same in-memory variable in the JSON response. Our adapter wrap
 * (in `@platform/db-postgres/oauth-token-prefix.ts`) prefixes the persisted
 * value, but the in-memory variable is already gone by the time it reaches
 * the JSON encoder — so the wire response would carry the un-prefixed string
 * and the round-trip would fail. The rewriter closes that gap.
 *
 * Pure function: given a Request and a Response, returns a new Response if
 * mutation is needed, otherwise the original. Safe to invoke for every
 * response — non-token URLs, error bodies, and non-JSON responses pass
 * through untouched.
 */
export const rewriteOAuthTokenResponse = async (request: Request, response: Response): Promise<Response> => {
  if (!shouldRewrite(request, response)) return response

  // `response.json()` consumes the body, so we have to clone first to keep
  // the original intact in case the rewrite is a no-op.
  const clone = response.clone()

  let parsed: OAuthTokenResponseBody
  try {
    parsed = (await clone.json()) as OAuthTokenResponseBody
  } catch {
    return response
  }

  const next: OAuthTokenResponseBody = { ...parsed }
  let mutated = false
  if (typeof parsed.access_token === "string" && !parsed.access_token.startsWith(OAUTH_ACCESS_TOKEN_PREFIX)) {
    next.access_token = `${OAUTH_ACCESS_TOKEN_PREFIX}${parsed.access_token}`
    mutated = true
  }
  if (typeof parsed.refresh_token === "string" && !parsed.refresh_token.startsWith(OAUTH_REFRESH_TOKEN_PREFIX)) {
    next.refresh_token = `${OAUTH_REFRESH_TOKEN_PREFIX}${parsed.refresh_token}`
    mutated = true
  }
  if (!mutated) return response

  const body = JSON.stringify(next)
  // Reuse the original headers but recompute Content-Length to match the
  // (potentially longer) prefixed body. Other headers — `Cache-Control`,
  // `Content-Type`, etc. — are preserved verbatim.
  const headers = new Headers(response.headers)
  headers.set("Content-Length", String(new TextEncoder().encode(body).byteLength))
  return new Response(body, { status: response.status, statusText: response.statusText, headers })
}

const shouldRewrite = (request: Request, response: Response): boolean => {
  if (request.method !== "POST") return false
  // 4xx / 5xx error bodies don't carry a token, and BA may use a different
  // shape (e.g. RFC 6749 `{ error, error_description }`) — pass them through.
  if (!response.ok) return false
  const url = new URL(request.url)
  if (url.pathname !== MCP_TOKEN_PATH) return false
  const contentType = response.headers.get("content-type") ?? ""
  return contentType.toLowerCase().includes("application/json")
}
