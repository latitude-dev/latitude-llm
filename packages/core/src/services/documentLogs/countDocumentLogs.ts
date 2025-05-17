import { and, count, eq, isNull } from 'drizzle-orm'
import { commits, documentLogs } from '../../schema'
import { database } from '../../client'
import { DocumentVersion } from '../../browser'

export async function countDocumentLogs(
  document: DocumentVersion,
  db = database,
) {
  return db
    .select({
      count: count(documentLogs.id),
    })
    .from(documentLogs)
    .innerJoin(commits, eq(documentLogs.commitId, commits.id))
    .where(
      and(
        eq(documentLogs.documentUuid, document.documentUuid),
        isNull(commits.deletedAt),
      ),
    )
    .then((r) => r[0]?.count ?? 0)
}
