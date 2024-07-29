import { useCallback } from 'react'

import { ProviderApiKey } from '@latitude-data/core'
import { Providers } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { createProviderApiKeyAction } from '$/actions/providerApiKeys/create'
import { destroyProviderApiKeyAction } from '$/actions/providerApiKeys/destroy'
import { getProviderApiKeyAction } from '$/actions/providerApiKeys/fetch'
import useSWR, { SWRConfiguration } from 'swr'

export default function useProviderApiKeys(opts?: SWRConfiguration) {
  const { toast } = useToast()
  const key = 'api/providerApiKeys'
  const fetcher = async () => {
    const [data, error] = await getProviderApiKeyAction()
    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })

      return []
    }

    return data || []
  }
  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<ProviderApiKey[]>(key, fetcher, opts)
  const create = useCallback(
    async ({
      name,
      provider,
      token,
    }: {
      name: string
      provider: Providers
      token: string
    }) => {
      const [apikey, error] = await createProviderApiKeyAction({
        provider,
        token,
        name,
      })

      if (error) {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        })

        return
      }

      mutate([...data, apikey])

      toast({
        title: 'Success',
        description: 'API Key ' + apikey.name + ' created',
      })

      return apikey
    },
    [data, mutate],
  )

  const destroy = useCallback(
    async (id: number) => {
      const [apikey, error] = await destroyProviderApiKeyAction({ id })
      if (error) {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        })

        return
      }

      mutate(data.filter((apikey) => apikey.id !== id))

      toast({
        title: 'Success',
        description: 'API Key ' + apikey!.name + ' deleted',
      })

      return apikey!
    },
    [data, mutate],
  )

  return { data, create, destroy, mutate, ...rest }
}
