'use client'

import { compact } from 'lodash-es'

import type { ProviderLog } from '@latitude-data/core/browser'
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
    data = undefined,
    isLoading,
    error: swrError,
  } = useSWR<ProviderLog[] | undefined>(
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
        return undefined
      }

      return data as ProviderLog[]
    },
    opts,
  )

  return {
    data,
    isLoading: isLoading,
    error: swrError,
  }
}
