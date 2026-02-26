import { useEffect } from 'react'

import { useSockets } from '$/components/Providers/WebsocketsProvider/useSockets'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useUsers from '$/stores/users'
import useSWR, { SWRConfiguration } from 'swr'
import { WorkspaceUsage } from '@latitude-data/core/constants'
import { useDebouncedCallback } from 'use-debounce'

/**
 * FIXME: this is broken. We removed `documentLogCreated` but we're not listening for spans created.
 */
export default function useWorkspaceUsage({
  disable = false,
  ...opts
}: {
  disable?: boolean
} & SWRConfiguration = {}) {
  const { data: users } = useUsers()
  const fetcher = useFetcher<WorkspaceUsage | undefined>(
    disable ? undefined : ROUTES.api.workspaces.usage,
    { fallback: null },
  )
  const {
    mutate,
    data = undefined,
    isLoading,
    error: swrError,
  } = useSWR<WorkspaceUsage | undefined>(
    disable ? null : ['workspaceUsage'],
    fetcher,
    opts,
  )

  const onMessage = useDebouncedCallback(() => {
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
  }, 500)

  useSockets({ event: 'evaluationResultV2Created', onMessage })
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
  }, [users.length, isLoading, data?.members, mutate])

  return { data, mutate, isLoading, error: swrError }
}
