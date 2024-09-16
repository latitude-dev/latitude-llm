'use client'

import { compact } from 'lodash-es'

import { ProviderLogDto } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import {
  getProviderLogAction,
  getProviderLogsAction,
} from '$/actions/providerLogs/fetch'
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

      const [data, error] = await getProviderLogAction({
        providerLogId,
      })

      if (error) {
        console.error(error)

        toast({
          title: 'Error fetching provider log',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
        return undefined
      }

      return data
    },
    opts,
  )

  return {
    data,
    isLoading,
    error: swrError,
  }
}
