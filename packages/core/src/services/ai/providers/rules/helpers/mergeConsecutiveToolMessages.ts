import type {
  Message,
  ToolMessage,
  ToolResultContent,
} from '@latitude-data/constants/messages'

function hasToolCalls(message: Message) {
  if (message.role !== 'assistant') return false
  if (!Array.isArray(message.content)) return false

  return message.content.some((content) => content.type === 'tool-call')
}

function mergeToolMessageContent(messages: ToolMessage[]): ToolResultContent[] {
  return messages.flatMap((message) => message.content)
}

export function mergeConsecutiveToolMessages(messages: Message[]): Message[] {
  const merged: Message[] = []

  let index = 0
  while (index < messages.length) {
    const message = messages[index]!
    if (!hasToolCalls(message)) {
      merged.push(message)
      index += 1
      continue
    }

    merged.push(message)

    const consecutiveToolMessages: ToolMessage[] = []
    let nextIndex = index + 1

    while (nextIndex < messages.length) {
      const nextMessage = messages[nextIndex]!
      if (nextMessage.role !== 'tool') break

      consecutiveToolMessages.push(nextMessage)
      nextIndex += 1
    }

    if (consecutiveToolMessages.length === 1) {
      merged.push(consecutiveToolMessages[0]!)
    } else if (consecutiveToolMessages.length > 1) {
      merged.push({
        role: 'tool',
        content: mergeToolMessageContent(consecutiveToolMessages),
      })
    }

    index = consecutiveToolMessages.length > 0 ? nextIndex : index + 1
  }

  return merged
}
