import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { compact } from 'lodash-es'
import useSWR, { SWRConfiguration } from 'swr'

import { ProviderApiKeyUsage } from '@latitude-data/core/constants'

import { ProviderApiKey } from '@latitude-data/core/schema/models/types/ProviderApiKey'
export function useProviderApiKeyUsage(
  {
    provider,
  }: {
    provider: Pick<ProviderApiKey, 'id'>
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.providerApiKeys.detail(provider.id).usage
  const fetcher = useFetcher<ProviderApiKeyUsage>(route)

  const { data = [], ...rest } = useSWR<ProviderApiKeyUsage>(
    compact(['providerApiKeyUsage', provider.id]),
    fetcher,
    opts,
  )

  return {
    data,
    ...rest,
  }
}
