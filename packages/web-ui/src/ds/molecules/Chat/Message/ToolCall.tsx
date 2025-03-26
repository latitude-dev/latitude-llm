import { ToolRequestContent, ToolContent } from '@latitude-data/compiler'
import { CodeBlock } from '../../../atoms'
import { ContentCard } from './ContentCard'
import { ToolCallContent as PromptlToolCall } from 'promptl-ai'
import { CodeLatitudeToolCallContent } from './LatitudeTools/Code'
import { WebSearchLatitudeToolCallContent } from './LatitudeTools/Search'
import { WebExtractLatitudeToolCallContent } from './LatitudeTools/Extract'
import type { CodeToolArgs } from '@latitude-data/core/services'
import type { SearchToolArgs } from '@latitude-data/core/services'
import type { ExtractToolArgs } from '@latitude-data/core/services'
import { SubAgentToolCallContent } from './LatitudeTools/SubAgent'
import {
  AGENT_RETURN_TOOL_NAME,
  AGENT_TOOL_PREFIX,
  AgentToolsMap,
  LatitudeToolInternalName,
} from '@latitude-data/constants'
import { ToolResultContent, ToolResultFooter } from './ToolResult'
import { AgentToolCallContent } from './LatitudeTools/Agent'

function toolArgs(
  value: ToolRequestContent | PromptlToolCall,
): Record<string, unknown> {
  if ('args' in value) return value.args
  if ('toolArguments' in value) return value.toolArguments
  return {}
}

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

  if (value.toolName === AGENT_RETURN_TOOL_NAME) {
    return <AgentToolCallContent value={value} />
  }

  const args = toolArgs(value)

  if (value.toolName === LatitudeToolInternalName.RunCode) {
    return (
      <CodeLatitudeToolCallContent
        toolCallId={value.toolCallId}
        args={args as CodeToolArgs}
        toolResponse={toolResponse}
      />
    )
  }

  if (value.toolName === LatitudeToolInternalName.WebSearch) {
    return (
      <WebSearchLatitudeToolCallContent
        toolCallId={value.toolCallId}
        args={args as SearchToolArgs}
        toolResponse={toolResponse}
      />
    )
  }

  if (value.toolName === LatitudeToolInternalName.WebExtract) {
    return (
      <WebExtractLatitudeToolCallContent
        toolCallId={value.toolCallId}
        args={args as ExtractToolArgs}
        toolResponse={toolResponse}
      />
    )
  }

  if (value.toolName.startsWith(AGENT_TOOL_PREFIX)) {
    return (
      <SubAgentToolCallContent
        toolCallId={value.toolCallId}
        toolName={value.toolName}
        args={args}
        agentToolsMap={agentToolsMap}
        toolResponse={toolResponse}
      />
    )
  }

  return (
    <ContentCard
      label='Tool requested'
      icon='puzzle'
      bgColor='bg-yellow'
      fgColor='warningForeground'
      info={value.toolCallId}
      infoColor='warningMutedForeground'
      resultFooter={
        <ToolResultFooter>
          {toolResponse && <ToolResultContent toolResponse={toolResponse} />}
        </ToolResultFooter>
      }
      separatorColor={
        toolResponse?.isError ? 'destructiveMutedForeground' : undefined
      }
    >
      <CodeBlock language='javascript'>
        {`${value.toolName}(${JSON.stringify(args, null, 2)})`}
      </CodeBlock>
    </ContentCard>
  )
}
