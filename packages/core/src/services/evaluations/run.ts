import {
  DocumentLog,
  ErrorableEntity,
  EvaluationDto,
  LogSources,
} from '../../browser'
import { database } from '../../client'
import { generateUUIDIdentifier, Result } from '../../lib'
import { ChainResponse, runChain } from '../chains/run'
import { buildProvidersMap } from '../providerApiKeys/buildMap'
import { EvaluationRunChecker } from './EvaluationRunChecker'
import {
  createEvaluationRunResult,
  handleEvaluationResponse,
} from './run/handleEvaluationResponse'

export async function runEvaluation(
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
) {
  const errorableType = ErrorableEntity.EvaluationResult
  const errorableUuid = generateUUIDIdentifier()
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
      publishEvent: false,
    })
    return checkerResult
  }

  const { workspace, chain, schema } = checkerResult.value
  const providersMap = await buildProvidersMap({
    workspaceId: evaluation.workspaceId,
  })
  const generateUUID = () => errorableUuid
  const run = await runChain({
    generateUUID,
    errorableType,
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
  const processedResponse = await handleEvaluationResponse({
    errorableUuid: run.errorableUuid,
    responseResult,
    documentUuid,
    evaluation,
    documentLog,
  })

  if (processedResponse.error) return processedResponse

  return Result.ok(run)
}
