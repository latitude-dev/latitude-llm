import { updateMcpServerStatusAction } from '$/actions/mcpServers/updateStatus'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { McpServer } from '@latitude-data/core/browser'
import useSWR, { SWRConfiguration } from 'swr'

export function useMcpServer(
  mcpServerId: string | null | undefined,
  swrConfig?: SWRConfiguration,
) {
  const fetcher = useFetcher(
    mcpServerId ? `/api/mcpServers/${mcpServerId}` : undefined,
    { fallback: undefined },
  )
  const { data, mutate, isLoading, error } = useSWR<McpServer>(
    mcpServerId ? ['mcpServer', mcpServerId] : null,
    fetcher,
    swrConfig,
  )

  const { execute: updateMcpServerStatus } = useLatitudeAction(
    updateMcpServerStatusAction,
    {
      onSuccess: ({ data }) => {
        mutate(data)
      },
    },
  )

  return {
    data,
    updateMcpServerStatus,
    isLoading,
    error,
  }
}
