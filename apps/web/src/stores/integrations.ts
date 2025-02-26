import type { Integration } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { createIntegrationAction } from '$/actions/integrations/create'
import { destroyIntegrationAction } from '$/actions/integrations/destroy'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

const EMPTY_ARRAY: Integration[] = []

export default function useIntegrations(opts?: SWRConfiguration) {
  const { toast } = useToast()
  const fetcher = useFetcher(ROUTES.api.integrations.root, {
    serializer: (rows) => rows.map(deserialize),
  })
  const {
    data = EMPTY_ARRAY,
    mutate,
    ...rest
  } = useSWR<Integration[]>('api/integrations', fetcher, opts)
  const { execute: create } = useLatitudeAction(createIntegrationAction, {
    onSuccess: async ({ data: integration }) => {
      toast({
        title: 'Success',
        description: `${integration.name} created successfully`,
      })

      mutate([...data, integration])
    },
  })

  const { execute: destroy } = useLatitudeAction(destroyIntegrationAction, {
    onSuccess: async ({ data: integration }) => {
      toast({
        title: 'Success',
        description: `${integration.name} destroyed successfully`,
      })
      mutate(data.filter((item) => item.id !== integration.id))
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

function deserialize(item: Integration) {
  return {
    ...item,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
    lastUsedAt: item.lastUsedAt ? new Date(item.lastUsedAt) : null,
  }
}
