import { LatitudeEvent } from '../../../../events/events'
import { WebhookPayload } from '../../../../services/webhooks/types'
import { findDocumentFromLog } from '../../../../data-access/documentLogs'
import { Result, TypedResult } from '../../../../lib/Result'
import { findLastProviderLogFromDocumentLogUuid } from '../../../../data-access'
import { buildProviderLogResponse } from '../../../../services/providerLogs'

export async function processWebhookPayload(
  event: LatitudeEvent,
): Promise<TypedResult<WebhookPayload, Error>> {
  try {
    switch (event.type) {
      case 'documentLogCreated':
        const providerLog = await findLastProviderLogFromDocumentLogUuid(
          event.data.uuid,
        )

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
            messages: providerLog?.messages,
            toolCalls: providerLog?.toolCalls,
            response: providerLog
              ? buildProviderLogResponse(providerLog)
              : undefined,
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
