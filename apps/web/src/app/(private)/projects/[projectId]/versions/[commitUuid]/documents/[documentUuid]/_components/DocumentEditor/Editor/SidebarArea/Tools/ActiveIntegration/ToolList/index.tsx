import { useCallback, use, useMemo, useEffect, useState, useRef } from 'react'
import { IndentationBar } from '$/components/Sidebar/Files/IndentationBar'
import useIntegrationTools from '$/stores/integrationTools'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ActiveIntegration } from '../../../toolsHelpers/types'
import { ToolsContext } from '../../ToolsProvider'
import { useSidebarStore } from '../../../hooks/useSidebarStore'
import { useAnimatedItems } from './useAnimatedItems'
import { CLIENT_TOOLS_INTEGRATION_NAME } from '../../../toolsHelpers/collectTools'
import { parseMarkdownLinks } from '$/components/Pipedream/utils'

const MAX_VISIBLE_TOOLS = 10

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
  activeTools: ActiveIntegration['tools'],
  toolName: string,
) {
  if (typeof activeTools === 'boolean') {
    return activeTools === true
  }
  return activeTools.includes(toolName)
}

const TOOL_EMPTY: [] = []
export function ToolList({ integration }: { integration: ActiveIntegration }) {
  const isClientTools = integration.name === CLIENT_TOOLS_INTEGRATION_NAME

  const {
    data: fetchedTools = TOOL_EMPTY,
    isLoading: isFetchingTools,
    error: fetchError,
  } = useIntegrationTools(isClientTools ? undefined : integration)

  // For custom tools, create tool objects from allToolNames with metadata
  const customToolsData = useMemo(() => {
    if (!isClientTools) return TOOL_EMPTY
    return integration.allToolNames.map((toolName) => {
      const metadata = integration.clientToolsMetadata?.[toolName]
      const parameters = metadata?.parameters as any

      return {
        name: toolName,
        description: metadata?.description,
        displayName: undefined,
        inputSchema: parameters ?? {
          type: 'object' as const,
          properties: {},
          additionalProperties: false,
        },
      }
    })
  }, [isClientTools, integration.allToolNames, integration.clientToolsMetadata])

  const tools = isClientTools ? customToolsData : fetchedTools
  const isLoading = isClientTools ? false : isFetchingTools
  const error = isClientTools ? null : fetchError

  const { addIntegrationTool, removeIntegrationTool } = use(ToolsContext)
  const setIntegrationToolNames = useSidebarStore(
    (state) => state.setIntegrationToolNames,
  )
  const { commit } = useCurrentCommit()
  const isLive = !!commit.mergedAt
  const [showAll, setShowAll] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const toggleTool = useCallback(
    (toolName: string) => () => {
      if (isLive) return
      if (!tools) return
      if (isClientTools) return // Don't allow toggling custom tools

      const isActive = checkIsActive(integration.tools, toolName)

      if (isActive) {
        removeIntegrationTool({
          integrationName: integration.name,
          toolName,
          allToolNames: tools.map((t) => t.name),
        })
      } else {
        addIntegrationTool({
          integrationName: integration.name,
          toolName,
        })
      }
    },
    [
      tools,
      isLive,
      isClientTools,
      addIntegrationTool,
      removeIntegrationTool,
      integration,
    ],
  )
  // Sort tools to show active ones first (in document order), then inactive ones
  const sortedTools = useMemo(() => {
    if (!tools || tools.length === 0) return []

    const activeToolNames = Array.isArray(integration.tools)
      ? integration.tools
      : []

    // Split into active and inactive
    const activeTools: (typeof tools)[number][] = []
    const inactiveTools: (typeof tools)[number][] = []

    tools.forEach((tool) => {
      if (integration.tools === true || activeToolNames.includes(tool.name)) {
        activeTools.push(tool)
      } else {
        inactiveTools.push(tool)
      }
    })

    // Sort active tools by their position in the config
    if (Array.isArray(integration.tools)) {
      activeTools.sort((a, b) => {
        const indexA = activeToolNames.indexOf(a.name)
        const indexB = activeToolNames.indexOf(b.name)
        return indexA - indexB
      })
    }

    return [...activeTools, ...inactiveTools]
  }, [tools, integration.tools])

  // Filter tools based on search query
  const filteredTools = useMemo(() => {
    if (!searchQuery.trim()) return sortedTools

    const query = searchQuery.toLowerCase()
    return sortedTools.filter((tool) => {
      const name = tool.name.toLowerCase()
      const displayName = (tool.displayName ?? '').toLowerCase()
      return name.includes(query) || displayName.includes(query)
    })
  }, [sortedTools, searchQuery])

  useEffect(() => {
    // Skip setting tool names for custom tools - they're already in allToolNames
    if (isClientTools) return

    if (tools && tools.length > 0) {
      setIntegrationToolNames({
        integrationName: integration.name,
        toolNames: tools.map((t) => t.name),
      })
    }
  }, [tools, integration.name, setIntegrationToolNames, isClientTools])

  const hasMoreTools = sortedTools.length > MAX_VISIBLE_TOOLS
  const shouldShowSearch = sortedTools.length > MAX_VISIBLE_TOOLS
  const visibleTools = showAll
    ? filteredTools
    : filteredTools.slice(0, MAX_VISIBLE_TOOLS)
  const shouldShowMoreButton = hasMoreTools && !showAll && !searchQuery.trim()
  const shouldShowLessButton = hasMoreTools && showAll && !searchQuery.trim()
  useAnimatedItems({
    containerRef,
    isLoading,
    sortedTools,
    error,
  })

  if (isLoading) return <ToolListLoader numberOfItems={5} />

  if (error) {
    return (
      <div className='w-full h-full flex flex-col gap-2 bg-destructive-muted p-4 rounded-xl'>
        <Text.H5B color='destructiveMutedForeground'>
          Error loading tools
        </Text.H5B>
        <Text.H6 color='destructiveMutedForeground'>{error.message}</Text.H6>
        {integration.tools !== undefined && (
          <Button
            variant='outline'
            className='border-destructive-muted-foreground'
            onClick={() => {
              removeIntegrationTool({
                integrationName: integration.name,
                toolName: '*',
                allToolNames: [],
              })
            }}
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
    <div
      ref={containerRef}
      className='flex flex-col gap-1 min-w-0'
      style={{ position: 'relative' }}
    >
      {shouldShowSearch && (
        <div className='w-full flex items-center gap-2 min-w-0'>
          <IndentationBar
            startOnIndex={0}
            hasChildren={false}
            indentation={[{ isLast: false }]}
          />
          <input
            type='text'
            placeholder='Search tools...'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className='mt-1 w-full bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground'
          />
        </div>
      )}
      {visibleTools.map((tool, index) => {
        const isActive = checkIsActive(integration.tools, tool.name)
        const isLastTool = index === visibleTools.length - 1
        const parsedDescription = tool.description
          ? parseMarkdownLinks(tool.description)
          : null

        // Get parameters for client tools
        const inputSchema = tool.inputSchema as any
        const hasParameters =
          isClientTools &&
          inputSchema?.properties &&
          typeof inputSchema.properties === 'object'
        const parameters = hasParameters
          ? Object.entries(inputSchema.properties)
          : []
        const requiredParams =
          isClientTools &&
          inputSchema?.required &&
          Array.isArray(inputSchema.required)
            ? inputSchema.required
            : []

        return (
          <div key={tool.name} className='flex flex-col'>
            <div
              role='button'
              tabIndex={0}
              aria-disabled={isLive || isClientTools}
              data-tool-id={tool.name}
              onClick={isClientTools ? undefined : toggleTool(tool.name)}
              className='w-full flex items-center justify-between'
            >
              <div className='w-full flex items-center gap-2 min-w-0'>
                <IndentationBar
                  startOnIndex={0}
                  hasChildren={false}
                  indentation={[
                    {
                      isLast:
                        isLastTool &&
                        !shouldShowMoreButton &&
                        !shouldShowLessButton,
                    },
                  ]}
                />
                <div className='w-full flex justify-between items-center min-w-0 gap-x-2'>
                  <div className='flex-1 flex items-center gap-2 min-w-0'>
                    {parsedDescription ? (
                      <Tooltip
                        delayDuration={800}
                        trigger={
                          <Text.H5
                            ellipsis
                            noWrap
                            color='foreground'
                            showNativeTitle={false}
                          >
                            {tool.displayName ?? tool.name}
                          </Text.H5>
                        }
                        side='top'
                        align='start'
                      >
                        <div
                          className='text-background [&>a]:underline [&>a]:text-background'
                          dangerouslySetInnerHTML={{
                            __html: `
                            <strong>${tool.displayName ?? tool.name}</strong><br/>
                            ${parsedDescription}
                            `,
                          }}
                        />
                      </Tooltip>
                    ) : (
                      <Text.H5 ellipsis noWrap color='foreground'>
                        {tool.displayName ?? tool.name}
                      </Text.H5>
                    )}
                  </div>
                  {!isClientTools && (
                    <SwitchToggle checked={isActive} disabled={isLive} />
                  )}
                </div>
              </div>
            </div>

            {/* Display parameters for client tools */}
            {hasParameters &&
              parameters.map(([paramName, paramSchema]) => {
                const isRequired = requiredParams.includes(paramName)
                const paramDescription =
                  typeof paramSchema === 'object' &&
                  paramSchema !== null &&
                  'description' in paramSchema
                    ? String(paramSchema.description)
                    : undefined
                const isLastToolOverall =
                  isLastTool && !shouldShowMoreButton && !shouldShowLessButton

                return (
                  <div
                    key={paramName}
                    className='w-full flex items-center gap-2 min-w-0'
                  >
                    <IndentationBar
                      startOnIndex={0}
                      hasChildren={false}
                      indentation={[
                        {
                          isLast: isLastToolOverall,
                          invisible: isLastToolOverall,
                        },
                        { isLast: false, invisible: true },
                      ]}
                    />
                    {paramDescription ? (
                      <Tooltip
                        delayDuration={800}
                        trigger={
                          <Text.H6
                            ellipsis
                            noWrap
                            color='foregroundMuted'
                            showNativeTitle={false}
                          >
                            {paramName}
                            {isRequired && (
                              <span className='text-destructive'>*</span>
                            )}
                          </Text.H6>
                        }
                        side='top'
                        align='start'
                      >
                        <div className='text-background'>
                          <strong>{paramName}</strong>
                          <br />
                          {paramDescription}
                        </div>
                      </Tooltip>
                    ) : (
                      <Text.H6 ellipsis noWrap color='foregroundMuted'>
                        {paramName}
                        {isRequired && (
                          <span className='text-destructive'>*</span>
                        )}
                      </Text.H6>
                    )}
                  </div>
                )
              })}
          </div>
        )
      })}
      {shouldShowMoreButton && (
        <button
          onClick={() => setShowAll(true)}
          className='w-full flex items-center gap-2 min-w-0 cursor-pointer hover:opacity-70'
        >
          <IndentationBar
            startOnIndex={0}
            hasChildren={false}
            indentation={[{ isLast: true }]}
          />
          <Text.H5 color='accentForeground'>
            + Show {filteredTools.length - MAX_VISIBLE_TOOLS} more
          </Text.H5>
        </button>
      )}
      {shouldShowLessButton && (
        <button
          onClick={() => setShowAll(false)}
          className='w-full flex items-center gap-2 min-w-0 cursor-pointer hover:opacity-70'
        >
          <IndentationBar
            startOnIndex={0}
            hasChildren={false}
            indentation={[{ isLast: true }]}
          />
          <Text.H5 color='accentForeground'>- Show less</Text.H5>
        </button>
      )}
    </div>
  )
}
