import type { ApiKey } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { createApiKeyAction } from '$/actions/apiKeys/create'
import { destroyApiKeyAction } from '$/actions/apiKeys/destroy'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useApiKeys(opts?: SWRConfiguration) {
  const { toast } = useToast()
  const key = 'api/apiKeys'

  const fetcher = async () => {
    const response = await fetch(ROUTES.api.apiKeys.root, {
      credentials: 'include',
    })
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
