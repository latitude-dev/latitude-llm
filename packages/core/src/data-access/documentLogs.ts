import { and, eq } from 'drizzle-orm'
import { database } from '../client'
import { DocumentLog } from '../constants'
import { documentLogs } from '../schema/models/documentLogs'
import { documentVersions } from '../schema/models/documentVersions'

export const unsafelyFindDocumentLogById = async (
  id: number,
  db = database,
) => {
  const result = await db
    .select()
    .from(documentLogs)
    .where(eq(documentLogs.id, id))
    .limit(1)

  return result[0]
}

export const unsafelyFindDocumentLogByUuid = async (
  documentLogUuid: string,
  db = database,
) => {
  const result = await db
    .select()
    .from(documentLogs)
    .where(eq(documentLogs.uuid, documentLogUuid))
    .limit(1)

  return result[0]
}

export async function findDocumentFromLog(log: DocumentLog) {
  return database
    .select()
    .from(documentVersions)
    .where(
      and(
        eq(documentVersions.documentUuid, log.documentUuid),
        eq(documentVersions.commitId, log.commitId),
      ),
    )
    .limit(1)
    .then(([document]) => document)
}
