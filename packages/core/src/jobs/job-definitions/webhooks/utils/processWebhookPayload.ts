import { LatitudeEvent } from '../../../../events/events'
import { WebhookPayload } from '../../../../services/webhooks/types'
import { Result, TypedResult } from '../../../../lib/Result'
import { processSpanCreated } from './processSpanCreated'

export async function processWebhookPayload(
  event: LatitudeEvent,
): Promise<TypedResult<WebhookPayload, Error>> {
  try {
    switch (event.type) {
      case 'spanCreated': {
        const { spanId, traceId, workspaceId } = event.data
        return processSpanCreated({ spanId, traceId, workspaceId })
      }
      default:
        return Result.ok({
          eventType: event.type,
          payload: event.data,
        })
    }
  } catch (error) {
    return Result.error(error as Error)
  }
}
