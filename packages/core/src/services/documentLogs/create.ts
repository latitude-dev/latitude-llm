import {
  database,
  documentLogs,
  Result,
  Transaction,
} from '@latitude-data/core'
import { Commit, DocumentLog, Workspace } from '$core/browser'

import { assignDocumentLogToProviderLog } from '../providerLogs'

export type CreateDocumentLogProps = {
  workspace: Workspace
  uuid: string
  documentUuid: string
  commit: Commit
  resolvedContent: string
  parameters: Record<string, unknown>
  customIdentifier?: string
  duration: number
  providerLogUuids: string[]
}

export async function createDocumentLog(
  {
    workspace,
    uuid,
    documentUuid,
    commit,
    resolvedContent,
    parameters,
    customIdentifier,
    duration,
    providerLogUuids,
  }: CreateDocumentLogProps,
  db = database,
) {
  return Transaction.call<DocumentLog>(async (trx) => {
    const inserts = await trx
      .insert(documentLogs)
      .values({
        uuid,
        documentUuid,
        commitId: commit.id,
        resolvedContent,
        parameters,
        customIdentifier,
        duration,
      })
      .returning()

    const documentLog = inserts[0]!

    await assignDocumentLogToProviderLog({
      workspace,
      documentLogUuid: uuid,
      providerLogUuids,
    })

    return Result.ok(documentLog)
  }, db)
}
