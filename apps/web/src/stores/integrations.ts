import type { IntegrationDto } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { createIntegrationAction } from '$/actions/integrations/create'
import { destroyIntegrationAction } from '$/actions/integrations/destroy'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { IntegrationType } from '@latitude-data/constants'

const EMPTY_ARRAY: IntegrationDto[] = []

export default function useIntegrations({
  includeLatitudeTools,
  ...opts
}: SWRConfiguration & {
  includeLatitudeTools?: boolean
} = {}) {
  const { toast } = useToast()
  const fetcher = useFetcher(ROUTES.api.integrations.root, {
    serializer: (rows: IntegrationDto[]) =>
      rows
        .map(deserialize)
        .filter(
          (item) =>
            includeLatitudeTools || item.type !== IntegrationType.Latitude,
        )
        .sort((a, b) => a.id - b.id),
  })
  const {
    data = EMPTY_ARRAY,
    mutate,
    ...rest
  } = useSWR<IntegrationDto[]>(
    ['integrations', includeLatitudeTools ?? false],
    fetcher,
    opts,
  )

  const { execute: create } = useLatitudeAction(createIntegrationAction, {
    onSuccess: async ({ data: integration }) => {
      toast({
        title: 'Success',
        description: `${integration.name} created successfully`,
      })

      mutate([...data, integration])
    },
  })

  const { execute: destroy, isPending: isDestroying } = useLatitudeAction(
    destroyIntegrationAction,
    {
      onSuccess: async ({ data: integration }) => {
        toast({
          title: 'Success',
          description: `${integration.name} destroyed successfully`,
        })
        mutate(data.filter((item) => item.id !== integration.id))
      },
    },
  )

  return {
    data,
    create,
    destroy,
    isDestroying,
    mutate,
    ...rest,
  }
}

function deserialize(item: IntegrationDto): IntegrationDto {
  return {
    ...item,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
    lastUsedAt: item.lastUsedAt ? new Date(item.lastUsedAt) : null,
  }
}
