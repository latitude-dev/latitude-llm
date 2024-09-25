import { createChain, readMetadata } from '@latitude-data/compiler'
import { JSONSchema7 } from 'json-schema'

import {
  DocumentLog,
  EvaluationDto,
  EvaluationResultableType,
  LogSources,
} from '../../browser'
import { database } from '../../client'
import {
  findLastProviderLogFromDocumentLogUuid,
  findWorkspaceFromDocumentLog,
} from '../../data-access'
import { publisher } from '../../events/publisher'
import { NotFoundError, Result } from '../../lib'
import { runChain } from '../chains/run'
import { computeDocumentLogWithMetadata } from '../documentLogs'
import { buildProviderApikeysMap } from '../providerApiKeys/buildMap'
import { formatContext, formatConversation } from '../providerLogs'

// Helper function to get the result schema based on evaluation type
const getResultSchema = (type: EvaluationResultableType): JSONSchema7 => {
  switch (type) {
    case EvaluationResultableType.Boolean:
      return { type: 'boolean' }
    case EvaluationResultableType.Number:
      return { type: 'number' }
    case EvaluationResultableType.Text:
      return { type: 'string' }
    default:
      throw new Error(`Unsupported evaluation type: ${type}`)
  }
}

export const runEvaluation = async (
  {
    documentLog,
    documentUuid,
    evaluation,
  }: {
    documentLog: DocumentLog
    documentUuid: string
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

  const documentLogWithMetadataResult =
    await computeDocumentLogWithMetadata(documentLog)
  if (documentLogWithMetadataResult.error) return documentLogWithMetadataResult
  const documentLogWithMetadata = documentLogWithMetadataResult.value

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
        ? documentLogWithMetadata.costInMillicents / 1000
        : 0,
    },
  })

  // Use the helper function to get the result schema
  const resultSchema = getResultSchema(evaluation.configuration.type)
  const workspace = await findWorkspaceFromDocumentLog(documentLog)
  if (!workspace) {
    return Result.error(new NotFoundError('Workspace not found'))
  }

  const schema: JSONSchema7 = {
    type: 'object',
    properties: {
      result: resultSchema,
      reason: { type: 'string' },
    },
    required: ['result', 'reason'],
  }

  const chainResult = await runChain({
    workspace,
    chain,
    source: LogSources.Evaluation,
    apikeys: await buildProviderApikeysMap({
      workspaceId: evaluation.workspaceId,
    }),
    configOverrides: {
      schema,
      output: 'object',
    },
  })

  if (chainResult.error) return chainResult

  chainResult.value.response.then((response) => {
    publisher.publish({
      type: 'evaluationRun',
      data: {
        documentUuid,
        evaluationId: evaluation.id,
        documentLogUuid: documentLog.uuid,
        providerLogUuid: response.providerLog.uuid,
        response,
      },
    })
  })

  return chainResult
}
