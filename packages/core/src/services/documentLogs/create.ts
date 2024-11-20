import { Message } from '@latitude-data/compiler'

import { Commit, DocumentLog, LogSources } from '../../browser'
import { database } from '../../client'
import { findWorkspaceFromCommit } from '../../data-access'
import { publisher } from '../../events/publisher'
import {
  generateUUIDIdentifier,
  NotFoundError,
  Result,
  Transaction,
} from '../../lib'
import { documentLogs } from '../../schema'
import { createProviderLog } from '../providerLogs'

export type CreateDocumentLogProps = {
  commit: Commit
  data: {
    uuid: string
    documentUuid: string
    originalPrompt: string
    parameters: Record<string, unknown>
    contentHash: string
    duration?: number
    source: LogSources
    customIdentifier?: string
    createdAt?: Date
    providerLog?: {
      messages: Message[]
      responseText?: string
    }
  }
}

export async function createDocumentLog(
  {
    data: {
      uuid,
      documentUuid,
      originalPrompt,
      contentHash,
      parameters,
      customIdentifier,
      duration,
      source,
      createdAt,
      providerLog,
    },
    commit,
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
        originalPrompt,
        contentHash,
        parameters,
        customIdentifier,
        duration,
        source,
        createdAt,
      })
      .returning()

    const documentLog = inserts[0]!
    if (providerLog) {
      const workspace = await findWorkspaceFromCommit(commit, trx)
      if (!workspace) {
        throw new NotFoundError('Workspace not found')
      }

      await createProviderLog({
        uuid: generateUUIDIdentifier(),
        documentLogUuid: documentLog.uuid,
        messages: providerLog.messages,
        responseText: providerLog.responseText,
        generatedAt: new Date(),
        source,
        workspace,
      }).then((r) => r.unwrap())
    }

    publisher.publishLater({
      type: 'documentLogCreated',
      data: documentLog,
    })

    return Result.ok(documentLog)
  }, db)
}
