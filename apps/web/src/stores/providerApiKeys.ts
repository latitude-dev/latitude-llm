import type { ProviderApiKey } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { createProviderApiKeyAction } from '$/actions/providerApiKeys/create'
import { destroyProviderApiKeyAction } from '$/actions/providerApiKeys/destroy'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

const EMPTY_ARRAY: ProviderApiKey[] = []

export default function useProviderApiKeys(opts?: SWRConfiguration) {
  const { toast } = useToast()
  const fetcher = useFetcher(ROUTES.api.providerApiKeys.root, {
    serializer: (rows) => rows.map(deserialize),
  })
  const {
    data = EMPTY_ARRAY,
    mutate,
    ...rest
  } = useSWR<ProviderApiKey[]>('api/providerApiKeys', fetcher, opts)
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

function deserialize(item: ProviderApiKey) {
  return {
    ...item,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
    lastUsedAt: item.lastUsedAt ? new Date(item.lastUsedAt) : null,
  }
}
