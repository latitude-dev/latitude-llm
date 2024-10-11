'use client'

import { compact } from 'lodash-es'

import { ProviderLogDto } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { getProviderLogsAction } from '$/actions/providerLogs/fetch'
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
      // TODO: Move to regula HTTP GET
      const [data, error] = await getProviderLogsAction({
        documentUuid,
        documentLogUuid,
      })

      if (error) {
        console.error(error)

        toast({
          title: 'Error fetching provider logs',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })

        return []
      }

      return data
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
  providerLogId?: number | null,
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
