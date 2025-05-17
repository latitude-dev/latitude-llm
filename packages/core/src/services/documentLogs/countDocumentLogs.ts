import { count, eq } from 'drizzle-orm'
import { documentLogs } from '../../schema'
import { database } from '../../client'

export async function countDocumentLogs(documentUuid: string, db = database) {
  return db
    .select({
      count: count(documentLogs.id),
    })
    .from(documentLogs)
    .where(eq(documentLogs.documentUuid, documentUuid))
    .then((r) => r[0]?.count ?? 0)
}
