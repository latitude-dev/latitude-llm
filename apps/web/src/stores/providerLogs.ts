'use client'

import type { ProviderLog } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { getProviderLogsForDocumentLogAction } from '$/actions/providerLogs/getProviderLogsForDocumentLogAction'
import useSWR, { SWRConfiguration } from 'swr'

export default function useProviderLogs(
  { documentLogUuid }: { documentLogUuid?: string },
  opts?: SWRConfiguration,
) {
  const { toast } = useToast()
  const {
    data = undefined,
    isLoading,
    error: swrError,
  } = useSWR<ProviderLog[] | undefined>(
    ['providerLogs', documentLogUuid],
    async () => {
      if (!documentLogUuid) return
      const [data, error] = await getProviderLogsForDocumentLogAction({
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
