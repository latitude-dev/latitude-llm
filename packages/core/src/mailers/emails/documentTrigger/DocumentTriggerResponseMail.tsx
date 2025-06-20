import React from 'react'

import { Text, Img, Markdown } from '@react-email/components'
import ContainerLayout from '../_components/ContainerLayout'
import {
  ContentType,
  type AssistantMessage,
  type MessageContent,
  type ToolCall,
} from '@latitude-data/compiler'
import { AGENT_RETURN_TOOL_NAME } from '@latitude-data/constants'
import PlainLayout from '../_components/PlainLayout'
import { TypedResult } from './../../../lib/Result'

function getAgentResponse(
  message: AssistantMessage,
): Record<string, unknown> | undefined {
  const agentToolCall = message.toolCalls.find(
    (toolCall) => toolCall.name === AGENT_RETURN_TOOL_NAME,
  )
  if (agentToolCall) return agentToolCall.arguments

  if (typeof message.content !== 'string') {
    const agentContentToolCall = message.content.find(
      (content) =>
        content.type === ContentType.toolCall &&
        content.toolName === AGENT_RETURN_TOOL_NAME,
    ) as ToolCall | undefined
    if (agentContentToolCall) return agentContentToolCall.arguments
  }

  return undefined
}

export default function DocumentTriggerResponseMail({
  result,
}: {
  result: TypedResult<AssistantMessage, Error>
}) {
  if (result.error) {
    return (
      <ContainerLayout title='Error' previewText='An error occurred.'>
        <Text>There was an error running your prompt:</Text>
        <Text>{result.error.message}</Text>
      </ContainerLayout>
    )
  }

  const message = result.value!
  const agentResponse = getAgentResponse(message)

  return (
    <PlainLayout
      previewText='Prompt response.'
      footerText={['This is an AI-generated response.', 'Powered by Latitude.']}
    >
      {agentResponse ? (
        <AgentResponseContent agentResponse={agentResponse} />
      ) : (
        <RegularPromptResponseContent message={message} />
      )}
    </PlainLayout>
  )
}

function AgentResponseContent({
  agentResponse,
}: {
  agentResponse: Record<string, unknown>
}) {
  const isDefaultSchema =
    Object.keys(agentResponse).length === 1 &&
    Object.keys(agentResponse)[0] === 'response' &&
    typeof agentResponse['response'] === 'string'

  const responseAsText: string = isDefaultSchema
    ? (agentResponse['response'] as string)
    : JSON.stringify(agentResponse, null, 2)

  return <Markdown>{responseAsText}</Markdown>
}

function RegularPromptResponseContent({
  message,
}: {
  message: AssistantMessage
}) {
  const content: MessageContent[] =
    typeof message.content === 'string'
      ? [{ type: ContentType.text, text: message.content }]
      : message.content.filter(
          (content) => content.type !== ContentType.toolCall,
        )

  return (
    <>
      {content.map((content, index) => {
        if (content.type === ContentType.text) {
          return content
            .text!.split('\n')
            .map((text, index) => <Text key={index}>{text}</Text>)
        }
        if (content.type === ContentType.image) {
          return <Img key={index} src={content.image as string} />
        }
      })}
    </>
  )
}

DocumentTriggerResponseMail.PreviewProps = {
  result: {
    error: undefined,
    value: {
      role: 'assistant',
      content: 'Hello, world!',
    },
  },
}
