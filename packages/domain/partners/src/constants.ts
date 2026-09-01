/**
 * Provisioned OAuth grants mirror what Better Auth's `mcp` plugin mints so
 * every downstream consumer — the token validator, the refresh grant, the
 * OAuth Keys UI, revocation — cannot tell the two apart.
 *
 * These values are copied from `better-auth/dist/plugins/mcp/index.mjs`, not
 * imported: the repo overrides none of BA's TTLs today. If BA's defaults change
 * or `mcpConfig` ever gains TTL overrides, update these to match.
 */
export const PARTNER_ACCESS_TOKEN_TTL_SECONDS = 3600
export const PARTNER_REFRESH_TOKEN_TTL_SECONDS = 604_800

/** Kept equal to the AS `defaultScope` (`apps/web/src/server/clients.ts`) so a provisioned grant is scope-identical to a consented one; `offline_access` is what makes BA's refresh grant accept the row. */
export const PARTNER_GRANT_SCOPES = "openid offline_access"

/** Signed-request freshness window, in seconds, either side of the server clock. */
export const PARTNER_SIGNATURE_TOLERANCE_SECONDS = 300

/** Hex chars in a partner's HMAC secret — 256 bits of entropy. */
export const PARTNER_SECRET_LENGTH = 64

export const PARTNER_SIGNATURE_VERSION = "v1"

export const PARTNER_TIMESTAMP_HEADER = "x-partner-timestamp"
export const PARTNER_SIGNATURE_HEADER = "x-partner-signature"
export const PARTNER_NONCE_HEADER = "x-partner-nonce"

/** Single-use window for `X-Partner-Nonce`, comfortably wider than the signature tolerance. */
export const PARTNER_NONCE_TTL_SECONDS = 600
