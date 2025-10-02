import { and, count, eq, inArray, isNull } from 'drizzle-orm'
import { commits } from '../../schema/models/commits'
import { documentLogs } from '../../schema/models/documentLogs'
import { documentVersions } from '../../schema/models/documentVersions'
import { database } from '../../client'
import { DocumentVersion } from '../../schema/types'

export async function countDocumentLogs(
  document: DocumentVersion,
  db = database,
) {
  const commitIds = await db
    .selectDistinct({ commitId: documentVersions.commitId })
    .from(documentVersions)
    .innerJoin(commits, eq(commits.id, documentVersions.commitId))
    .where(
      and(
        isNull(commits.deletedAt),
        eq(documentVersions.documentUuid, document.documentUuid),
      ),
    )
    .then((r) => r.map((c) => c.commitId))

  return db
    .select({
      count: count(documentLogs.id),
    })
    .from(documentLogs)
    .where(
      and(
        eq(documentLogs.documentUuid, document.documentUuid),
        inArray(documentLogs.commitId, commitIds),
      ),
    )
    .then((r) => r[0]?.count ?? 0)
}
