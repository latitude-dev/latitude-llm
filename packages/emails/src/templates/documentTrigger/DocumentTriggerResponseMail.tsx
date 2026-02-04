import React from 'react'
import {
  type AssistantMessage,
  type MessageContent,
} from '@latitude-data/constants/messages'
import { Column, Img, Row } from '@react-email/components'
import { Text } from '../../components/Text'
import ContainerLayout from '../../components/ContainerLayout'

function RegularPromptResponseContent({
  message,
}: {
  message: AssistantMessage
}) {
  const content: MessageContent[] =
    typeof message.content === 'string'
      ? [{ type: 'text', text: message.content }]
      : message.content.filter((content) => content.type !== 'tool-call')

  return (
    <>
      {content.map((content, index) => {
        if (content.type === 'text') {
          return content
            .text!.split('\n')
            .map((text, index) => <Text.H5 key={index}>{text}</Text.H5>)
        }
        if (content.type === 'image') {
          return <Img key={index} src={content.image as string} />
        }
      })}
    </>
  )
}

type Props = {
  error?: Error | null
  message?: AssistantMessage | null
}
export default function DocumentTriggerResponseMail({ error, message }: Props) {
  const title = error ? 'Error' : !message ? 'No Response' : 'Prompt Response'
  const previewText = error
    ? 'An error occurred.'
    : !message
      ? 'No response received.'
      : 'Prompt response.'

  return (
    <ContainerLayout
      title={title}
      previewText={previewText}
      footer={
        <Row>
          <Column>
            <Text.H6 color='foregroundMuted'>
              This is an AI-generated response.
            </Text.H6>
          </Column>
          <Column align='right'>
            <Text.H6 align='right' color='foregroundMuted'>
              Powered by Latitude
            </Text.H6>
          </Column>
        </Row>
      }
    >
      {error && <Text.H5>An error occurred: {error.message}</Text.H5>}
      {!error && !message && (
        <Text.H5>No response was received from the AI.</Text.H5>
      )}
      {!error && message && <RegularPromptResponseContent message={message} />}
    </ContainerLayout>
  )
}

DocumentTriggerResponseMail.PreviewProps = {
  error: undefined,
  message: {
    role: 'assistant',
    content: [{ type: 'text', text: 'Hello, world!' }],
  } as AssistantMessage,
} satisfies Props
