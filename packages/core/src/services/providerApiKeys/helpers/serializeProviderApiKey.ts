import { ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import { decryptProviderToken } from './tokenEncryption'

/**
 * Serializes a provider API key by decrypting its token for use in the application.
 * This ensures the token is always decrypted when leaving the data layer.
 */
export function serializeProviderApiKey(apiKey: ProviderApiKey): ProviderApiKey {
  return {
    ...apiKey,
    token: decryptProviderToken(apiKey.token),
  }
}

/**
 * Serializes multiple provider API keys by decrypting their tokens.
 */
export function serializeProviderApiKeys(
  apiKeys: ProviderApiKey[],
): ProviderApiKey[] {
  return apiKeys.map(serializeProviderApiKey)
}
