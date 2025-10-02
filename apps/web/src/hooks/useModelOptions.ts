import { useMemo } from 'react'
import { envClient } from '$/envClient'
import { Providers } from '@latitude-data/constants'
import { listModelsForProvider } from '@latitude-data/core/services/ai/providers/models/index'

export function getModelOptionsForProvider({
  provider,
  name,
}: {
  provider?: Providers | string
  name?: string
}) {
  if (!provider) return []
  if (!Object.values<string>(Providers).includes(provider)) return []

  return Object.entries(
    listModelsForProvider({
      provider: provider as Providers,
      name: name,
      defaultProviderName: envClient.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
    }),
  ).map(([key, value]) => ({
    label: key,
    value: value,
  }))
}

export default function useModelOptions({
  provider,
  name,
}: {
  provider?: Providers | string
  name?: string
}) {
  return useMemo(
    () => getModelOptionsForProvider({ provider, name }),
    [provider, name],
  )
}
