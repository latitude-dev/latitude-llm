/**
 * Masks an API key token for display in list responses and UI surfaces.
 *
 * Returns the first 4 and last 4 characters of the token separated by a
 * fixed-width run of `*`. Tokens are 36-character UUIDs in practice, so the
 * "short token" guard exists only as defense against future format changes
 * (or test fixtures) — never triggered by real keys.
 *
 * Example: `658e8f6a-1234-…-1ceb` → `658e***********1ceb`.
 */
const VISIBLE_PREFIX = 4
const VISIBLE_SUFFIX = 4
const MASK_RUN = "***********"

export const maskApiKeyToken = (token: string): string => {
  if (token.length <= VISIBLE_PREFIX + VISIBLE_SUFFIX) {
    return MASK_RUN
  }
  return `${token.slice(0, VISIBLE_PREFIX)}${MASK_RUN}${token.slice(-VISIBLE_SUFFIX)}`
}
