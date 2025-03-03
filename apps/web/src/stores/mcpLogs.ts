'use client'

import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'

export interface McpLogOptions {
  tailLines?: number
  timestamps?: boolean
  previous?: boolean
  limitBytes?: number
}

export interface McpLogsResponse {
  logs: string
}

export default function useMcpLogs(
  mcpServerId: string | null | undefined,
  options: McpLogOptions = {},
  swrConfig?: SWRConfiguration,
) {
  const fetcher = useFetcher(
    mcpServerId ? ROUTES.api.mcpServers.logs(mcpServerId, options) : undefined,
    { fallback: { logs: '' } },
  )

  const {
    data = { logs: '' },
    isLoading,
    error,
  } = useSWR<McpLogsResponse>(
    mcpServerId ? ['mcpLogs', mcpServerId, options] : null,
    fetcher,
    {
      refreshInterval: 10000, // Default to 10 seconds
      ...swrConfig,
    },
  )

  return {
    logs: data.logs,
    isLoading,
    error,
  }
}
