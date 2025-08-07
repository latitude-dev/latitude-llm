'use client'
import { AgentToolsMap } from '@latitude-data/constants'
import { ToolContent } from '@latitude-data/constants/legacyCompiler'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { ContentCard, ContentCardContainer } from '../ContentCard'
import { ToolResultContent, ToolResultFooter } from '../ToolResult'

export function LatitudeToolCallContent({
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
          {toolResponse && <ToolResultContent toolResponse={toolResponse} />}
        </ToolResultFooter>
      }
    >
      <ContentCardContainer>
        <CodeBlock language='json'>{JSON.stringify(args, null, 2)}</CodeBlock>
      </ContentCardContainer>
    </ContentCard>
  )
}
