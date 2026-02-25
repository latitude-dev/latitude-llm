import { useCallback } from 'react'
import { useSWRConfig } from 'swr'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
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
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
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
      if (!documentLogUuid) return

      const conversationDetailKey = getConversationKey({
        conversationId: documentLogUuid,
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })
      globalMutate(conversationDetailKey)

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
    [
      project.id,
      commit.uuid,
      document.documentUuid,
      currentCursor,
      items,
      next,
      mutate,
      globalMutate,
    ],
  )

  useSockets({
    event: 'conversationUpdated',
    onMessage: handleConversationUpdated,
  })
}
