import { eq } from 'drizzle-orm'
import { database } from '../../../client'
import { documentLogs } from '../../../schema'
import { DocumentVersion } from '../../../browser'

export async function findSomeDocumentLog(
  document: DocumentVersion,
  db = database,
) {
  return await db
    .select()
    .from(documentLogs)
    .where(eq(documentLogs.documentUuid, document.documentUuid))
    .limit(1)
    .then((r) => r[0])
}
