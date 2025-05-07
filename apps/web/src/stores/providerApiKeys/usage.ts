import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import {
  ProviderApiKey,
  ProviderApiKeyUsage,
} from '@latitude-data/core/browser'
import { compact } from 'lodash-es'
import useSWR, { SWRConfiguration } from 'swr'

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
