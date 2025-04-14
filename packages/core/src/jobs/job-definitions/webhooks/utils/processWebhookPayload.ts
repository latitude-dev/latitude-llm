import { LatitudeEvent } from '../../../../events/events'
import { WebhookPayload } from '../../../../services/webhooks/types'
import { findDocumentFromLog } from '../../../../data-access/documentLogs'
import { Result, TypedResult } from '../../../../lib/Result'

export async function processWebhookPayload(
  event: LatitudeEvent,
): Promise<TypedResult<WebhookPayload, Error>> {
  try {
    switch (event.type) {
      case 'documentLogCreated':
        return Result.ok({
          eventType: event.type,
          payload: {
            prompt: await findDocumentFromLog(event.data),
            uuid: event.data.uuid,
            parameters: event.data.parameters,
            customIdentifier: event.data.customIdentifier,
            duration: event.data.duration,
            source: event.data.source,
            commitId: event.data.commitId,
          },
        })
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
