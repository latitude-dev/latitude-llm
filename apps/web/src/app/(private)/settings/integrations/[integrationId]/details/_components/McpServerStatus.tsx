'use client'

import { Text, DotIndicator } from '@latitude-data/web-ui'
import { capitalize } from 'lodash-es'
import { useMcpServer } from '$/stores/mcpServer'

interface McpServerStatusProps {
  mcpServerId?: number
  short?: boolean
}

export function McpServerStatus({
  short = false,
  mcpServerId,
}: McpServerStatusProps) {
  const { data: mcpServer } = useMcpServer(mcpServerId?.toString(), {
    refreshInterval: (mcpServer) =>
      mcpServer?.status === 'deployed' ? 1000 * 30 : 1000 * 10,
    fallbackData: undefined,
  })

  // Determine the status variant for the dot indicator
  const getStatusVariant = (
    status: string,
  ): 'success' | 'error' | 'warning' | 'default' => {
    switch (status.toLowerCase()) {
      case 'deployed':
        return 'success'
      case 'failed':
        return 'error'
      case 'deleted':
        return 'default'
      default:
        return 'warning'
    }
  }

  if (!mcpServer) return null

  const statusVariant = getStatusVariant(mcpServer.status)

  return (
    <div className='flex items-center gap-2'>
      <Text.H5 color='foregroundMuted'>
        {short ? '' : 'MCP server status: '}
        {capitalize(mcpServer.status)}{' '}
      </Text.H5>
      <DotIndicator pulse variant={statusVariant} />
    </div>
  )
}
