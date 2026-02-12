import { isMainSpan } from '../../constants'
import { findSpan } from '../../queries/spans/findSpan'
import { WebsocketClient } from '../../websockets/workers'
import type { SpanCreatedEvent } from '../events'

export const notifyClientOfSpanCreated = async ({
  data,
}: {
  data: SpanCreatedEvent
}): Promise<void> => {
  const { workspaceId, spanId, traceId, documentUuid } = data.data

  if (!documentUuid) return

  const span = await findSpan({ workspaceId, spanId, traceId })
  if (!span || !isMainSpan(span)) return

  WebsocketClient.sendEvent('spanCreated', {
    workspaceId,
    data: {
      workspaceId,
      documentUuid: documentUuid!,
      span,
    },
  })
}
