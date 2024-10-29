import { RunErrorCodes } from '@latitude-data/constants/errors'

import {
  DocumentLog,
  ErrorableEntity,
  EvaluationDto,
  ProviderLog,
} from '../../../browser'
import { publisher } from '../../../events/publisher'
import { Result } from '../../../lib'
import { ChainError } from '../../chains/ChainErrors'
import { ChainResponse } from '../../chains/run'
import {
  createEvaluationResult,
  CreateEvaluationResultProps,
} from '../../evaluationResults'
import { createRunError } from '../../runErrors/create'

export async function createEvaluationRunResult({
  errorableUuid,
  responseResult,
  documentUuid,
  evaluation,
  documentLog,
  providerLog,
  result,
  publishEvent,
}: {
  errorableUuid: string
  documentUuid: string
  evaluation: EvaluationDto
  documentLog: DocumentLog
  publishEvent: boolean
  responseResult?: ChainResponse<'object'>
  providerLog?: ProviderLog
  result?: CreateEvaluationResultProps['result']
}) {
  if (publishEvent) {
    publisher.publishLater({
      type: 'evaluationRun',
      data: {
        response: responseResult?.value,
        documentUuid,
        evaluationId: evaluation.id,
        documentLogUuid: documentLog.uuid,
        workspaceId: evaluation.workspaceId,
        providerLogUuid: providerLog?.uuid,
      },
    })
  }

  return createEvaluationResult({
    uuid: errorableUuid,
    evaluation,
    documentLog,
    providerLog,
    result,
  }).then((r) => r.unwrap())
}

export async function handleEvaluationResponse({
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
  let providerLog: ProviderLog | undefined = undefined
  let result: CreateEvaluationResultProps['result'] | undefined
  let error: ChainError<RunErrorCodes> | undefined

  if (responseResult.ok && responseResult.value) {
    const response = responseResult.value
    providerLog = response.providerLog!

    if (!response.object) {
      error = new ChainError({
        code: RunErrorCodes.EvaluationRunResponseJsonFormatError,
        message: `Provider with model [${providerLog?.config?.model ?? 'unknown'}] did not return a valid JSON object`,
      })
    } else {
      result = response.object
    }
  }

  if (error) {
    await createRunError({
      data: {
        errorableUuid,
        errorableType: ErrorableEntity.EvaluationResult,
        code: error.errorCode,
        message: error.message,
        details: error.details,
      },
    }).then((r) => r.unwrap())
  }

  await createEvaluationRunResult({
    errorableUuid,
    evaluation,
    documentLog,
    providerLog,
    result,
    documentUuid,
    responseResult,
    publishEvent: !error && !responseResult.error,
  })

  return error ? Result.error(error) : Result.nil()
}
