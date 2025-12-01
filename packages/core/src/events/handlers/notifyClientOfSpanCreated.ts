import { SpanType } from '../../constants'
import { SpansRepository } from '../../repositories'
import { WebsocketClient } from '../../websockets/workers'
import type { SpanCreatedEvent } from '../events'

export const notifyClientOfSpanCreated = async ({
  data,
}: {
  data: SpanCreatedEvent
}): Promise<void> => {
  const { workspaceId, spanId, traceId, documentUuid } = data.data

  // Only notify for prompt spans that have a documentUuid
  if (!documentUuid) return

  const repo = new SpansRepository(workspaceId)
  const result = await repo.get({ spanId, traceId })
  if (!result.ok) return

  const span = result.value

  // Only notify for prompt-level spans (the main trace)
  if (span?.type !== SpanType.Prompt) return

  WebsocketClient.sendEvent('spanCreated', {
    workspaceId,
    data: {
      workspaceId,
      documentUuid: documentUuid!,
      span,
    },
  })
}
