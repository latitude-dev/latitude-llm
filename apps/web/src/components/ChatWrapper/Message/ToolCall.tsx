'use client'

import {
  AGENT_TOOL_PREFIX,
  AgentToolsMap,
  humanizeTool,
  LATITUDE_TOOL_PREFIX,
} from '@latitude-data/constants'
import {
  ToolContent,
  ToolRequestContent,
} from '@latitude-data/constants/legacyCompiler'
import { useMemo } from 'react'
import { ToolCard } from './ToolCard'

export function ToolCallContent({
  value,
  agentToolsMap,
  toolContentMap,
}: {
  value: ToolRequestContent
  agentToolsMap?: AgentToolsMap
  toolContentMap?: Record<string, ToolContent>
}) {
  const toolResponse = toolContentMap?.[value.toolCallId]

  const isClientTool = useMemo(() => {
    if (value.toolName.startsWith(AGENT_TOOL_PREFIX)) return false
    if (value.toolName.startsWith(LATITUDE_TOOL_PREFIX)) return false
    return true
  }, [value.toolName])

  const customIcon = useMemo(() => {
    if (value.toolName.startsWith(AGENT_TOOL_PREFIX)) return 'bot'

    return undefined
  }, [value.toolName])

  const customLabel = useMemo(() => {
    const { toolName } = value
    if (value.toolName.startsWith(AGENT_TOOL_PREFIX)) {
      // Find the agent name in the agentToolsMap
      const agentPath = agentToolsMap?.[toolName]
      if (agentPath) return agentPath
    }

    return humanizeTool(value.toolName)
  }, [value, agentToolsMap])

  return (
    <ToolCard
      toolRequest={value}
      toolResponse={toolResponse}
      customIcon={customIcon}
      customLabel={customLabel}
      customToolCallId={isClientTool ? value.toolCallId : undefined}
    />
  )
}
