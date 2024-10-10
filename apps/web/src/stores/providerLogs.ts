'use client'

import { compact } from 'lodash-es'

import { ProviderLogDto } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useProviderLogs(
  {
    documentUuid,
    documentLogUuid,
  }: { documentUuid?: string; documentLogUuid?: string } = {},
  opts?: SWRConfiguration,
) {
  const { toast } = useToast()
  const {
    data = [],
    isLoading,
    error: swrError,
  } = useSWR<ProviderLogDto[]>(
    compact(['providerLogs', documentUuid, documentLogUuid]),
    async () => {
      const response = await fetch(
        buildRoute({ documentUuid, documentLogUuid }),
      )
      if (!response.ok) {
        const error = await response.json()

        toast({
          title: 'Error fetching provider logs',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })

        return []
      }

      return await response.json()
    },
    opts,
  )

  return {
    data,
    isLoading: isLoading,
    error: swrError,
  }
}

export function useProviderLog(
  providerLogId?: number,
  opts?: SWRConfiguration,
) {
  const { toast } = useToast()
  const {
    data = undefined,
    isLoading,
    error: swrError,
  } = useSWR<ProviderLogDto | undefined>(
    compact(['providerLog', providerLogId]),
    async () => {
      if (!providerLogId) return undefined

      try {
        const response = await fetch(`/api/providerLogs/${providerLogId}`)
        if (!response.ok) {
          toast({
            title: 'Error fetching provider log',
            description: response.statusText,
            variant: 'destructive',
          })
          return
        }
        const data = await response.json()
        return data
      } catch (error) {
        toast({
          title: 'Error fetching provider log',
          description:
            error instanceof Error
              ? error.message
              : 'An unknown error occurred',
          variant: 'destructive',
        })
        return
      }
    },
    opts,
  )

  return {
    data,
    isLoading,
    error: swrError,
  }
}

function buildRoute({
  documentUuid,
  documentLogUuid,
}: {
  documentUuid?: string
  documentLogUuid?: string
}) {
  let route = ROUTES.api.providerLogs.root
  if (documentUuid) {
    route += `?documentUuid=${documentUuid}`
  }
  if (documentLogUuid) {
    if (documentUuid) {
      route += '&'
    } else {
      route += '?'
    }

    route += `documentLogUuid=${documentLogUuid}`
  }

  return route
}
