import { Commit, DocumentLog, LogSources } from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result, Transaction } from '../../lib'
import { documentLogs } from '../../schema'

export type CreateDocumentLogProps = {
  commit: Commit
  data: {
    uuid: string
    documentUuid: string
    parameters: Record<string, unknown>
    resolvedContent: string
    customIdentifier?: string
    duration: number
    source: LogSources
    createdAt?: Date
  }
}

export async function createDocumentLog(
  {
    data: {
      uuid,
      documentUuid,
      resolvedContent,
      parameters,
      customIdentifier,
      duration,
      source,
      createdAt,
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
        resolvedContent,
        parameters,
        customIdentifier,
        duration,
        source,
        createdAt,
      })
      .returning()

    const documentLog = inserts[0]!

    publisher.publishLater({
      type: 'documentLogCreated',
      data: documentLog,
    })

    return Result.ok(documentLog)
  }, db)
}
