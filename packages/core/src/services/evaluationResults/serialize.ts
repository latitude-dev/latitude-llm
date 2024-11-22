import {
  EvaluationResultableType,
  SerializedEvaluationManualResult,
  SerializedEvaluationResult,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { NotFoundError, PromisedResult, Result } from '../../lib'
import {
  DocumentLogsRepository,
  EvaluationResultDto,
  ProviderLogsRepository,
} from '../../repositories'
import { serialize as serializeDocumentLog } from '../documentLogs/serialize'
import { serializeForEvaluation } from '../providerLogs'

async function findEvaluationProviderLog(
  {
    evaluationResult,
    workspace,
  }: {
    evaluationResult: EvaluationResultDto
    workspace: Workspace
  },
  db = database,
) {
  const id = evaluationResult.evaluationProviderLogId

  if (!id) {
    // Manual evaluations
    return Result.ok({
      serializedProviderLog: undefined,
      reason: evaluationResult.reason,
    })
  }

  const providerLogsScope = new ProviderLogsRepository(workspace.id, db)
  const providerLogResult = await providerLogsScope.find(
    evaluationResult.evaluationProviderLogId,
  )

  if (providerLogResult.error) return providerLogResult

  const providerLog = providerLogResult.value
  const serializedProviderLog = serializeForEvaluation(providerLog)

  const responseObject = providerLog.responseObject as {
    reason?: string
  } | null

  const reason =
    responseObject && 'reason' in responseObject ? responseObject.reason : null

  return Result.ok({
    serializedProviderLog,
    reason: reason ?? evaluationResult.reason,
  })
}

export async function serialize(
  {
    workspace,
    evaluationResult,
  }: {
    workspace: Workspace
    evaluationResult: EvaluationResultDto
  },
  db = database,
): PromisedResult<
  SerializedEvaluationResult | SerializedEvaluationManualResult
> {
  const documentLogsScope = new DocumentLogsRepository(workspace.id, db)
  const documentLogsResult = await documentLogsScope.find(
    evaluationResult.documentLogId,
  )

  if (documentLogsResult.error) {
    return Result.error(
      new NotFoundError(
        `Refine Error: finding document log with id ${evaluationResult.documentLogId} in evaluation result ${evaluationResult.id}`,
      ),
    )
  }

  const providerLogResult = await findEvaluationProviderLog(
    {
      evaluationResult,
      workspace,
    },
    db,
  ).then((r) => r.unwrap())

  const serializedDocumentLog = await serializeDocumentLog({
    workspace,
    documentLog: documentLogsResult.value,
  })

  if (serializedDocumentLog.error) return serializedDocumentLog

  const resultableType =
    evaluationResult.resultableType ?? EvaluationResultableType.Text

  const reason = providerLogResult.reason
  const serializedProviderLog = providerLogResult.serializedProviderLog

  const baseSerialize = {
    reason,
    resultableType,
    result: evaluationResult.result,
    evaluatedLog: serializedDocumentLog.value,
  }

  if (!serializedProviderLog) return Result.ok(baseSerialize)

  return Result.ok({
    ...baseSerialize,
    ...serializedProviderLog,
  })
}
