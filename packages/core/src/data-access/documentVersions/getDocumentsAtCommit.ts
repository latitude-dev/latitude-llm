import {
  commits,
  database,
  DocumentVersion,
  documentVersions,
  findCommit,
  getCommitMergedAt,
  Result,
  TypedResult,
} from '@latitude-data/core'
import { LatitudeError } from '$core/lib/errors'
import { and, eq, isNotNull, lte, max } from 'drizzle-orm'

export async function getDocumentsAtCommit(
  { commitUuid, projectId }: { commitUuid: string; projectId: number },
  tx = database,
): Promise<TypedResult<DocumentVersion[], LatitudeError>> {
  const maxMergedAtResult = await getCommitMergedAt({ commitUuid, projectId })
  if (maxMergedAtResult.error) return maxMergedAtResult
  const maxMergedAt = maxMergedAtResult.unwrap()

  const whereStatement = () => {
    const mergedAtNotNull = isNotNull(commits.mergedAt)
    if (!maxMergedAt) {
      return mergedAtNotNull
    }
    return and(mergedAtNotNull, lte(commits.mergedAt, maxMergedAt))
  }

  const lastVersionOfEachDocument = tx.$with('lastVersionOfDocuments').as(
    tx
      .select({
        documentUuid: documentVersions.documentUuid,
        mergedAt: max(commits.mergedAt).as('maxMergedAt'),
      })
      .from(documentVersions)
      .innerJoin(commits, eq(commits.id, documentVersions.commitId))
      .where(whereStatement())
      .groupBy(documentVersions.documentUuid),
  )

  const documentsAtPreviousMergedCommitsResult = await tx
    .with(lastVersionOfEachDocument)
    .select()
    .from(documentVersions)
    .innerJoin(
      commits,
      and(
        eq(commits.id, documentVersions.commitId),
        isNotNull(commits.mergedAt),
      ),
    )
    .innerJoin(
      lastVersionOfEachDocument,
      and(
        eq(
          documentVersions.documentUuid,
          lastVersionOfEachDocument.documentUuid,
        ),
        eq(commits.mergedAt, lastVersionOfEachDocument.mergedAt),
      ),
    )

  const documentsAtPreviousMergedCommits =
    documentsAtPreviousMergedCommitsResult.map((d) => d.document_versions)

  if (maxMergedAt) {
    // Referenced commit is merged. No additional documents to return.
    return Result.ok(documentsAtPreviousMergedCommits)
  }

  const commitResult = await findCommit({ projectId, uuid: commitUuid })
  if (commitResult.error) return commitResult

  const commit = commitResult.unwrap()

  const documentsAtDraftResult = await tx
    .select()
    .from(documentVersions)
    .innerJoin(commits, eq(commits.id, documentVersions.commitId))
    .where(eq(commits.id, commit.id))

  const documentsAtDraft = documentsAtDraftResult.map(
    (d) => d.document_versions,
  )
  const totalDocuments = documentsAtPreviousMergedCommits
    .filter((d) =>
      documentsAtDraft.find((d2) => d2.documentUuid !== d.documentUuid),
    )
    .concat(documentsAtDraft)

  return Result.ok(totalDocuments)
}
