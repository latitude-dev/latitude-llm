import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import {
  createWebhookAction,
  updateWebhookAction,
  deleteWebhookAction,
} from '$/actions/webhooks'

export interface Webhook {
  id: number
  name: string
  url: string
  secret: string
  projectIds?: number[] | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export default function useWebhooks(opts?: SWRConfiguration) {
  const { toast } = useToast()
  const fetcher = useFetcher<Webhook[], Webhook[]>(ROUTES.api.webhooks.root, {
    serializer: (rows) => rows.map(deserialize),
  })
  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<Webhook[]>('api/webhooks', fetcher, opts)

  const { execute: create } = useLatitudeAction(createWebhookAction, {
    onSuccess: ({ data: webhook }) => {
      toast({
        title: 'Success',
        description: 'Webhook created successfully',
      })
      mutate([...data, webhook])
    },
  })

  const { execute: update, isPending: isUpdating } = useLatitudeAction(
    updateWebhookAction,
    {
      onSuccess: ({ data: webhook }) => {
        toast({
          title: 'Success',
          description: 'Webhook updated successfully',
        })
        mutate(data.map((w) => (w.id === webhook.id ? webhook : w)))
      },
    },
  )

  const { execute: destroy, isPending: isDestroying } = useLatitudeAction(
    deleteWebhookAction,
    {
      onSuccess: ({ data: webhook }) => {
        toast({
          title: 'Success',
          description: 'Webhook deleted successfully',
        })
        mutate(data.filter((w) => w.id !== webhook.id))
      },
    },
  )

  return {
    data,
    mutate,
    create,
    update,
    destroy,
    isDestroying,
    isUpdating,
    ...rest,
  }
}

function deserialize(item: Webhook) {
  return {
    ...item,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  }
}
