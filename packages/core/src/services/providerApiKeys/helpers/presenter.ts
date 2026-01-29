import { ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'

/**
 * Masks the provider API key token for safe display in API responses.
 * Shows first 3 and last 4 characters with asterisks in between.
 */
export function providerApiKeyPresenter(providerApiKey: ProviderApiKey) {
  return {
    ...providerApiKey,
    token:
      providerApiKey.token.slice(0, 3) +
      '********' +
      providerApiKey.token.slice(-4),
  }
}
