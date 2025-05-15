import { useCallback, useEffect } from 'react'

import { useSockets } from '$/components/Providers/WebsocketsProvider/useSockets'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useUsers from '$/stores/users'
import { WorkspaceUsage } from '@latitude-data/core/browser'
import useSWR, { SWRConfiguration } from 'swr'

export default function useWorkspaceUsage(opts?: SWRConfiguration) {
  const { data: users } = useUsers()
  const fetcher = useFetcher<WorkspaceUsage | undefined>(
    ROUTES.api.workspaces.usage,
    { fallback: null },
  )
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

  useSockets({ event: 'evaluationResultV2Created', onMessage })
  useSockets({ event: 'documentLogCreated', onMessage })
  useEffect(() => {
    if (isLoading || !data?.members || !users.length) return
    if (data.members === users.length) return

    mutate(
      (prevData) => {
        if (!prevData) return prevData

        return {
          ...prevData,
          members: users.length,
        }
      },
      {
        revalidate: false,
      },
    )
  }, [users.length, isLoading, data?.members])

  return { data, mutate, isLoading, error: swrError }
}
