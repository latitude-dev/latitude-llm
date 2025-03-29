import { useMemo } from 'react'

import { Providers } from '@latitude-data/constants'
import { listModelsForProvider } from '@latitude-data/core'
import { envClient } from '$/envClient'

export default function useModelOptions({
  provider,
  name,
}: {
  provider?: Providers | string
  name?: string
}) {
  return useMemo(() => {
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
  }, [provider, name])
}
