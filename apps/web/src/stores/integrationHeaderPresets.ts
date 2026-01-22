'use client'

import { useMemo } from 'react'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { IntegrationHeaderPreset } from '@latitude-data/core/schema/models/types/IntegrationHeaderPreset'
import { createIntegrationHeaderPresetAction } from '$/actions/integrations/headerPresets/create'
import { destroyIntegrationHeaderPresetAction } from '$/actions/integrations/headerPresets/destroy'

const EMPTY_ARRAY: IntegrationHeaderPreset[] = []

export function useIntegrationHeaderPresets(
  integrationId: number | undefined,
  opts?: SWRConfiguration,
) {
  const { toast } = useToast()
  const fetcher = useFetcher<IntegrationHeaderPreset[], IntegrationHeaderPreset[]>(
    integrationId ? ROUTES.api.integrationHeaderPresets.detail(integrationId).root : undefined,
    {
      serializer: (rows) => rows.map(deserialize),
    },
  )
  const {
    data = EMPTY_ARRAY,
    mutate,
    ...rest
  } = useSWR<IntegrationHeaderPreset[]>(
    integrationId ? ['integrationHeaderPresets', integrationId] : null,
    fetcher,
    opts,
  )

  const {
    execute: create,
    isPending: isCreating,
  } = useLatitudeAction(createIntegrationHeaderPresetAction, {
    onSuccess: ({ data: preset }) => {
      toast({
        title: 'Success',
        description: 'Preset saved successfully',
      })
      mutate([...data, preset])
    },
  })

  const {
    execute: destroy,
    isPending: isDestroying,
  } = useLatitudeAction(destroyIntegrationHeaderPresetAction, {
    onSuccess: ({ data: preset }) => {
      toast({
        title: 'Success',
        description: 'Preset deleted successfully',
      })
      mutate(data.filter((p) => p.id !== preset.id))
    },
  })

  return useMemo(
    () => ({
      data,
      mutate,
      create,
      isCreating,
      destroy,
      isDestroying,
      ...rest,
    }),
    [data, mutate, create, isCreating, destroy, isDestroying, rest],
  )
}

function deserialize(item: IntegrationHeaderPreset): IntegrationHeaderPreset {
  return {
    ...item,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  }
}
