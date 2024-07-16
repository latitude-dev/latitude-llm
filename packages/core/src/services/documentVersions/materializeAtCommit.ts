import { database } from '$core/client'
import { HEAD_COMMIT } from '$core/constants'
import { findCommit } from '$core/data-access'
import { Result } from '$core/lib'
import { NotFoundError } from '$core/lib/errors'
import { commits, documentVersions } from '$core/schema'
import { and, desc, eq, isNotNull, lte } from 'drizzle-orm'

export async function materializeDocumentsAtCommit({
  commitUuid = HEAD_COMMIT,
}: {
  commitUuid: string
}) {
  const commit = await findCommit({ uuid: commitUuid })
  if (!commit || !commit.mergedAt) {
    return Result.error(new NotFoundError('Commit not found'))
  }

  const docsInCommits = await database
    .selectDistinct()
    .from(documentVersions)
    .innerJoin(commits, eq(commits.id, documentVersions.commitId))
    .where(
      and(isNotNull(commits.mergedAt), lte(commits.mergedAt, commit.mergedAt!)),
    )
    .groupBy(documentVersions.documentUuid, documentVersions.id, commits.id)
    .orderBy(desc(commits.mergedAt))

  return Result.ok(docsInCommits.map((doc) => doc.document_versions))
}
