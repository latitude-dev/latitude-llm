import type { ApiKey } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { createApiKeyAction } from '$/actions/apiKeys/create'
import { destroyApiKeyAction } from '$/actions/apiKeys/destroy'
import { updateApiKeyAction } from '$/actions/apiKeys/update'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { useMemo } from 'react'

export default function useApiKeys(opts?: SWRConfiguration) {
  const { toast } = useToast()
  const key = 'api/apiKeys'
  const fetcher = useFetcher<ApiKey[]>(ROUTES.api.apiKeys.root)
  const { data = [], mutate, ...rest } = useSWR<ApiKey[]>(key, fetcher, opts)

  const { execute: create, isPending: isCreating } = useLatitudeAction(
    createApiKeyAction,
    {
      onSuccess: async ({ data: apiKey }) => {
        toast({
          title: 'Success',
          description: `API key "${apiKey.name}" created successfully`,
        })
        mutate([...data, apiKey])
      },
    },
  )

  const { execute: destroy, isPending: isDestroying } = useLatitudeAction(
    destroyApiKeyAction,
    {
      onSuccess: async ({ data: apiKey }) => {
        toast({
          title: 'Success',
          description: `API key "${apiKey.name}" destroyed successfully`,
        })
        mutate(data.filter((item) => item.id !== apiKey.id))
      },
    },
  )

  const { execute: update, isPending: isUpdating } = useLatitudeAction(
    updateApiKeyAction,
    {
      onSuccess: async ({ data: updatedApiKey }) => {
        toast({
          title: 'Success',
          description: `API key "${updatedApiKey.name}" updated successfully`,
        })
        mutate(
          data.map((item) =>
            item.id === updatedApiKey.id ? updatedApiKey : item,
          ),
        )
      },
    },
  )

  return useMemo(
    () => ({
      data,
      create,
      isCreating,
      destroy,
      isDestroying,
      update,
      isUpdating,
      mutate,
      ...rest,
    }),
    [
      data,
      create,
      isCreating,
      destroy,
      isDestroying,
      update,
      isUpdating,
      mutate,
      rest,
    ],
  )
}
