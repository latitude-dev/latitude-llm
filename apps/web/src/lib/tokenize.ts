import { Message } from '@latitude-data/constants/messages'

export function tokenizeBytes(bytes: number) {
  return Math.ceil(bytes / 4)
}

export function tokenizeText(text: string) {
  return tokenizeBytes(text.length)
}

export function tokenizeMessages(messages: Message[]) {
  let length = 0

  for (const message of messages) {
    if (Array.isArray(message.content)) {
      for (const content of message.content) {
        switch (content.type) {
          case 'text':
            length += content.text?.length ?? 0
            break
          case 'reasoning':
            length += content.text?.length ?? 0
            break
          case 'redacted-reasoning':
            length += content.data?.length ?? 0
            break
          case 'tool-call':
            length += JSON.stringify(content.args).length
            break
          case 'tool-result':
            length += JSON.stringify(content.result).length
            break
          default:
            break
        }
      }
    }
  }

  return tokenizeBytes(length)
}
