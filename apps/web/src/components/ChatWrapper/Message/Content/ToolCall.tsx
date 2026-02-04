'use client'

import {
  ToolResultContent,
  ToolRequestContent,
} from '@latitude-data/constants/messages'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { useMemo } from 'react'
import { IntegrationToolCard } from './ToolCall/Integration'
import { GenericToolCard } from './ToolCall/Generic'
import { AgentToolCard } from './ToolCall/Agent'
import { ProviderToolCard } from './ToolCall/Provider'
import { LatitudeToolCard } from './ToolCall/LatitudeTool'
import { ClientToolCard } from './ToolCall/Client'
import { ToolCallStatus } from './ToolCall/_components/ToolCard'

export function ToolCallMessageContent({
  toolRequest,
  toolContentMap,
  debugMode,
  messageIndex,
  contentBlockIndex,
  isStreaming = false,
}: {
  toolRequest: ToolRequestContent
  toolContentMap?: Record<string, ToolResultContent>
  debugMode?: boolean
  messageIndex?: number
  contentBlockIndex?: number
  isStreaming?: boolean
}) {
  const toolResponse = useMemo(
    () => toolContentMap?.[toolRequest.toolCallId],
    [toolContentMap, toolRequest.toolCallId],
  )
  const sourceData = useMemo(() => toolRequest._sourceData, [toolRequest])
  const status: ToolCallStatus = useMemo(() => {
    if (!toolResponse) return isStreaming ? 'running' : 'waiting'
    if (toolResponse.isError) return 'error'
    return 'success'
  }, [toolResponse, isStreaming])

  if (sourceData?.source === ToolSource.Latitude) {
    return (
      <LatitudeToolCard
        toolRequest={toolRequest}
        toolResponse={toolResponse}
        status={status}
        sourceData={sourceData}
        debugMode={debugMode}
        messageIndex={messageIndex}
        contentBlockIndex={contentBlockIndex}
      />
    )
  }
  if (sourceData?.source === ToolSource.Integration) {
    return (
      <IntegrationToolCard
        toolRequest={toolRequest}
        toolResponse={toolResponse}
        status={status}
        sourceData={sourceData}
        messageIndex={messageIndex}
        contentBlockIndex={contentBlockIndex}
      />
    )
  }
  if (sourceData?.source === ToolSource.Agent) {
    return (
      <AgentToolCard
        toolRequest={toolRequest}
        toolResponse={toolResponse}
        status={status}
        sourceData={sourceData}
        messageIndex={messageIndex}
        contentBlockIndex={contentBlockIndex}
      />
    )
  }
  if (sourceData?.source === ToolSource.ProviderTool) {
    return (
      <ProviderToolCard
        toolRequest={toolRequest}
        toolResponse={toolResponse}
        status={status}
        sourceData={sourceData}
        messageIndex={messageIndex}
        contentBlockIndex={contentBlockIndex}
      />
    )
  }
  if (sourceData?.source === ToolSource.Client) {
    return (
      <ClientToolCard
        toolRequest={toolRequest}
        toolResponse={toolResponse}
        status={status}
        messageIndex={messageIndex}
        contentBlockIndex={contentBlockIndex}
      />
    )
  }

  return (
    <GenericToolCard
      toolRequest={toolRequest}
      toolResponse={toolResponse}
      status={status}
      messageIndex={messageIndex}
      contentBlockIndex={contentBlockIndex}
    />
  )
}
