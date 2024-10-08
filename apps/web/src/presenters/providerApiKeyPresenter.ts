import type { ProviderApiKey } from '@latitude-data/core/browser'

export default function providerApiKeyPresenter(
  providerApiKey: ProviderApiKey,
) {
  return {
    ...providerApiKey,
    token:
      providerApiKey.token.slice(0, 3) +
      '********' +
      providerApiKey.token.slice(-4),
  }
}
