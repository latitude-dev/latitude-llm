'use client'

import type { ProviderLog } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { getProviderLogsForDocumentLogAction } from '$/actions/providerLogs/getProviderLogsForDocumentLogAction'
import useSWR, { SWRConfiguration } from 'swr'
import { useServerAction } from 'zsa-react'

export default function useProviderLogs(
  { documentLogUuid }: { documentLogUuid?: string },
  opts?: SWRConfiguration,
) {
  const { toast } = useToast()
  const { execute: executeFetchAction } = useServerAction(
    getProviderLogsForDocumentLogAction,
  )

  const {
    data = undefined,
    isLoading,
    error: swrError,
  } = useSWR<ProviderLog[] | undefined>(
    ['providerLogs', documentLogUuid],
    async () => {
      if (!documentLogUuid) return
      const [fetchedLogs, errorFetchingLogs] = await executeFetchAction({
        documentLogUuid,
      })

      if (errorFetchingLogs) {
        toast({
          title: 'Error fetching provider logs',
          description:
            errorFetchingLogs.formErrors?.[0] || errorFetchingLogs.message,
          variant: 'destructive',
        })
        return undefined
      }

      return fetchedLogs
    },
    opts,
  )

  return {
    data,
    isLoading: isLoading,
    error: swrError,
  }
}
