import { commits, database, documentVersions } from '@latitude-data/core'
import { desc, eq, inArray, lte } from 'drizzle-orm'

import { listStagedCommits } from './commits'

export async function listStagedDocuments() {
  const commits = await listStagedCommits()
  if (!commits.length) return []

  return database
    .select()
    .from(documentVersions)
    .where(
      inArray(
        documentVersions.commitId,
        commits.map((c) => c.id),
      ),
    )
}

export async function getDocumentsAtCommit(commitUuid: string) {
  const referenceCommitId = await database
    .select({ id: commits.id })
    .from(commits)
    .where(eq(commits.uuid, commitUuid))
  if (referenceCommitId.length === 0) return []

  const commitIdsBeforeReferenceCommit = await database
    .select({ id: commits.id })
    .from(commits)
    .where(lte(commits.id, referenceCommitId[0]!.id))

  const docsInCommits = await database
    .selectDistinct()
    .from(documentVersions)
    .innerJoin(commits, eq(commits.id, documentVersions.commitId))
    .where(
      inArray(
        commits.id,
        commitIdsBeforeReferenceCommit.map((d) => d.id),
      ),
    )
    .groupBy(documentVersions.documentUuid)
    .orderBy(desc(documentVersions.commitId))

  return docsInCommits.map((doc) => doc.document_versions)
}
