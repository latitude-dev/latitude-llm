import {
  DocumentLog,
  ProviderLog,
  SerializedDocumentLog,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { PromisedResult } from '../../lib/Transaction'
import { ProviderLogsRepository } from '../../repositories'
import { serializeForEvaluation as serializeProviderLog } from '../providerLogs'
import { hydrateProviderLog } from '../providerLogs/hydrate'

export async function serializeAggregatedProviderLog({
  documentLog,
  providerLogs,
}: {
  documentLog: DocumentLog
  providerLogs: ProviderLog[]
}) {
  let cost = 0
  let tokens = 0
  let duration = 0
  const lastProviderLog = await hydrateProviderLog(providerLogs.at(-1)!).then(
    (r) => r.unwrap(),
  )

  for (const providerLog of providerLogs) {
    cost += providerLog.costInMillicents ?? 0
    tokens += providerLog.tokens ?? 0
    duration += providerLog.duration ?? 0
  }

  return Result.ok({
    ...serializeProviderLog(lastProviderLog),
    parameters: documentLog.parameters,
    prompt: documentLog.resolvedContent,
    cost: cost / 1000,
    tokens: tokens,
    duration: duration / 1000,
  })
}

export async function serialize(
  {
    workspace,
    documentLog,
  }: {
    workspace: Workspace
    documentLog: DocumentLog
  },
  db = database,
): PromisedResult<SerializedDocumentLog> {
  const providerLogsScope = new ProviderLogsRepository(workspace.id, db)
  const providerLogs = await providerLogsScope
    .findByDocumentLogUuid(documentLog.uuid)
    .then((r) => r.unwrap())
  if (!providerLogs.length) {
    return Result.error(
      new NotFoundError('ProviderLogs not found for DocumentLog'),
    )
  }

  return serializeAggregatedProviderLog({ documentLog, providerLogs })
}
