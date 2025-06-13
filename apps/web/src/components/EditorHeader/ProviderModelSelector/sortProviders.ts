import { envClient } from '$/envClient'
import type { SerializedProviderApiKey } from '$/stores/providerApiKeys'

/**
 * Sorting logic:
 * 1. Provider with defaultModel is first
 * 2. Default Latitude provider is last
 * 3. Then sorted by `lastUsedAt` and lastly by `id`
 */
export const sortProviders =
  (defaultProviderId?: number | null) =>
  (a: SerializedProviderApiKey, b: SerializedProviderApiKey): number => {
    const defaultName = envClient.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME

    if (a.name === defaultName && b.name !== defaultName) return 1
    if (a.name !== defaultName && b.name === defaultName) return -1

    const aHasDefault = a.id === defaultProviderId
    const bHasDefault = b.id === defaultProviderId
    if (aHasDefault && !bHasDefault) return -1
    if (!aHasDefault && bHasDefault) return 1

    if (a.lastUsedAt && b.lastUsedAt) {
      const aDate = a.lastUsedAt
      const bDate = b.lastUsedAt
      if (aDate > bDate) return -1
      if (aDate < bDate) return 1
    } else if (a.lastUsedAt) {
      return -1 // a has date, b does not → a first
    } else if (b.lastUsedAt) {
      return 1 // b has date, a does not → b first
    }
    return a.id - b.id // fallback to id comparison
  }
