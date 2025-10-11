import { useCallback, useMemo } from 'react'
import { IndentationBar } from '$/components/Sidebar/Files/IndentationBar'
import useIntegrationTools from '$/stores/integrationTools'
import { IntegrationDto } from '@latitude-data/core/schema/types'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ActiveIntegrationData } from '..'
import { UseActiveIntegrationsReturn } from '../../hooks/useActiveIntegrations'

function ToolListLoader({ numberOfItems }: { numberOfItems: number }) {
  const toolItems = useMemo(
    () => Array.from({ length: numberOfItems }),
    [numberOfItems],
  )
  return (
    <div className='flex flex-col gap-1'>
      {toolItems.map((_, index) => (
        <div key={index} className='flex items-center justify-between h-6'>
          <div className='flex items-center gap-2'>
            <IndentationBar
              startOnIndex={0}
              hasChildren={false}
              indentation={[{ isLast: index === toolItems.length - 1 }]}
            />
            <div className='flex items-center gap-2'>
              <Skeleton height='h6' className='w-32' />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function checkIsActive(
  activeTools: ActiveIntegrationData['activeTools'],
  toolName: string,
) {
  if (typeof activeTools === 'boolean') {
    return activeTools === true
  }
  return activeTools.includes(toolName)
}

const TOOL_EMPTY: [] = []
export function ToolList({
  integration,
  activeTools,
  addIntegrationTool,
  removeIntegrationTool,
}: {
  integration: IntegrationDto
  activeTools: ActiveIntegrationData['activeTools']
  addIntegrationTool: UseActiveIntegrationsReturn['addIntegrationTool']
  removeIntegrationTool: UseActiveIntegrationsReturn['removeIntegrationTool']
}) {
  const {
    data: tools = TOOL_EMPTY,
    isLoading,
    isValidating,
    error,
  } = useIntegrationTools(integration)
  const { commit } = useCurrentCommit()
  const isLive = !!commit.mergedAt
  const toggleTool = useCallback(
    (toolName: string) => () => {
      if (isLive) return
      if (!tools) return

      const isActive = checkIsActive(activeTools, toolName)
      if (isActive) {
        removeIntegrationTool({
          integrationName: integration.name,
          toolName,
          integrationToolNames: tools.map((t) => t.name),
        })
      } else {
        addIntegrationTool({
          integrationName: integration.name,
          toolName,
        })
      }
    },
    [
      activeTools,
      tools,
      isLive,
      addIntegrationTool,
      removeIntegrationTool,
      integration.name,
    ],
  )

  console.log({ isLoading, isValidating})
  if (isLoading) return <ToolListLoader numberOfItems={5} />

  if (error) {
    return (
      <div className='w-full h-full flex flex-col gap-2 bg-destructive-muted p-4 rounded-xl'>
        <Text.H5B color='destructiveMutedForeground'>
          Error loading tools
        </Text.H5B>
        <Text.H6 color='destructiveMutedForeground'>{error.message}</Text.H6>
        {activeTools !== undefined && (
          <Button
            variant='outline'
            className='border-destructive-muted-foreground'
            onClick={() =>
              removeIntegrationTool({
                integrationName: integration.name,
                toolName: '*',
                integrationToolNames: [],
              })
            }
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
    <div className='flex flex-col gap-1 min-w-0'>
      {tools.map((tool, index) => {
        const isActive = checkIsActive(activeTools, tool.name)
        return (
          <div
            key={tool.name}
            className='flex items-center justify-between h-6'
          >
            <div className='flex items-center gap-2 min-w-0'>
              <IndentationBar
                startOnIndex={0}
                hasChildren={false}
                indentation={[{ isLast: index === tools.length - 1 }]}
              />
              <div className='flex justify-between items-center min-w-0 gap-x-2'>
                <div className='flex items-center gap-2 min-w-0'>
                  <div className='shrink-0 max-w-40 min-w-0 flex'>
                    <Text.H5 ellipsis noWrap color='foreground'>
                      {tool.displayName ?? tool.name}
                    </Text.H5>
                  </div>
                  <Text.H5 noWrap ellipsis color='foregroundMuted'>
                    {tool.description}
                  </Text.H5>
                </div>
                <SwitchToggle
                  checked={isActive}
                  onClick={toggleTool(tool.name)}
                  disabled={isLive}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
