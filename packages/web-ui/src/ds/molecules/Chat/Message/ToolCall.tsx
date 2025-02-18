import { ToolRequestContent } from '@latitude-data/compiler'
import {
  AGENT_RETURN_TOOL_NAME,
  LatitudeToolInternalName,
} from '@latitude-data/core/browser'
import { CodeBlock } from '../../../atoms'
import { CardTextContent, ContentCard } from './ContentCard'
import { ToolCallContent as PromptlToolCall } from 'promptl-ai'
import { CodeLatitudeToolCallContent } from './LatitudeTools/Code'
import { WebSearchLatitudeToolCallContent } from './LatitudeTools/Search'
import { WebExtractLatitudeToolCallContent } from './LatitudeTools/Extract'
import type { CodeToolArgs } from '@latitude-data/core/services/latitudeTools/runCode/types'
import type { SearchToolArgs } from '@latitude-data/core/services/latitudeTools/webSearch/types'
import type { ExtractToolArgs } from '@latitude-data/core/services/latitudeTools/webExtract/types'
import {
  type AgentToolsMap,
  AGENT_TOOL_PREFIX,
} from '@latitude-data/core/browser'
import { SubAgentToolCallContent } from './LatitudeTools/SubAgent'

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
}: {
  value: ToolRequestContent
  agentToolsMap?: AgentToolsMap
}) {
  if (value.toolName === AGENT_RETURN_TOOL_NAME) {
    return <AgentToolCallContent value={value} />
  }

  const args = toolArgs(value)

  if (value.toolName === LatitudeToolInternalName.RunCode) {
    return (
      <CodeLatitudeToolCallContent
        toolCallId={value.toolCallId}
        args={args as CodeToolArgs}
      />
    )
  }

  if (value.toolName === LatitudeToolInternalName.WebSearch) {
    return (
      <WebSearchLatitudeToolCallContent
        toolCallId={value.toolCallId}
        args={args as SearchToolArgs}
      />
    )
  }

  if (value.toolName === LatitudeToolInternalName.WebExtract) {
    return (
      <WebExtractLatitudeToolCallContent
        toolCallId={value.toolCallId}
        args={args as ExtractToolArgs}
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
    >
      <CodeBlock language='javascript'>
        {`${value.toolName}(${JSON.stringify(args, null, 2)})`}
      </CodeBlock>
    </ContentCard>
  )
}

export function AgentToolCallContent({ value }: { value: ToolRequestContent }) {
  const isDefaultSchema =
    Object.keys(value.args).length === 1 &&
    Object.keys(value.args)[0] === 'response'
  return (
    <ContentCard
      label='Agent response'
      icon='bot'
      bgColor='bg-primary'
      fgColor='accent'
    >
      {isDefaultSchema ? (
        <CardTextContent
          value={value.args['response'] as string}
          color='primary'
        />
      ) : (
        <CodeBlock language='json'>
          {JSON.stringify(value.args, null, 2)}
        </CodeBlock>
      )}
    </ContentCard>
  )
}
