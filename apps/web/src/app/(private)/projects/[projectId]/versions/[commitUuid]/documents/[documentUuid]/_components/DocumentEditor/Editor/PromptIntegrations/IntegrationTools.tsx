import { useSockets } from '$/components/Providers/WebsocketsProvider/useSockets'
import useIntegrationTools from '$/stores/integrationTools'
import { McpTool } from '@latitude-data/constants'
import { IntegrationDto } from '@latitude-data/core/browser'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { BlankSlate } from '@latitude-data/web-ui/molecules/BlankSlate'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { DotIndicator } from '@latitude-data/web-ui/atoms/DotIndicator'
import { FakeProgress } from '@latitude-data/web-ui/molecules/FakeProgress'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { toast } from '@latitude-data/web-ui/atoms/Toast'
import Link from 'next/link'
import { useCallback, useState } from 'react'

function IntegrationToolItem({
  disabled,
  tool,
  isActive,
  onToggle,
}: {
  disabled?: boolean
  tool: McpTool
  isActive: boolean
  onToggle: () => void
}) {
  return (
    <div
      key={tool.name}
      className='flex flex-col gap-2 p-4 border-t border-border'
    >
      <div className='flex flex-row items-center gap-2 justify-between'>
        <Text.H6B color='foreground'>{tool.name}</Text.H6B>
        <SwitchToggle
          checked={isActive}
          onClick={onToggle}
          disabled={disabled}
        />
      </div>
      <Text.H6 color='foregroundMuted'>{tool.description}</Text.H6>
      <div className='flex flex-wrap items-center'>
        {Object.keys(tool.inputSchema.properties).map((property) => {
          const type = tool.inputSchema.properties[property]!.type
          const description = tool.inputSchema.properties[property]!.description
          return (
            <Tooltip
              key={property}
              className='cursor-default'
              trigger={
                <Badge
                  key={property}
                  variant='muted'
                  className='mr-2 cursor-default'
                >
                  {property}
                </Badge>
              }
              side='top'
              align='center'
            >
              <div className='flex flex-col gap-2'>
                <div className='flex flex-row gap-2 items-center'>
                  <Text.H6B color='background'>{property}</Text.H6B>
                  <Text.H7 color='background'>{type}</Text.H7>
                </div>
                {description && (
                  <Text.H6 color='background'>{description}</Text.H6>
                )}
              </div>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}

function IntegrationToolItemPlaceholder() {
  return (
    <div className='flex flex-col gap-2 p-4 border-t border-border'>
      <div className='flex flex-row items-center gap-2 justify-between'>
        <Skeleton className='w-full' height='h6' />
        <Skeleton className='w-12' height='h6' />
      </div>

      <Skeleton className='w-full' height='h6' />
      <Skeleton className='w-20' height='h6' />
      <Skeleton className='w-12' height='h6' />
    </div>
  )
}

export function IntegrationToolsList({
  disabled,
  integration,
  activeTools,
  addIntegrationTool,
  removeIntegrationTool,
}: {
  disabled?: boolean
  integration: IntegrationDto
  activeTools: string[] | true | undefined
  addIntegrationTool: (integrationName: string, toolName: string) => void
  removeIntegrationTool: (
    integrationName: string,
    toolName: string,
    toolNames: string[],
  ) => void
}) {
  const {
    data: tools,
    isLoading,
    isValidating,
    error,
  } = useIntegrationTools(integration)
  const [wakingUp, setWakingUp] = useState(false)

  useSockets({
    event: 'mcpServerScaleEvent',
    onMessage: (e) => {
      if (!e) return

      const { mcpServerId, replicas } = e
      if (replicas < 1) return
      if (mcpServerId !== integration?.mcpServerId) return

      setWakingUp(true)
    },
  })

  useSockets({
    event: 'mcpServerConnected',
    onMessage: ({ mcpServerId }) => {
      if (mcpServerId !== integration?.mcpServerId) return

      setWakingUp(false)

      toast({
        title: 'MCP server connected',
        description:
          'MCP servers in Hobby plans are automatically suspended after 10 minutes of inactivity.',
        variant: 'default',
      })
    },
  })

  const toggleTool = useCallback(
    (toolName: string) => {
      if (disabled) return
      if (!tools) return
      const isActive = activeTools === true || activeTools?.includes(toolName)
      if (isActive) {
        removeIntegrationTool(
          integration.name,
          toolName,
          tools.map((t) => t.name),
        )
      } else {
        addIntegrationTool(integration.name, toolName)
      }
    },
    [activeTools, tools, disabled],
  )

  const allEnabled = activeTools === true
  const toggleAllEnabled = () => {
    if (disabled) return
    if (allEnabled) {
      removeIntegrationTool(
        integration.name,
        '*',
        tools?.map((t) => t.name) ?? [],
      )
    } else {
      addIntegrationTool(integration.name, '*')
    }
  }

  if (isLoading || (isValidating && wakingUp)) {
    if (wakingUp) {
      return (
        <BlankSlate>
          <div className='flex flex-col items-center gap-4'>
            <div className='flex flex-row items-center gap-4'>
              <Text.H6B centered color='foreground'>
                Waking up MCP server...
              </Text.H6B>
              <DotIndicator pulse variant='warning' />
            </div>
            <div className='w-full px-4'>
              <FakeProgress delayIncrement={200} completed={!wakingUp} />
            </div>
            <Text.H6 centered color='foreground'>
              If you want to avoid cold starts, please{' '}
              <Link href='/' className='text-primary'>
                upgrade
              </Link>{' '}
              to the Team plan.
            </Text.H6>
          </div>
        </BlankSlate>
      )
    }

    return (
      <>
        <div className='flex flex-row items-center gap-2 p-4 justify-between'>
          <Skeleton className='w-full' height='h6' />
          <Skeleton className='w-12' height='h6' />
        </div>
        <IntegrationToolItemPlaceholder />
        <IntegrationToolItemPlaceholder />
        <IntegrationToolItemPlaceholder />
      </>
    )
  }

  if (error) {
    return (
      <div className='w-full h-full flex flex-col gap-2 bg-destructive-muted p-4'>
        <Text.H5B color='destructiveMutedForeground'>
          Error loading tools
        </Text.H5B>
        <Text.H6 color='destructiveMutedForeground'>{error.message}</Text.H6>
        {activeTools !== undefined && (
          <Button
            variant='outline'
            className='border-destructive-muted-foreground'
            onClick={() => removeIntegrationTool(integration.name, '*', [])}
          >
            <Text.H6 color='destructiveMutedForeground'>
              Remove from prompt
            </Text.H6>
          </Button>
        )}
      </div>
    )
  }

  return (
    <>
      <div className='flex flex-row gap-2 p-4 items-center justify-between'>
        <Text.H6B color='foreground'>Enable all</Text.H6B>
        <SwitchToggle
          checked={allEnabled}
          onClick={toggleAllEnabled}
          disabled={disabled}
        />
      </div>
      {tools?.map((tool) => {
        const isActive =
          activeTools === true || (activeTools?.includes(tool.name) ?? false)

        return (
          <IntegrationToolItem
            key={tool.name}
            disabled={disabled}
            tool={tool}
            isActive={isActive}
            onToggle={() => toggleTool(tool.name)}
          />
        )
      })}
    </>
  )
}
