import useIntegrationTools from '$/stores/integrationTools'
import { McpTool } from '@latitude-data/constants'
import { Integration } from '@latitude-data/core/browser'
import {
  Badge,
  Button,
  Skeleton,
  SwitchToogle,
  Text,
  Tooltip,
} from '@latitude-data/web-ui'
import { useCallback } from 'react'

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
        <SwitchToogle
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
  integration: Integration
  activeTools: string[] | true | undefined
  addIntegrationTool: (integrationName: string, toolName: string) => void
  removeIntegrationTool: (
    integrationName: string,
    toolName: string,
    toolNames: string[],
  ) => void
}) {
  const { data: tools, isLoading, error } = useIntegrationTools(integration)

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

  if (isLoading) {
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
        <SwitchToogle
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
