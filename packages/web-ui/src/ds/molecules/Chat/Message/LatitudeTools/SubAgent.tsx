'use client'
import {
  CardTextContent,
  ContentCard,
  ContentCardContainer,
} from '../ContentCard'
import { CodeBlock } from '../../../../atoms'
import { AgentToolsMap } from '@latitude-data/constants'

export function SubAgentToolCallContent({
  toolCallId,
  toolName,
  args,
  agentToolsMap,
}: {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  agentToolsMap?: AgentToolsMap
}) {
  const agentName = agentToolsMap?.[toolName] ?? toolName

  return (
    <ContentCard
      label={agentName}
      icon='bot'
      bgColor='bg-success'
      fgColor='successForeground'
      info={toolCallId}
    >
      <ContentCardContainer>
        <CodeBlock language='json'>{JSON.stringify(args, null, 2)}</CodeBlock>
      </ContentCardContainer>
    </ContentCard>
  )
}

export function SubAgentToolResponseContent({
  toolCallId,
  toolName,
  isError,
  response,
  agentToolsMap,
}: {
  toolCallId: string
  toolName: string
  isError?: boolean
  response: Record<string, unknown>
  agentToolsMap?: AgentToolsMap
}) {
  const agentName = agentToolsMap?.[toolName] ?? toolName
  const isDefaultSchema =
    !isError &&
    Object.keys(response).length === 1 &&
    Object.keys(response)[0] === 'response'

  const bgColor = isError ? 'bg-destructive' : 'bg-muted'
  const fgColor = isError ? 'destructiveForeground' : 'foregroundMuted'

  return (
    <ContentCard
      label={agentName}
      icon='bot'
      bgColor={bgColor}
      fgColor={fgColor}
      info={toolCallId}
    >
      {isDefaultSchema ? (
        <CardTextContent
          value={response['response'] as string}
          color={fgColor}
        />
      ) : (
        <CodeBlock language='json'>
          {JSON.stringify(response, null, 2)}
        </CodeBlock>
      )}
    </ContentCard>
  )
}
