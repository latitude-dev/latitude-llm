import React from 'react'
import { Text, Img } from '@react-email/components'
import ContainerLayout from '../_components/ContainerLayout'
import {
  type AssistantMessage,
  type MessageContent,
} from '@latitude-data/constants/legacyCompiler'
import PlainLayout from '../_components/PlainLayout'
import { TypedResult } from './../../../lib/Result'

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

  return (
    <PlainLayout
      previewText='Prompt response.'
      footerText={['This is an AI-generated response.', 'Powered by Latitude.']}
    >
      <RegularPromptResponseContent message={message} />
    </PlainLayout>
  )
}

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
            .map((text, index) => <Text key={index}>{text}</Text>)
        }
        if (content.type === 'image') {
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
