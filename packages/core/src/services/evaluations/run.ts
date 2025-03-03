import { RunErrorCodes } from '@latitude-data/constants/errors'

import {
  ChainStepResponse,
  DocumentLog,
  ErrorableEntity,
  EvaluationDto,
  EvaluationMetadataType,
  LogSources,
  ProviderLog,
} from '../../browser'
import { database } from '../../client'
import { unsafelyFindDocumentLogByUuid } from '../../data-access'
import { publisher } from '../../events/publisher'
import { generateUUIDIdentifier, NotFoundError, Result } from '../../lib'
import { ChainError } from '../../lib/chainStreamManager/ChainErrors'
import { runChain } from '../chains/run'
import {
  createEvaluationResult,
  CreateEvaluationResultProps,
} from '../evaluationResults'
import { buildProvidersMap } from '../providerApiKeys/buildMap'
import { createRunError } from '../runErrors/create'
import { EvaluationRunChecker } from './EvaluationRunChecker'

interface RunEvaluationParams {
  providerLog: ProviderLog
  documentUuid: string
  evaluation: EvaluationDto
}

export async function runEvaluation(
  {
    providerLog: evaluatedProviderLog,
    documentUuid,
    evaluation,
  }: RunEvaluationParams,
  db = database,
) {
  const errorableUuid = generateUUIDIdentifier()

  // Get document log
  const documentLog = await unsafelyFindDocumentLogByUuid(
    evaluatedProviderLog.documentLogUuid!,
  )
  if (!documentLog) {
    return Result.error(new NotFoundError('Document log not found'))
  }

  // Run pre-evaluation checks
  const checker = new EvaluationRunChecker({
    db,
    errorableUuid,
    documentLog,
    evaluation,
  })
  const checkerResult = await checker.call()
  if (checkerResult.error) {
    await createEvaluationRunResult({
      errorableUuid,
      documentUuid,
      evaluation,
      documentLog,
      evaluatedProviderLog,
      publishEvent: false,
    })

    return checkerResult
  }

  // Run the chain
  const { workspace, chain, schema, config } = checkerResult.value
  const providersMap = await buildProvidersMap({
    workspaceId: evaluation.workspaceId,
  })

  const usePromptl =
    evaluation.metadataType !== EvaluationMetadataType.LlmAsJudgeAdvanced ||
    evaluation.metadata.promptlVersion !== 0

  const run = runChain({
    generateUUID: () => errorableUuid,
    errorableType: ErrorableEntity.EvaluationResult,
    workspace,
    chain,
    globalConfig: config,
    promptlVersion: usePromptl ? 1 : 0,
    source: LogSources.Evaluation,
    providersMap,
    configOverrides: { schema, output: 'object' },
    promptSource: evaluation,
  })

  // Handle response
  const response = (await run.lastResponse) as
    | ChainStepResponse<'object'>
    | undefined
  const providerLog = response?.providerLog
  const responseError = await run.error
  let error: ChainError<RunErrorCodes> | undefined
  if (!responseError && !response?.object) {
    error = new ChainError({
      code: RunErrorCodes.EvaluationRunResponseJsonFormatError,
      message: `Provider with model [${providerLog?.config?.model ?? 'unknown'}] did not return a valid JSON object`,
    })
    await handleEvaluationError(error, errorableUuid)
  }

  // Create successful result
  await createEvaluationRunResult({
    errorableUuid,
    evaluation,
    documentLog,
    evaluationProviderLog: providerLog,
    documentUuid,
    response,
    result: response?.object,
    publishEvent: true,
    evaluatedProviderLog,
  })

  if (error) return Result.error(error)

  return Result.ok(run)
}

async function handleEvaluationError(
  error: ChainError<RunErrorCodes>,
  errorableUuid: string,
) {
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

async function createEvaluationRunResult({
  errorableUuid,
  response,
  documentUuid,
  evaluation,
  documentLog,
  evaluationProviderLog,
  evaluatedProviderLog,
  result,
  publishEvent,
}: {
  errorableUuid: string
  documentUuid: string
  evaluation: EvaluationDto
  documentLog: DocumentLog
  publishEvent: boolean
  response?: ChainStepResponse<'object'>
  evaluationProviderLog?: ProviderLog
  evaluatedProviderLog: ProviderLog
  result?: CreateEvaluationResultProps['result']
}) {
  if (publishEvent) {
    publisher.publishLater({
      type: 'evaluationRun',
      data: {
        response,
        documentUuid,
        evaluationId: evaluation.id,
        documentLogUuid: documentLog.uuid,
        workspaceId: evaluation.workspaceId,
        providerLogUuid: evaluationProviderLog?.uuid,
      },
    })
  }

  return createEvaluationResult({
    uuid: errorableUuid,
    evaluation,
    documentLog,
    evaluationProviderLog,
    evaluatedProviderLog,
    result,
  }).then((r) => r.unwrap())
}
