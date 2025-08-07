'use client'
import type { AgentToolsMap } from '@latitude-data/constants'
import type { ToolContent } from '@latitude-data/constants/legacyCompiler'
import { ToolResultContent, ToolResultFooter } from '../ToolResult'
import { ContentCard, ContentCardContainer } from '../ContentCard'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'

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
      separatorColor={toolResponse?.isError ? 'destructiveMutedForeground' : undefined}
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
