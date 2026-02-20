import { isMainSpan } from '../../constants'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { fetchConversation } from '../../data-access/conversations/fetchConversation'
import { SpansRepository } from '../../repositories'
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

  const repo = new SpansRepository(workspaceId)
  const result = await repo.get({ spanId, traceId })
  if (!result.ok) return

  const span = result.value
  if (!span || !isMainSpan(span)) return
  if (!span.documentLogUuid) return

  // TODO(clickhouse): some spans won't have commit / document uuids
  const conversationResult = await fetchConversation({
    workspace,
    projectId: span.projectId,
    documentUuid: span.documentUuid,
    commitUuid: span.commitUuid,
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
