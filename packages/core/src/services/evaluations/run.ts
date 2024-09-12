import { createChain, readMetadata } from '@latitude-data/compiler'

import { DocumentLog, EvaluationDto, LogSources } from '../../browser'
import { database } from '../../client'
import { findLastProviderLogFromDocumentLogUuid } from '../../data-access'
import { publisher } from '../../events/publisher'
import { NotFoundError, Result } from '../../lib'
import { runChain } from '../chains/run'
import { computeDocumentLogWithMetadata } from '../documentLogs'
import { buildProviderApikeysMap } from '../providerApiKeys/buildMap'
import { formatContext, formatConversation } from '../providerLogs'

export const runEvaluation = async (
  {
    documentLog,
    evaluation,
  }: {
    documentLog: DocumentLog
    evaluation: EvaluationDto
  },
  db = database,
) => {
  const lastProviderLog = await findLastProviderLogFromDocumentLogUuid(
    documentLog.uuid,
    db,
  )
  if (!lastProviderLog) {
    return Result.error(
      new NotFoundError(
        `ProviderLog not found with documentLogUuid ${documentLog.uuid}`,
      ),
    )
  }

  const rezult = await computeDocumentLogWithMetadata(documentLog)
  if (rezult.error) return rezult
  const documentLogWithMetadata = rezult.value

  // TODO: This will need to become polymorphic in the future given different
  // types of evaluations
  const metadata = await readMetadata({ prompt: documentLog.resolvedContent })
  const chain = createChain({
    prompt: evaluation.metadata.prompt,
    parameters: {
      messages: formatConversation(lastProviderLog),
      context: formatContext(lastProviderLog),
      response: lastProviderLog.responseText,
      prompt: documentLog.resolvedContent,
      parameters: documentLog.parameters,
      config: metadata.config,
      duration: documentLogWithMetadata.duration,
      cost: documentLogWithMetadata.costInMillicents
        ? documentLogWithMetadata.costInMillicents * 1000
        : 0,
    },
  })

  const result = await runChain({
    chain,
    source: LogSources.Evaluation,
    apikeys: await buildProviderApikeysMap({
      workspaceId: evaluation.workspaceId,
    }),
  })
  if (result.error) return result

  result.value.response.then((response) => {
    publisher.publishLater({
      type: 'evaluationRun',
      data: {
        evaluationId: evaluation.id,
        documentLogUuid: documentLog.uuid,
        providerLogUuid: lastProviderLog.uuid,
        response,
      },
    })
  })

  return result
}
