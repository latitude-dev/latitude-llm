import {
  ToolPart,
  ToolRequest,
  PromptlVersion,
  VersionedMessage,
  extractToolContents,
} from '@latitude-data/web-ui'
import { Message as CompilerMessage } from '@latitude-data/compiler'
import { useCallback, useState } from 'react'

function isToolRequest(part: ToolPart): part is ToolRequest {
  return 'toolCallId' in part
}

function getUnrespondedToolRequests<V extends PromptlVersion>({
  version: _,
  messages,
}: {
  version: V
  messages: VersionedMessage<V>[]
}) {
  // FIXME: Kill compiler please. I made this module compatible with
  // both old compiler and promptl. But because everything is typed with
  // old compiler prompts in promptl version are also formatted as old compiler
  const parts = extractToolContents({
    version: 0,
    messages: messages as VersionedMessage<0>[],
  })
  const toolRequestIds = new Set<string>()
  const toolResponses = new Set<string>()

  parts.forEach((part) => {
    if (isToolRequest(part)) {
      toolRequestIds.add(part.toolCallId)
    } else {
      toolResponses.add(part.id)
    }
  })

  return parts.filter(
    (part): part is ToolRequest =>
      isToolRequest(part) && !toolResponses.has(part.toolCallId),
  )
}

type Props<V extends PromptlVersion> = { version: V }

export function useMessages<V extends PromptlVersion>({ version }: Props<V>) {
  const [messages, setMessages] = useState<VersionedMessage<V>[]>([])
  const [unresponedToolCalls, setUnresponedToolCalls] = useState<ToolRequest[]>(
    [],
  )
  // FIXME: Kill compiler please
  // every where we have old compiler types. To avoid Typescript crying we
  // allow only compiler messages and then transform them to versioned messages
  const addMessages = useCallback(
    (m: CompilerMessage[]) => {
      const msg = m as VersionedMessage<V>[]
      setMessages((prevMessages) => {
        const newMessages = prevMessages.concat(msg)
        setUnresponedToolCalls(
          getUnrespondedToolRequests({ version, messages: newMessages }),
        )
        return newMessages
      })
    },
    [version],
  )

  return {
    addMessages,
    messages: messages as CompilerMessage[],
    unresponedToolCalls,
  }
}
