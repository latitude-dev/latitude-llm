/**
 * Gets the decrypted environment variables for an MCP server
 * @param encryptedEnvVars The encrypted environment variables string from the database
 * @returns Decrypted environment variables as an object
 */

import { decrypt } from '../../lib/encryption'

export function getDecryptedEnvironmentVariables(
  encryptedEnvVars: string | null,
): Record<string, string> {
  if (!encryptedEnvVars) {
    return {}
  }

  try {
    const decryptedString = decrypt(encryptedEnvVars)
    return JSON.parse(decryptedString)
  } catch (error) {
    console.error('Failed to decrypt environment variables:', error)
    return {}
  }
}
