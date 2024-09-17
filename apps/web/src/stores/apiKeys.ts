import type { ApiKey } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { createApiKeyAction } from '$/actions/apiKeys/create'
import { destroyApiKeyAction } from '$/actions/apiKeys/destroy'
import { getApiKeysAction } from '$/actions/apiKeys/fetch'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import useSWR, { SWRConfiguration } from 'swr'

export default function useApiKeys(opts?: SWRConfiguration) {
  const { toast } = useToast()
  const key = 'api/apiKeys'

  const fetcher = async () => {
    const [data, error] = await getApiKeysAction()
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

  const { data = [], mutate, ...rest } = useSWR<ApiKey[]>(key, fetcher, opts)

  const { execute: create } = useLatitudeAction(createApiKeyAction, {
    onSuccess: async ({ data: apiKey }) => {
      toast({
        title: 'Success',
        description: `API key "${apiKey.name}" created successfully`,
      })
      mutate([...data, apiKey])
    },
  })

  const { execute: destroy } = useLatitudeAction(destroyApiKeyAction, {
    onSuccess: async ({ data: apiKey }) => {
      toast({
        title: 'Success',
        description: `API key "${apiKey.name}" destroyed successfully`,
      })
      mutate(data.filter((item) => item.id !== apiKey.id))
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
