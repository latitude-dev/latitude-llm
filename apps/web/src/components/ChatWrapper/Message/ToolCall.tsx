'use client'

import {
  ToolContent,
  ToolRequestContent,
} from '@latitude-data/constants/legacyCompiler'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { useMemo } from 'react'
import { IntegrationToolCard } from './ToolCall/Integration'
import { GenericToolCard } from './ToolCall/Generic'
import { AgentToolCard } from './ToolCall/Agent'
import { ProviderToolCard } from './ToolCall/Provider'

export function ToolCallContent({
  toolRequest,
  toolContentMap,
}: {
  toolRequest: ToolRequestContent
  toolContentMap?: Record<string, ToolContent>
}) {
  const toolResponse = useMemo(
    () => toolContentMap?.[toolRequest.toolCallId],
    [toolContentMap, toolRequest.toolCallId],
  )
  const sourceData = useMemo(() => toolRequest._sourceData, [toolRequest])
  const status = useMemo(() => {
    if (!toolResponse) return 'pending'
    if (toolResponse.isError) return 'error'
    return 'success'
  }, [toolResponse])

  if (sourceData?.source === ToolSource.Integration) {
    return (
      <IntegrationToolCard
        toolRequest={toolRequest}
        toolResponse={toolResponse}
        status={status}
        sourceData={sourceData}
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
      />
    )
  }

  return (
    <GenericToolCard
      toolRequest={toolRequest}
      toolResponse={toolResponse}
      status={status}
    />
  )
}
