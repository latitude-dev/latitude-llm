import { useCallback } from 'react'

import { WorkspaceUsage } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { fetchWorkspaceUsageAction } from '$/actions/workspaces/usage'
import { useSockets } from '$/components/Providers/WebsocketsProvider/useSockets'
import useSWR, { SWRConfiguration } from 'swr'

export default function useWorkspaceUsage(opts?: SWRConfiguration) {
  const { toast } = useToast()
  const {
    mutate,
    data = undefined,
    isLoading,
    error: swrError,
  } = useSWR<WorkspaceUsage | undefined>(
    ['workspaceUsage'],
    useCallback(async () => {
      const [data, error] = await fetchWorkspaceUsageAction()
      if (error) {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        })
      }
      if (!data) return undefined

      return data
    }, []),
    opts,
  )

  const onMessage = useCallback(() => {
    mutate(
      (prevData) => {
        if (!prevData) return prevData
        return {
          ...prevData,
          usage: prevData.usage + 1,
        }
      },
      {
        revalidate: false,
      },
    )
  }, [])

  useSockets({ event: 'evaluationResultCreated', onMessage })
  useSockets({ event: 'documentLogCreated', onMessage })

  return { data, mutate, isLoading, error: swrError }
}
