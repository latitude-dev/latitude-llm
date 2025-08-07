'use client'
import { ROUTES } from '$/services/routes'
import useIntegrations from '$/stores/integrations'
import useMcpLogs from '$/stores/mcpLogs'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { AnimatedDots } from '@latitude-data/web-ui/molecules/AnimatedDots'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
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
  const {
    data,
    isLoading,
    isValidating,
    error,
    mutate: refresh,
  } = useMcpLogs(mcpServerId)

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
      footer={
        <>
          <Button
            fancy
            variant='outline'
            onClick={() => refresh()}
            iconProps={{
              name: 'refresh',
              placement: 'left',
              spin: isValidating,
            }}
            disabled={isLoading || isValidating}
          >
            Refresh logs
          </Button>
          <CloseTrigger />
        </>
      }
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
          ) : data.logs.length === 0 ? (
            <div className='text-center p-4 flex flex-col items-center gap-4'>
              <Text.H6 color='foregroundMuted'>
                No logs available. Please wait a few seconds for logs to appear
                after creating this integration.
              </Text.H6>
            </div>
          ) : (
            <div className='h-full rounded-lg overflow-auto'>
              <CodeBlock language='log'>{data.logs}</CodeBlock>
            </div>
          ))}
      </div>
    </Modal>
  )
}
