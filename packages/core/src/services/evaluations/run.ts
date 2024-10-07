import { createChain } from '@latitude-data/compiler'
import { JSONSchema7 } from 'json-schema'

import {
  ChainObjectResponse,
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
import { serialize as serializeDocumentLog } from '../documentLogs/serialize'
import { createEvaluationResult } from '../evaluationResults'
import { buildProviderApikeysMap } from '../providerApiKeys/buildMap'

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

  const serializedDocumentLog = await serializeDocumentLog(documentLog, db)
  if (serializedDocumentLog.error) return serializedDocumentLog

  const chain = createChain({
    prompt: evaluation.metadata.prompt,
    parameters: {
      ...serializedDocumentLog.value,
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

  // Call the new method to handle the promise
  chainResult.value.response.then((response) =>
    handleEvaluationResponse(response, documentUuid, evaluation, documentLog),
  )

  return chainResult
}

// Moved to the end of the file
async function handleEvaluationResponse(
  response: any,
  documentUuid: string,
  evaluation: EvaluationDto,
  documentLog: DocumentLog,
) {
  publisher.publishLater({
    type: 'evaluationRun',
    data: {
      documentUuid,
      evaluationId: evaluation.id,
      documentLogUuid: documentLog.uuid,
      providerLogUuid: response.providerLog.uuid,
      response,
      workspaceId: evaluation.workspaceId,
    },
  })

  await createEvaluationResult({
    evaluation,
    documentLog,
    providerLog: response.providerLog,
    result: (response as ChainObjectResponse).object,
  }).then((r) => r.unwrap())
}
