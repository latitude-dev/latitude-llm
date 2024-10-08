import { useCallback } from 'react'

import { WorkspaceUsage } from '@latitude-data/core/browser'
import { useSockets } from '$/components/Providers/WebsocketsProvider/useSockets'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useWorkspaceUsage(opts?: SWRConfiguration) {
  const fetcher = useFetcher(ROUTES.api.workspaces.usage, { fallback: null })
  const {
    mutate,
    data = undefined,
    isLoading,
    error: swrError,
  } = useSWR<WorkspaceUsage | undefined>(['workspaceUsage'], fetcher, opts)

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
