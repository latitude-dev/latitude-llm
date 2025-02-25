'use client'
import { ContentCard, ContentCardContainer } from '../ContentCard'
import { CodeBlock } from '../../../../atoms'
import { AgentToolsMap } from '@latitude-data/constants'
import { ToolContent } from '@latitude-data/compiler'
import { ToolResultContent, ToolResultFooter } from '../ToolResult'

export function SubAgentToolCallContent({
  toolCallId,
  toolName,
  args,
  agentToolsMap,
  toolResponse,
}: {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  agentToolsMap?: AgentToolsMap
  toolResponse?: ToolContent
}) {
  const agentName = agentToolsMap?.[toolName] ?? toolName

  return (
    <ContentCard
      label={agentName}
      icon='bot'
      bgColor='bg-success'
      fgColor='successForeground'
      info={toolCallId}
      separatorColor={
        toolResponse?.isError ? 'destructiveMutedForeground' : undefined
      }
      resultFooter={
        <ToolResultFooter loadingMessage='Waiting for agent response...'>
          {toolResponse && (
            <SubAgentToolResponseContent toolResponse={toolResponse} />
          )}
        </ToolResultFooter>
      }
    >
      <ContentCardContainer>
        <CodeBlock language='json'>{JSON.stringify(args, null, 2)}</CodeBlock>
      </ContentCardContainer>
    </ContentCard>
  )
}

function SubAgentToolResponseContent({
  toolResponse,
}: {
  toolResponse: ToolContent
}) {
  const value = toolResponse.result as Record<string, unknown> | string
  const isDefaultSchema =
    typeof value !== 'string' &&
    Object.keys(value).length === 1 &&
    Object.keys(value)[0] === 'response'

  return (
    <ToolResultContent
      toolResponse={{
        ...toolResponse,
        result: isDefaultSchema ? value['response'] : value,
      }}
    />
  )
}
