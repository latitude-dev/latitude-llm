'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Modal,
  Text,
  CodeBlock,
  AnimatedDots,
  CloseTrigger,
} from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import useMcpLogs from '$/stores/mcpLogs'
import useIntegrations from '$/stores/integrations'
import { McpServerStatus } from './McpServerStatus'

interface McpServerLogsModalProps {
  integrationId: number
}

export function McpServerLogsModal({ integrationId }: McpServerLogsModalProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(true)

  // Fetch integration data
  const { data: integrations } = useIntegrations()
  const integration = integrations.find((i) => i.id === integrationId)

  // Get the MCP server ID from the integration
  const mcpServerId = integration?.mcpServerId?.toString() || null

  // Use the mcpLogs hook to fetch logs
  const { logs, isLoading, error } = useMcpLogs(mcpServerId)

  // Handle close
  const handleClose = () => {
    setIsOpen(false)
    router.push(ROUTES.settings.root)
  }

  // No need to format logs as CodeBlock will handle the display

  if (!integration) return

  return (
    <Modal
      dismissible
      open={isOpen}
      onOpenChange={(open: boolean) => {
        if (!open) handleClose()
      }}
      title={integration.name}
      description='Here is the status of your integration and its latest logs.'
      size='large'
      footer={<CloseTrigger />}
    >
      <div className='flex flex-col gap-4'>
        <McpServerStatus mcpServerId={integration?.mcpServerId || undefined} />
        {isLoading && (
          <div className='flex justify-center items-center h-64'>
            <AnimatedDots />
          </div>
        )}
        {!isLoading &&
          (error ? (
            <div className='text-red-500 p-4'>
              <Text.H5>Error loading logs</Text.H5>
              <Text.H6 color='foregroundMuted'>
                An unknown error occurred
              </Text.H6>
            </div>
          ) : logs.length === 0 ? (
            <div className='text-center p-4'>
              <Text.H6 color='foregroundMuted'>No logs available</Text.H6>
            </div>
          ) : (
            <div className='h-full rounded-lg overflow-auto'>
              <CodeBlock language='log'>{logs}</CodeBlock>
            </div>
          ))}
      </div>
    </Modal>
  )
}
