import { DocumentLog, EvaluationDto, LogSources } from '../../browser'
import { database } from '../../client'
import { findWorkspaceFromDocumentLog } from '../../data-access'
import { NotFoundError, Result, Transaction } from '../../lib'
import { ProviderLogsRepository } from '../../repositories'
import { evaluationResults } from '../../schema'
import { runPrompt } from '../prompts/run'
import { buildProviderApikeysMap } from '../providerApiKeys/buildMap'
import { formatMessages } from './formatMessages'

export const evaluateDocumentLog = async (
  {
    documentLog,
    evaluation,
  }: {
    documentLog: DocumentLog
    evaluation: EvaluationDto
  },
  db = database,
) => {
  const workspace = await findWorkspaceFromDocumentLog(documentLog, db)
  const apikeys = await buildProviderApikeysMap({ workspaceId: workspace!.id })
  const scope = new ProviderLogsRepository(workspace!.id, db)
  const providerLogs = await scope
    .findByDocumentLogUuid(documentLog.uuid)
    .then((r) => r.unwrap())
  const lastProviderLog = providerLogs[providerLogs.length - 1]
  if (!lastProviderLog)
    return Result.error(new NotFoundError('ProviderLog not found'))

  const parameters = {
    messages: formatMessages(lastProviderLog!.messages),
    last_message: lastProviderLog!.responseText,
  }

  const result = await runPrompt({
    prompt: evaluation.metadata.prompt,
    parameters,
    apikeys,
    source: LogSources.Evaluation,
  })
  if (result.error) return result

  const { response } = result.value

  let evaluationResult
  try {
    evaluationResult = await response
  } catch (error) {
    return Result.error(error as Error)
  }

  return Transaction.call(async (tx) => {
    const result = await tx
      .insert(evaluationResults)
      .values({
        evaluationId: evaluation.id,
        documentLogId: documentLog.id,
        providerLogId: lastProviderLog.id,
        result: evaluationResult.text,
      })
      .returning()

    return Result.ok(result[0]!)
  }, db)
}
