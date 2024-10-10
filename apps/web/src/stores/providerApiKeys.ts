import type { ProviderApiKey } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { createProviderApiKeyAction } from '$/actions/providerApiKeys/create'
import { destroyProviderApiKeyAction } from '$/actions/providerApiKeys/destroy'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

const EMPTY_ARRAY: ProviderApiKey[] = []

export default function useProviderApiKeys(opts?: SWRConfiguration) {
  const { toast } = useToast()
  const key = 'api/providerApiKeys'
  const fetcher = async () => {
    const response = await fetch(ROUTES.api.providerApiKeys.root)
    if (!response.ok) {
      const error = await response.json()

      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })

      return []
    }

    return await response.json()
  }
  const {
    data = EMPTY_ARRAY,
    mutate,
    ...rest
  } = useSWR<ProviderApiKey[]>(key, fetcher, opts)
  const { execute: create } = useLatitudeAction(createProviderApiKeyAction, {
    onSuccess: async ({ data: apikey }) => {
      toast({
        title: 'Success',
        description: `${apikey.name} created successfully`,
      })

      mutate([...data, apikey])
    },
  })

  const { execute: destroy } = useLatitudeAction(destroyProviderApiKeyAction, {
    onSuccess: async ({ data: apikey }) => {
      toast({
        title: 'Success',
        description: `${apikey.name} destroyed successfully`,
      })

      mutate(data.filter((item) => item.id !== apikey.id))
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
