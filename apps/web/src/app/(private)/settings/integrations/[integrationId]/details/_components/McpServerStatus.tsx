'use client'

import { Text, DotIndicator } from '@latitude-data/web-ui'
import { McpServer } from '@latitude-data/core/browser'
import { capitalize } from 'lodash-es'

interface McpServerStatusProps {
  mcpServer: McpServer | undefined
  short?: boolean
}

export function McpServerStatus({
  short = false,
  mcpServer,
}: McpServerStatusProps) {
  if (!mcpServer) return null

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
