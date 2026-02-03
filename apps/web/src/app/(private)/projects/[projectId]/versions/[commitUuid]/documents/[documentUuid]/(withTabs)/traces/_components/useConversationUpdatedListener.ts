import { useCallback } from 'react'
import { useSWRConfig } from 'swr'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import {
  Conversation,
  deserializeConversation,
  getConversationKey,
  UseConversationsReturn,
} from '$/stores/conversations'

type ConversationUpdatedArgs = EventArgs<'conversationUpdated'>

export function useConversationUpdatedListener(
  conversations: UseConversationsReturn,
) {
  const { document } = useCurrentDocument()
  const { currentCursor, items, next, mutate } = conversations
  const { mutate: globalMutate } = useSWRConfig()

  const handleConversationUpdated = useCallback(
    (args: ConversationUpdatedArgs) => {
      if (!args) return
      if (!args.conversation) return
      if (args.documentUuid !== document.documentUuid) return

      const incomingConversation = deserializeConversation(args.conversation)
      const documentLogUuid = incomingConversation.documentLogUuid

      const conversationDetailKey = getConversationKey(documentLogUuid!)
      if (conversationDetailKey) {
        globalMutate(conversationDetailKey)
      }

      const isFirstPage = !currentCursor
      if (!isFirstPage) return

      const currentItems = items ?? []
      const existingIndex = currentItems.findIndex(
        (c: Conversation) => c.documentLogUuid === documentLogUuid,
      )

      let newItems: Conversation[]
      if (existingIndex >= 0) {
        newItems = [...currentItems]
        newItems[existingIndex] = incomingConversation
      } else {
        newItems = [incomingConversation, ...currentItems]
      }

      mutate({ items: newItems, next }, { revalidate: false })
    },
    [document.documentUuid, currentCursor, items, next, mutate, globalMutate],
  )

  useSockets({
    event: 'conversationUpdated',
    onMessage: handleConversationUpdated,
  })
}
