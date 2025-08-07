'use client'
import { UpgradeLink } from '$/components/UpgradeLink'
import { useMcpServer } from '$/stores/mcpServer'
import { McpServer } from '@latitude-data/core/browser'
import { DotIndicator } from '@latitude-data/web-ui/atoms/DotIndicator'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { capitalize } from 'lodash-es'

interface McpServerStatusProps {
  mcpServerId?: number
  short?: boolean
}

export function McpServerStatus({
  short = false,
  mcpServerId,
}: McpServerStatusProps) {
  const { data: mcpServer, isValidating } = useMcpServer(
    mcpServerId?.toString(),
    {
      refreshInterval: (mcpServer) =>
        mcpServer?.status === 'deployed' ? 1000 * 30 : 1000 * 10,
      fallbackData: undefined,
    },
  )

  // Determine the status variant for the dot indicator
  const getStatusVariant = (
    mcpServer: McpServer,
  ): 'success' | 'error' | 'warning' | 'default' | 'muted' => {
    switch (mcpServer.status.toLowerCase()) {
      case 'deployed':
        if (mcpServer.replicas === 0) return 'muted'

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

  const statusVariant = getStatusVariant(mcpServer)

  return (
    <div className={`flex flex-col gap-1 ${isValidating ? 'opacity-50' : ''}`}>
      <div className='flex items-center gap-2'>
        <DotIndicator pulse variant={statusVariant} />
        <StatusText
          short={short}
          status={mcpServer.status}
          replicas={mcpServer.replicas}
        />
      </div>

      {!short && mcpServer.status === 'failed' && (
        <Text.H6 color='foregroundMuted'>
          Deployment failed. Check the logs for more details. We'll
          automatically attempt to redeploy in a few seconds.
        </Text.H6>
      )}

      {!short && mcpServer.status === 'deploying' && (
        <Text.H6 color='foregroundMuted'>
          Deployment in progress. This should complete in a few seconds.
        </Text.H6>
      )}
    </div>
  )
}

const StatusText = ({
  short = false,
  status,
  replicas,
}: {
  short: boolean
  status: string
  replicas: number
}) => {
  const shortText = short ? '' : 'MCP server status: '

  if (status === 'deployed' && replicas === 0) {
    return (
      <Tooltip
        trigger={<Text.H5 color='foregroundMuted'>{shortText}Inactive</Text.H5>}
      >
        This integration has automatically been suspended due to inactivity. It
        will automatically resume when required.
        <br />
        <br />
        <UpgradeLink>
          <Text.H6 color='primary'>Upgrade</Text.H6>
        </UpgradeLink>{' '}
        your plan to avoid this.
      </Tooltip>
    )
  }

  return (
    <Text.H5 color='foregroundMuted'>
      {shortText}
      {capitalize(status)}
    </Text.H5>
  )
}
