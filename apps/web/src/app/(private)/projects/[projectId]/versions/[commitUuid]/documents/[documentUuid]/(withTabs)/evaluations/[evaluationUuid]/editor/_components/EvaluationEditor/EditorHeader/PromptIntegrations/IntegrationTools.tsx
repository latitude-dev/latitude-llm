import { ReactNode, useCallback } from 'react'
import useIntegrationTools, { McpToolDto } from '$/stores/integrationTools'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { cn } from '@latitude-data/web-ui/utils'
import { IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'

export function ItemWrapper({
  children,
  isFirst,
}: {
  children: ReactNode
  isFirst?: boolean
}) {
  return (
    <div
      className={cn('flex flex-col gap-2 p-4', {
        'border-t border-border': !isFirst,
      })}
    >
      {children}
    </div>
  )
}

function IntegrationToolItem({
  disabled,
  tool,
  isFirst,
  isActive,
  onToggle,
}: {
  disabled?: boolean
  isFirst?: boolean
  tool: McpToolDto
  isActive: boolean
  onToggle: () => void
}) {
  return (
    <ItemWrapper isFirst={isFirst}>
      <div className='flex flex-row items-center gap-2 justify-between min-w-0'>
        <Text.H6B ellipsis noWrap color='foreground'>
          {tool.displayName ?? tool.name}
        </Text.H6B>
        <SwitchToggle
          checked={isActive}
          onClick={onToggle}
          disabled={disabled}
        />
      </div>
      <Text.H5 color='foregroundMuted'>{tool.description}</Text.H5>
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
    </ItemWrapper>
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
  const toggleTool = useCallback(
    (toolName: string) => () => {
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
    [
      activeTools,
      tools,
      disabled,
      addIntegrationTool,
      removeIntegrationTool,
      integration.name,
    ],
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

  if (isLoading || isValidating) {
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
    <div className='divide-y divide-border'>
      <ItemWrapper isFirst>
        <Text.H6B color='foreground'>Enable all</Text.H6B>
        <SwitchToggle
          checked={allEnabled}
          onClick={toggleAllEnabled}
          disabled={disabled}
        />
      </ItemWrapper>
      {tools?.map((tool) => {
        const isActive =
          activeTools === true || (activeTools?.includes(tool.name) ?? false)

        return (
          <IntegrationToolItem
            key={tool.name}
            disabled={disabled}
            tool={tool}
            isActive={isActive}
            onToggle={toggleTool(tool.name)}
          />
        )
      })}
    </div>
  )
}
