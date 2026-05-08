import {
  OAUTH_ACCESS_TOKEN_PREFIX,
  OAUTH_REFRESH_TOKEN_PREFIX,
  stripOAuthRefreshTokenPrefix,
} from "@platform/db-postgres"

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
 * Why a rewriter and not stored-prefixed values: the prefix is a routing /
 * presentation concern, not part of the token's identity. The DB stores the
 * raw value Better Auth generated; we add the prefix when handing tokens to
 * the client and strip it on the way back in. Same on API keys — see
 * `@domain/api-keys.API_KEY_TOKEN_PREFIX`.
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

/**
 * Strips the `lor_` prefix from `refresh_token` on incoming
 * `POST /api/auth/mcp/token` requests so Better Auth's refresh-grant lookup
 * matches the raw token stored in the DB. Pass-through for everything else.
 *
 * Symmetric counterpart to {@link rewriteOAuthTokenResponse}: that function
 * adds the prefix on the way out, this one removes it on the way in. Without
 * this strip, the refresh round-trip breaks — the client stores `lor_xxx` but
 * BA queries `oauth_access_tokens.refresh_token` for the literal `lor_xxx`,
 * which doesn't exist in the DB (we never wrote the prefix there).
 *
 * Reads the body as text and re-encodes it; the returned Request is otherwise
 * identical (same method, headers, URL). Safe to call for every request.
 */
export const stripIncomingOAuthRefreshTokenPrefix = async (request: Request): Promise<Request> => {
  if (request.method !== "POST") return request
  const url = new URL(request.url)
  if (url.pathname !== MCP_TOKEN_PATH) return request

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase()
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return rewriteFormBody(request)
  }
  if (contentType.includes("application/json")) {
    return rewriteJsonBody(request)
  }
  return request
}

const rewriteFormBody = async (request: Request): Promise<Request> => {
  const text = await request.text()
  const params = new URLSearchParams(text)
  const refresh = params.get("refresh_token")
  if (!refresh || !refresh.startsWith(OAUTH_REFRESH_TOKEN_PREFIX)) {
    // Body already consumed — rebuild the request unchanged so downstream
    // handlers can read it.
    return new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: text,
    })
  }
  params.set("refresh_token", stripOAuthRefreshTokenPrefix(refresh))
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: params.toString(),
  })
}

const rewriteJsonBody = async (request: Request): Promise<Request> => {
  const text = await request.text()
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text) as Record<string, unknown>
  } catch {
    // Malformed JSON — leave for BA to reject. Rebuild the request so the
    // already-consumed body is readable downstream.
    return new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: text,
    })
  }
  const refresh = parsed.refresh_token
  if (typeof refresh !== "string" || !refresh.startsWith(OAUTH_REFRESH_TOKEN_PREFIX)) {
    return new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: text,
    })
  }
  parsed.refresh_token = stripOAuthRefreshTokenPrefix(refresh)
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(parsed),
  })
}
