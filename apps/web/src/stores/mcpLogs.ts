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
  const fetcher = useFetcher<McpLogsResponse>(
    mcpServerId ? ROUTES.api.mcpServers.logs(mcpServerId, options) : undefined,
    { fallback: { logs: '' } },
  )

  const { data = { logs: '' }, ...rest } = useSWR<McpLogsResponse>(
    mcpServerId ? ['mcpLogs', mcpServerId, options] : null,
    fetcher,
    {
      fallbackData: { logs: '' },
      ...swrConfig,
    },
  )

  return {
    data,
    ...rest,
  }
}
