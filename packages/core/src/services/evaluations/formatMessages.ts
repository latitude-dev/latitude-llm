import { capitalize } from 'lodash-es'

import { Message, MessageContent, TextContent } from '@latitude-data/compiler'

function formatMessage(message: Message) {
  if (typeof message.content === 'string') {
    return `${capitalize(message.role)}: \n ${message.content}`
  } else {
    const content = message.content[0] as MessageContent
    if (content.type === 'text') {
      return `${capitalize(message.role)}: \n ${(content as TextContent).text}`
    } else {
      return `${capitalize(message.role)}: <${content.type} message>`
    }
  }
}

export function formatMessages(messages: Message[]) {
  return messages.map((message) => formatMessage(message)).join('\n')
}
