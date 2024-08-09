import {
  database,
  DocumentLogsRepository,
  NotFoundError,
  providerLogs,
  Result,
  Transaction,
} from '@latitude-data/core'
import { Workspace } from '$core/browser'
import { ProviderLogsRepository } from '$core/repositories/providerLogsRepository'
import { inArray } from 'drizzle-orm'

export function assignDocumentLogToProviderLog(
  {
    workspace,
    documentLogUuid: documentLogUuid,
    providerLogUuids,
  }: {
    workspace: Workspace
    documentLogUuid: string
    providerLogUuids: string[]
  },
  db = database,
) {
  return Transaction.call(async (trx) => {
    const documentLogsScope = new DocumentLogsRepository(workspace.id, trx)
    const documentLog = await documentLogsScope
      .findByUuid(documentLogUuid)
      .then((result) => result.unwrap())

    if (!documentLog) {
      return Result.error(
        new NotFoundError(`Document log '${documentLogUuid}' not found`),
      )
    }

    const providerLogsScope = new ProviderLogsRepository(workspace.id, trx)
    const scopedProviderLogs = await providerLogsScope
      .findByUuids(providerLogUuids)
      .then((result) => result.unwrap())

    const updatedProviderLogs = await trx
      .update(providerLogs)
      .set({ documentLogId: documentLog.id })
      .where(
        inArray(
          providerLogs.uuid,
          scopedProviderLogs.map((p) => p.uuid),
        ),
      )
      .returning()

    if (updatedProviderLogs.length === providerLogUuids.length) {
      return Result.ok(updatedProviderLogs)
    }

    return Result.error(
      new Error('Failed to assign document log to provider logs'),
    )
  }, db)
}
