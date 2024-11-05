import {
  EvaluationResultableType,
  SerializedEvaluationResult,
} from '../../browser'
import { database } from '../../client'
import { findWorkspaceFromEvaluationResult } from '../../data-access'
import { NotFoundError, PromisedResult, Result } from '../../lib'
import {
  DocumentLogsRepository,
  EvaluationResultDto,
  ProviderLogsRepository,
} from '../../repositories'
import { serialize as serializeDocumentLog } from '../documentLogs/serialize'
import { serialize as serializeProviderLog } from '../providerLogs/serialize'

export async function serialize(
  evaluationResult: EvaluationResultDto,
  db = database,
): PromisedResult<SerializedEvaluationResult> {
  const workspace = await findWorkspaceFromEvaluationResult(
    evaluationResult,
    db,
  )
  if (!workspace) return Result.error(new NotFoundError('Workspace not found'))

  const documentLogsScope = new DocumentLogsRepository(workspace.id, db)
  const documentLogsResult = await documentLogsScope.find(
    evaluationResult.documentLogId,
  )
  if (documentLogsResult.error) return documentLogsResult

  const providerLogsScope = new ProviderLogsRepository(workspace.id, db)
  const providerLogResult = await providerLogsScope.find(
    evaluationResult.evaluationProviderLogId,
  )
  if (providerLogResult.error) return Result.error(providerLogResult.error)
  if (!providerLogResult.value) {
    return Result.error(
      new NotFoundError('ProviderLogs not found for DocumentLog'),
    )
  }

  const serializedProviderLog = serializeProviderLog(providerLogResult.value)

  const responseObject = providerLogResult.value.responseObject as {
    reason?: string
  } | null

  const reason =
    responseObject && 'reason' in responseObject
      ? (responseObject.reason ?? null)
      : null

  const serializedDocumentLog = await serializeDocumentLog({
    workspace,
    documentLog: documentLogsResult.value,
  })
  if (serializedDocumentLog.error) return serializedDocumentLog

  return Result.ok({
    ...serializedProviderLog,
    resultableType:
      evaluationResult.resultableType ?? EvaluationResultableType.Text,
    result: evaluationResult.result,
    reason,
    evaluatedLog: serializedDocumentLog.value,
  })
}
