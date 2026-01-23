import { encrypt, decrypt } from '../../../lib/encryption'

const ENCRYPTED_TOKEN_PREFIX = 'enc:'

/**
 * Checks if a token is encrypted (has our encryption prefix)
 */
export function isTokenEncrypted(token: string): boolean {
  return token.startsWith(ENCRYPTED_TOKEN_PREFIX)
}

/**
 * Encrypts a provider API key token for storage.
 * The encrypted token is prefixed with 'enc:' to identify it as encrypted.
 */
export function encryptProviderToken(plainToken: string): string {
  const encrypted = encrypt(plainToken)
  return `${ENCRYPTED_TOKEN_PREFIX}${encrypted}`
}

/**
 * Decrypts a provider API key token.
 * Handles backwards compatibility: if the token doesn't have the encryption
 * prefix, it's assumed to be a legacy unencrypted token and returned as-is.
 */
export function decryptProviderToken(storedToken: string): string {
  if (!isTokenEncrypted(storedToken)) {
    return storedToken
  }

  const encryptedPart = storedToken.slice(ENCRYPTED_TOKEN_PREFIX.length)
  return decrypt(encryptedPart)
}
