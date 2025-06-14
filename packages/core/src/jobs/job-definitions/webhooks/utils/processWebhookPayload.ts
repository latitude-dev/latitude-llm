import { LatitudeEvent } from '../../../../events/events'
import { WebhookPayload } from '../../../../services/webhooks/types'
import { findDocumentFromLog } from '../../../../data-access/documentLogs'
import { Result, TypedResult } from '../../../../lib/Result'
import { findLastProviderLogFromDocumentLogUuid } from '../../../../data-access'
import { buildProviderLogResponse } from '../../../../services/providerLogs'
import { DocumentLogsRepository } from '../../../../repositories'

export async function processWebhookPayload(
  event: LatitudeEvent,
): Promise<TypedResult<WebhookPayload, Error>> {
  try {
    switch (event.type) {
      case 'documentLogCreated': {
        const { id, workspaceId } = event.data
        const repo = new DocumentLogsRepository(workspaceId)
        const log = await repo.find(id).then((r) => r.unwrap())
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
