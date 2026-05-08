/**
 * OAuth token prefixing happens entirely at the boundary — request/response
 * rewriters on the web app, the API auth middleware on the API. The DB stores
 * raw token values (matching what BA's OIDC plugin generates and looks up by);
 * the prefix is added when handing tokens to clients and stripped when reading
 * them off incoming bearer / form values.
 *
 * Keeping the DB un-prefixed means we don't have to wrap BA's adapter or
 * intercept its writes — BA looks up by the same raw value it wrote, so
 * refresh-token grants and other internal flows work without further help.
 *
 * See `apps/web/src/server/oauth-token-prefix-rewriter.ts` for the wire-side
 * wrap, and `@platform/oauth-token-auth/validate-oauth-token.ts` for the
 * API-side strip.
 */

/**
 * Prefix on every OAuth access token surfaced by the web's Better Auth `mcp`
 * plugin. Added on the wire by `rewriteOAuthTokenResponse`; never persisted.
 * The MCP client re-sends the prefixed token as `Authorization: Bearer loa_…`,
 * the API auth middleware uses the prefix to dispatch to the OAuth validator,
 * and the validator strips it before the DB lookup.
 *
 * Symmetric with `lak_` on API keys (see `@domain/api-keys.API_KEY_TOKEN_PREFIX`).
 */
export const OAUTH_ACCESS_TOKEN_PREFIX = "loa_"

/**
 * Prefix on every OAuth refresh token surfaced by the web's Better Auth `mcp`
 * plugin. Added on the wire by `rewriteOAuthTokenResponse`; stripped on the
 * way back in by `stripIncomingOAuthRefreshTokenPrefix` so BA's refresh-grant
 * lookup matches the raw value stored in the DB.
 *
 * Distinct from {@link OAUTH_ACCESS_TOKEN_PREFIX} so a refresh token sent by
 * mistake on an API call is recognisable and rejected with a clean 401 instead
 * of being silently routed through the access-token validator.
 */
export const OAUTH_REFRESH_TOKEN_PREFIX = "lor_"

/**
 * Strip the `loa_` prefix from a bearer access token, returning the raw value
 * stored in `oauth_access_tokens.access_token`. Tokens without the prefix are
 * returned unchanged — the validator runs the same lookup either way, so a
 * legacy un-prefixed token (or a defensive fallback) still resolves.
 */
export const stripOAuthAccessTokenPrefix = (token: string): string =>
  token.startsWith(OAUTH_ACCESS_TOKEN_PREFIX) ? token.slice(OAUTH_ACCESS_TOKEN_PREFIX.length) : token

/**
 * Strip the `lor_` prefix from a refresh token before handing it to Better
 * Auth's refresh-grant flow. Used by the web's request rewriter on
 * `POST /api/auth/mcp/token`.
 */
export const stripOAuthRefreshTokenPrefix = (token: string): string =>
  token.startsWith(OAUTH_REFRESH_TOKEN_PREFIX) ? token.slice(OAUTH_REFRESH_TOKEN_PREFIX.length) : token
