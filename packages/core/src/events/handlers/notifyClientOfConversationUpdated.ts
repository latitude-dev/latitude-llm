import { isMainSpan } from '../../constants'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { fetchConversation } from '../../data-access/conversations/fetchConversation'
import { findSpan } from '../../queries/spans/findSpan'
import { WebsocketClient } from '../../websockets/workers'
import type { SpanCreatedEvent } from '../events'

export const notifyClientOfConversationUpdated = async ({
  data,
}: {
  data: SpanCreatedEvent
}): Promise<void> => {
  const { workspaceId, spanId, traceId, documentUuid } = data.data

  if (!documentUuid) return

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) return

  const span = await findSpan({ workspaceId, spanId, traceId })
  if (!span || !isMainSpan(span)) return
  if (!span.documentLogUuid) return

  const conversationResult = await fetchConversation({
    workspace,
    documentLogUuid: span.documentLogUuid,
  })

  if (!conversationResult.ok || !conversationResult.value) return

  const conversation = conversationResult.value

  WebsocketClient.sendEvent('conversationUpdated', {
    workspaceId,
    data: {
      workspaceId,
      documentUuid,
      conversation: {
        ...conversation,
        documentLogUuid: conversation.documentLogUuid!,
      },
    },
  })
}
