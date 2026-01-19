import { LatitudeEvent } from '../../../../events/events'
import { WebhookPayload } from '../../../../services/webhooks/types'
import {
  findDocumentFromLog,
  unsafelyFindDocumentLogById,
} from '../../../../data-access/documentLogs'
import { Result, TypedResult } from '../../../../lib/Result'
import { findLastProviderLogFromDocumentLogUuid } from '../../../../data-access/providerLogs'
import { buildProviderLogResponse } from '../../../../services/providerLogs/buildResponse'

export async function processWebhookPayload(
  event: LatitudeEvent,
): Promise<TypedResult<WebhookPayload, Error>> {
  try {
    switch (event.type) {
      case 'documentLogCreated': {
        const { id } = event.data
        const log = await unsafelyFindDocumentLogById(id)
        if (!log) {
          return Result.error(new Error(`DocumentLog with id ${id} not found`))
        }

        const providerLog = await findLastProviderLogFromDocumentLogUuid(
          log.uuid,
        )

        return Result.ok({
          eventType: event.type,
          payload: {
            prompt: await findDocumentFromLog(log),
            uuid: log.uuid,
            parameters: log.parameters,
            customIdentifier: log.customIdentifier,
            duration: log.duration,
            source: log.source,
            commitId: log.commitId,
            messages: providerLog?.messages,
            toolCalls: providerLog?.toolCalls,
            response: providerLog
              ? buildProviderLogResponse(providerLog)
              : undefined,
          },
        })
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
