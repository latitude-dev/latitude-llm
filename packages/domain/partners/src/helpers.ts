/** Alphabet and length of `generateRandomString(32, "a-z", "A-Z")`, the generator BA's `mcp` plugin uses for every OAuth string it mints. */
const OAUTH_STRING_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
const OAUTH_STRING_LENGTH = 32

// 256 % 52 !== 0, so bytes at or above this cutoff are redrawn instead of folded — modulo alone would bias the first 48 letters.
const REJECTION_CUTOFF = Math.floor(256 / OAUTH_STRING_ALPHABET.length) * OAUTH_STRING_ALPHABET.length

/**
 * A client id / access token / refresh token in Better Auth's exact format:
 * 32 characters drawn uniformly from `[a-zA-Z]`. Provisioned rows are
 * indistinguishable from consent-minted ones, so nothing downstream can
 * special-case them. Deliberately not {@link randomToken}, which is hex.
 */
export const generateOAuthClientString = (): string => {
  let result = ""
  while (result.length < OAUTH_STRING_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(OAUTH_STRING_LENGTH))) {
      if (byte >= REJECTION_CUTOFF) continue
      result += OAUTH_STRING_ALPHABET[byte % OAUTH_STRING_ALPHABET.length]
      if (result.length === OAUTH_STRING_LENGTH) break
    }
  }
  return result
}
