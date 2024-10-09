import { createChain } from '@latitude-data/compiler'
import { JSONSchema7 } from 'json-schema'

import {
  DocumentLog,
  ErrorableEntity,
  EvaluationDto,
  EvaluationResultableType,
  LogSources,
  ProviderLog,
} from '../../browser'
import { database } from '../../client'
import {
  findLastProviderLogFromDocumentLogUuid,
  findWorkspaceFromDocumentLog,
} from '../../data-access'
import { publisher } from '../../events/publisher'
import { LatitudeError, NotFoundError, Result } from '../../lib'
import { ChainResponse, runChain } from '../chains/run'
import { serialize as serializeDocumentLog } from '../documentLogs/serialize'
import {
  createEvaluationResult,
  CreateEvaluationResultProps,
} from '../evaluationResults'
import { buildProvidersMap } from '../providerApiKeys/buildMap'

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

  const run = await runChain({
    errorableType: ErrorableEntity.EvaluationResult,
    workspace,
    chain,
    source: LogSources.Evaluation,
    providersMap,
    configOverrides: {
      schema,
      output: 'object',
    },
  })

  const responseResult = (await run.response) as ChainResponse<'object'>
  handleEvaluationResponse({
    responseResult,
    errorableUuid: run.errorableUuid,
    documentUuid,
    evaluation,
    documentLog,
  })

  return Result.ok(run)
}

async function handleEvaluationResponse({
  errorableUuid,
  responseResult,
  documentUuid,
  evaluation,
  documentLog,
}: {
  errorableUuid: string
  responseResult: ChainResponse<'object'>
  documentUuid: string
  evaluation: EvaluationDto
  documentLog: DocumentLog
}) {
  let providerLog: ProviderLog
  let result: CreateEvaluationResultProps['result'] | undefined

  if (responseResult.ok && responseResult.value) {
    const response = responseResult.value
    providerLog = response.providerLog!
    result = response.object.result
    publisher.publishLater({
      type: 'evaluationRun',
      data: {
        response: responseResult.value,
        documentUuid,
        evaluationId: evaluation.id,
        documentLogUuid: documentLog.uuid,
        providerLogUuid: providerLog!.uuid,
        workspaceId: evaluation.workspaceId,
      },
    })

    if (response.object === undefined) {
      throw new LatitudeError(
        'Provider did not return a valid JSON-formatted response',
      )
    }
  }

  return await createEvaluationResult({
    uuid: errorableUuid,
    evaluation,
    documentLog,
    providerLog: providerLog!,
    result,
  }).then((r) => r.unwrap())
}
