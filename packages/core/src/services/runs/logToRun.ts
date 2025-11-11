import {
  DocumentLogWithMetadataAndError,
  LogSources,
  RUN_CAPTION_SIZE,
  Run,
  RunAnnotation,
} from '../../constants'
import { findLastProviderLogFromDocumentLogUuid } from '../../data-access/providerLogs'
import { buildConversation, formatMessage } from '../../helpers'
import { Result } from '../../lib/Result'
import { PromisedResult } from '../../lib/Transaction'
import { EvaluationResultsV2Repository } from '../../repositories'
import { getEvaluationMetricSpecification } from '../evaluationsV2/specifications'
import serializeProviderLog from '../providerLogs/serialize'

/**
 * Converts a document log to a Run object with annotations and metadata.
 */
export async function logToRun({
  log,
  workspaceId,
  projectId,
}: {
  log: DocumentLogWithMetadataAndError
  workspaceId: number
  projectId: number
}): PromisedResult<Run, Error> {
  try {
    const endedAt = new Date(log.createdAt)
    const startedAt = new Date(endedAt.getTime() - (log.duration ?? 0))

    let caption = 'Run finished successfully without any response'
    if (log.error.code) {
      caption =
        log.error.message ??
        'An unknown error occurred while running the prompt'
    } else {
      const providerLog = await findLastProviderLogFromDocumentLogUuid(log.uuid)
      if (providerLog) {
        const conversation = buildConversation(
          serializeProviderLog(providerLog),
        )
        if (conversation.length > 0)
          caption = formatMessage(conversation.at(-1)!)
      }
    }
    caption = caption.trim().slice(0, RUN_CAPTION_SIZE)

    const repository = new EvaluationResultsV2Repository(workspaceId)
    const results = await repository
      .listByDocumentLogs({
        projectId,
        documentUuid: log.documentUuid,
        documentLogUuids: [log.uuid],
      })
      .then((r) => (r.value ?? {})[log.uuid] ?? [])
    const annotations = results.filter(
      ({ evaluation }) =>
        getEvaluationMetricSpecification(evaluation).supportsManualEvaluation,
    ) as RunAnnotation[]

    return Result.ok({
      uuid: log.uuid,
      queuedAt: startedAt,
      startedAt,
      endedAt,
      caption,
      log,
      annotations,
      source: log.source ?? LogSources.API,
    })
  } catch (error) {
    return Result.error(error as Error)
  }
}
