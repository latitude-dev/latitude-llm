import type { DBAdapter } from "@better-auth/core/db/adapter"

/**
 * Prefix on every OAuth access token issued by the Better Auth `mcp` plugin.
 * Stored verbatim in `oauth_access_tokens.access_token` and re-sent by the MCP
 * client as `Authorization: Bearer loa_...`. The API auth middleware uses the
 * prefix to dispatch directly to the OAuth validator.
 *
 * Symmetric with `lak_` on API keys (see `@domain/api-keys.API_KEY_TOKEN_PREFIX`).
 */
export const OAUTH_ACCESS_TOKEN_PREFIX = "loa_"

/**
 * Prefix on every OAuth refresh token issued by the Better Auth `mcp` plugin.
 * Stored in `oauth_access_tokens.refresh_token` and only ever presented back to
 * the web's `/api/auth/mcp/token` endpoint (the API never sees refresh tokens).
 *
 * Distinct from {@link OAUTH_ACCESS_TOKEN_PREFIX} so a refresh token sent by
 * mistake on an API call is recognisable and rejected with a clean 401 instead
 * of being silently routed through the access-token validator.
 */
export const OAUTH_REFRESH_TOKEN_PREFIX = "lor_"

/**
 * The OIDC Provider plugin (which the `mcp` plugin builds on) writes its rows
 * via `ctx.context.adapter.create(...)` directly, **bypassing the
 * `databaseHooks` mechanism** documented in Better Auth. The hooks layer is
 * only invoked through `getWithHooks` in `db/with-hooks.ts`, which the OIDC
 * plugin doesn't call — confirmed by reading
 * `better-auth@1.6.9/dist/plugins/oidc-provider/index.mjs`.
 *
 * To get prefixes onto stored tokens we therefore wrap the adapter at this
 * layer instead. The wrap intercepts `create({ model: "oauthAccessToken" })`
 * calls and prepends the prefixes to `accessToken` / `refreshToken` before
 * forwarding to the inner adapter; every other model is passed through
 * untouched.
 *
 * The on-the-wire response from `/api/auth/mcp/token` is rewritten separately
 * (in `apps/web`) — the OIDC plugin returns the in-memory token variable that
 * was set *before* this hook, so the wire response would otherwise carry the
 * un-prefixed value. The two pieces have to land together.
 */
export const wrapAdapterForOAuthTokenPrefix = (inner: DBAdapter): DBAdapter => ({
  ...inner,
  create: async <T extends Record<string, unknown>, R = T>(params: {
    model: string
    data: Omit<T, "id">
    select?: string[] | undefined
    forceAllowId?: boolean | undefined
  }): Promise<R> => {
    if (params.model !== "oauthAccessToken") {
      return inner.create<T, R>(params)
    }
    const data = params.data as Record<string, unknown>
    const next: Record<string, unknown> = { ...data }
    if (typeof next.accessToken === "string" && !next.accessToken.startsWith(OAUTH_ACCESS_TOKEN_PREFIX)) {
      next.accessToken = `${OAUTH_ACCESS_TOKEN_PREFIX}${next.accessToken}`
    }
    if (typeof next.refreshToken === "string" && !next.refreshToken.startsWith(OAUTH_REFRESH_TOKEN_PREFIX)) {
      next.refreshToken = `${OAUTH_REFRESH_TOKEN_PREFIX}${next.refreshToken}`
    }
    return inner.create<T, R>({ ...params, data: next as Omit<T, "id"> })
  },
})
