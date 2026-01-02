'use client'
import { useMemo } from 'react'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { createIntegrationAction } from '$/actions/integrations/create'
import { destroyIntegrationAction } from '$/actions/integrations/destroy'
import { reauthorizeIntegrationAction } from '$/actions/integrations/reauthorize'
import { scaleDownMcpServerAction } from '$/actions/integrations/scaleDown'
import { scaleUpMcpServerAction } from '$/actions/integrations/scaleUp'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { IntegrationType } from '@latitude-data/constants'
import { type IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'

const EMPTY_ARRAY: IntegrationDto[] = []

function filterIntegrations({
  integrations,
  includeLatitudeTools,
  withTools,
  withTriggers,
}: {
  integrations: IntegrationDto[]
  includeLatitudeTools?: boolean
  withTools?: boolean
  withTriggers?: boolean
}) {
  return integrations.filter((item) => {
    if (!includeLatitudeTools && item.type === IntegrationType.Latitude) {
      return false
    }

    if (withTools !== undefined && item.hasTools !== withTools) {
      return false
    }
    if (withTriggers !== undefined && item.hasTriggers !== withTriggers) {
      return false
    }

    return true
  })
}

export default function useIntegrations({
  includeLatitudeTools,
  withTools,
  withTriggers,
  ...opts
}: SWRConfiguration & {
  includeLatitudeTools?: boolean
  withTools?: boolean
  withTriggers?: boolean
} = {}) {
  const { toast } = useToast()
  const fetcher = useFetcher(ROUTES.api.integrations.root, {
    serializer: (rows: IntegrationDto[]) => rows.map(deserialize),
  })
  const {
    data: unfilteredIntegrations = EMPTY_ARRAY,
    mutate,
    ...rest
  } = useSWR<IntegrationDto[]>(['integrations'], fetcher, opts)

  const data = useMemo(
    () =>
      filterIntegrations({
        integrations: unfilteredIntegrations,
        includeLatitudeTools,
        withTools,
        withTriggers,
      }),
    [unfilteredIntegrations, includeLatitudeTools, withTools, withTriggers],
  )

  const {
    execute: create,
    error: createError,
    isPending: isCreating,
  } = useLatitudeAction(createIntegrationAction, {
    onSuccess: async ({ data: result }) => {
      const integration = result.integration

      if (result.oauthRedirectUrl) {
        toast({
          title: 'OAuth Required',
          description: 'Redirecting to complete OAuth authentication...',
        })
        window.location.href = result.oauthRedirectUrl
        return
      }

      toast({
        title: 'Success',
        description: `${integration.name} created successfully`,
      })

      mutate([...unfilteredIntegrations, integration])
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

  const { execute: scaleDown, isPending: isScalingDown } = useLatitudeAction(
    scaleDownMcpServerAction,
    {
      onSuccess: async ({ data: mcpServer }) => {
        toast({
          title: 'Success',
          description: 'MCP server scaled down successfully',
        })

        mutate(
          unfilteredIntegrations.map((item) =>
            item.id === mcpServer.id ? { ...item, mcpServer: mcpServer } : item,
          ),
        )
      },
    },
  )

  const { execute: scaleUp, isPending: isScalingUp } = useLatitudeAction(
    scaleUpMcpServerAction,
    {
      onSuccess: async ({ data: mcpServer }) => {
        toast({
          title: 'Success',
          description: 'MCP server scaled up successfully',
        })

        mutate(
          unfilteredIntegrations.map((item) =>
            item.id === mcpServer.id ? { ...item, mcpServer: mcpServer } : item,
          ),
        )
      },
    },
  )

  const { execute: reauthorize, isPending: isReauthorizing } =
    useLatitudeAction(reauthorizeIntegrationAction, {
      onSuccess: async ({ data: result }) => {
        toast({
          title: 'OAuth Required',
          description: 'Redirecting to complete OAuth authentication...',
        })
        window.location.href = result.oauthRedirectUrl
      },
    })

  return useMemo(
    () => ({
      data,
      create,
      createError,
      isCreating,
      destroy,
      isDestroying,
      scaleDown,
      isScalingDown,
      scaleUp,
      isScalingUp,
      reauthorize,
      isReauthorizing,
      mutate,
      ...rest,
    }),
    [
      data,
      create,
      createError,
      isCreating,
      destroy,
      isDestroying,
      scaleDown,
      isScalingDown,
      scaleUp,
      isScalingUp,
      reauthorize,
      isReauthorizing,
      mutate,
      rest,
    ],
  )
}

function deserialize(item: IntegrationDto): IntegrationDto {
  return {
    ...item,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
    lastUsedAt: item.lastUsedAt ? new Date(item.lastUsedAt) : null,
  }
}
