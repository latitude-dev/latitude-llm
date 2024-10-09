import { createChain } from '@latitude-data/compiler'
import { JSONSchema7 } from 'json-schema'

import {
  ChainStepResponse,
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
import { LatitudeError, NotFoundError, Result } from '../../lib'
import { runChain } from '../chains/run'
import { serialize as serializeDocumentLog } from '../documentLogs/serialize'
import { createEvaluationResult } from '../evaluationResults'
import { buildProvidersMap } from '../providerApiKeys/buildMap'

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
  // TODO: Handle this as an ChainError. Assign code in the enum
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

  const providersMap = await buildProvidersMap({
    workspaceId: evaluation.workspaceId,
  })

  // TODO: pass ErrorableEntity.EvaluationResult to runChain
  // This way we associate errors to evaluation results
  const run = await runChain({
    workspace,
    chain,
    source: LogSources.Evaluation,
    providersMap,
    configOverrides: {
      schema,
      output: 'object',
    },
  })

  const response = run.response as Promise<ChainStepResponse<'object'>>
  response.then((res) =>
    handleEvaluationResponse(res, documentUuid, evaluation, documentLog),
  )

  return Result.ok(run)
}

async function handleEvaluationResponse(
  response: ChainStepResponse<'object'> | undefined,
  documentUuid: string,
  evaluation: EvaluationDto,
  documentLog: DocumentLog,
) {
  if (!response) return

  publisher.publishLater({
    type: 'evaluationRun',
    data: {
      response,
      documentUuid,
      evaluationId: evaluation.id,
      documentLogUuid: documentLog.uuid,
      providerLogUuid: response.providerLog!.uuid,
      workspaceId: evaluation.workspaceId,
    },
  })

  if (response.object === undefined) {
    throw new LatitudeError(
      'Provider did not return a valid JSON-formatted response',
    )
  }

  return await createEvaluationResult({
    evaluation,
    documentLog,
    providerLog: response.providerLog!,
    result: response.object,
  }).then((r) => r.unwrap())
}
