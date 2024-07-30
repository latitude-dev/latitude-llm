import { ProviderApiKey } from '@latitude-data/core'
import { useToast } from '@latitude-data/web-ui'
import { createProviderApiKeyAction } from '$/actions/providerApiKeys/create'
import { destroyProviderApiKeyAction } from '$/actions/providerApiKeys/destroy'
import { getProviderApiKeyAction } from '$/actions/providerApiKeys/fetch'
import useLatitudeAction from '$/hooks/useLatitudeAction'
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
  const { execute: create } = useLatitudeAction(createProviderApiKeyAction, {
    onSuccess: async (apikey) => {
      mutate([...data, apikey])
      toast({
        title: 'Success',
        description: 'API Key ' + apikey.name + ' created',
      })
    },
  })

  const { execute: destroy } = useLatitudeAction(destroyProviderApiKeyAction, {
    onSuccess: async (apikey) => {
      mutate(data.filter((item) => item.id !== apikey.id))
      toast({
        title: 'Success',
        description: 'API Key ' + apikey.name + ' deleted',
      })
    },
  })

  return {
    data,
    create,
    destroy,
    mutate,
    ...rest,
  }
}
