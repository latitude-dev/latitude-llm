import { and, eq, getTableColumns } from 'drizzle-orm'
import { database } from '../client'
import { commits, documentVersions } from '../schema'

export async function unsafelyFindDocumentVersionByPath(
  {
    projectId,
    commitUuid,
    path,
  }: {
    projectId: number
    commitUuid: string
    path: string
  },
  db = database,
) {
  return db
    .select(getTableColumns(documentVersions))
    .from(documentVersions)
    .innerJoin(commits, eq(commits.id, documentVersions.commitId))
    .where(
      and(
        eq(documentVersions.path, path),
        eq(commits.projectId, projectId),
        eq(commits.uuid, commitUuid),
      ),
    )
    .then((r) => r[0])
}
