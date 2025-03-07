import {
  EvaluationDto,
  EvaluationMetadataType,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import { findLastProviderLogFromDocumentLogUuid } from '@latitude-data/core/data-access'
import { BadRequestError, NotFoundError } from '@latitude-data/core/lib/errors'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import {
  ConnectedEvaluationsRepository,
  DocumentLogsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { createEvaluationResult } from '@latitude-data/core/services/evaluationResults/create'
import { CreateEvaluationResultRoute } from './createEvaluationResult.route'
import { AppRouteHandler } from '$/openApi/types'

function validateResultForEvaluationType({
  evaluation,
  result,
}: {
  evaluation: EvaluationDto
  result: { result: string | boolean | number; reason: string }
}) {
  if (evaluation.resultType === EvaluationResultableType.Boolean) {
    if (typeof result.result !== 'boolean') {
      throw new BadRequestError(
        `Result must be a boolean, got ${typeof result.result}`,
      )
    }
  } else if (evaluation.resultType === EvaluationResultableType.Number) {
    if (typeof result.result !== 'number') {
      throw new BadRequestError(
        `Result must be a number, got ${typeof result.result}`,
      )
    }
  } else if (evaluation.resultType === EvaluationResultableType.Text) {
    if (typeof result.result !== 'string') {
      throw new BadRequestError(
        `Result must be a string, got ${typeof result.result}`,
      )
    }
  }
}

function validateEvaluationType(evaluation: EvaluationDto) {
  switch (evaluation.metadataType) {
    case EvaluationMetadataType.Manual:
      return
    default:
      throw new BadRequestError(
        'Evaluation type does not support evaluation results submitted via the HTTP API',
      )
  }
}

async function validatedEvalConnectedToDocument({
  workspace,
  documentLog,
  evaluation,
}: {
  workspace: { id: number }
  documentLog: { documentUuid: string }
  evaluation: { id: number }
}) {
  const connectedEvalsRepo = new ConnectedEvaluationsRepository(workspace.id)
  const connectedEvaluations = await connectedEvalsRepo
    .filterByDocumentUuid(documentLog.documentUuid)
    .then((r) => r.unwrap())
  const connectedEvaluation = connectedEvaluations.find(
    (e) => e.evaluationId === evaluation.id,
  )
  if (!connectedEvaluation) {
    throw new BadRequestError('The evaluation is not connected to this prompt')
  }
}

// @ts-expect-error: streamSSE has type issues
export const createEvaluationResultHandler: AppRouteHandler<
  CreateEvaluationResultRoute
> = async (c) => {
  const { conversationUuid, evaluationUuid } = c.req.valid('param')
  const { result, reason } = c.req.valid('json')
  const workspace = c.get('workspace')
  const evaluationsRepo = new EvaluationsRepository(workspace.id)
  const evaluation = await evaluationsRepo
    .findByUuid(evaluationUuid!)
    .then((r) => r.unwrap())
  const documentLogsRepo = new DocumentLogsRepository(workspace.id)
  const documentLog = await documentLogsRepo
    .findByUuid(conversationUuid!)
    .then((r) => r.unwrap())
  const evaluatedProviderLog = await findLastProviderLogFromDocumentLogUuid(
    documentLog.uuid,
  )

  if (!evaluatedProviderLog) {
    throw new NotFoundError('Could not find the log to evaluate')
  }

  validateResultForEvaluationType({ evaluation, result: { result, reason } })
  validateEvaluationType(evaluation)
  await validatedEvalConnectedToDocument({
    workspace,
    documentLog,
    evaluation,
  })

  const evaluationResult = await createEvaluationResult({
    uuid: generateUUIDIdentifier(),
    evaluation,
    documentLog,
    evaluatedProviderLog,
    result: { result, reason },
  }).then((r) => r.unwrap())

  return c.json(evaluationResult)
}
