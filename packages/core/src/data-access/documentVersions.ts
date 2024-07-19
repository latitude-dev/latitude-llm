import {
  commits,
  database,
  DocumentVersion,
  documentVersions,
  findCommitById,
  Result,
  TypedResult,
} from '@latitude-data/core'
import { LatitudeError, NotFoundError } from '$core/lib/errors'
import { and, eq, isNotNull, lte, max } from 'drizzle-orm'

async function getCommitMergedAt({
  commitId,
}: {
  commitId: number
}): Promise<TypedResult<Date | null, LatitudeError>> {
  const commitResult = await findCommitById({ id: commitId })
  if (commitResult.error) return commitResult

  return Result.ok(commitResult.value.mergedAt)
}

export async function getDocumentsAtCommit(
  {
    commitId,
    commitMergedAt,
  }: { commitId: number; commitMergedAt?: Date | null },
  tx = database,
): Promise<TypedResult<DocumentVersion[], LatitudeError>> {
  let maxMergedAt: Date | null
  if (commitMergedAt !== undefined) {
    maxMergedAt = commitMergedAt
  } else {
    const maxMergedAtResult = await getCommitMergedAt({ commitId })
    if (maxMergedAtResult.error) return maxMergedAtResult
    maxMergedAt = maxMergedAtResult.value!
  }

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

  if (maxMergedAt !== null) {
    // Referenced commit is merged. No additional documents to return.
    return Result.ok(documentsAtPreviousMergedCommits)
  }

  const documentsAtDraftResult = await tx
    .select()
    .from(documentVersions)
    .innerJoin(commits, eq(commits.id, documentVersions.commitId))
    .where(eq(commits.id, commitId))

  const documentsAtDraft = documentsAtDraftResult.map(
    (d) => d.document_versions,
  )
  const totalDocuments = documentsAtPreviousMergedCommits
    .filter(
      (d) =>
        documentsAtDraft.find((d2) => d2.documentUuid === d.documentUuid) ===
        undefined,
    )
    .concat(documentsAtDraft)

  return Result.ok(totalDocuments)
}

export async function getDocument({
  commitId,
  documentId,
}: {
  commitId: number
  documentId: number
}): Promise<TypedResult<{ content: string }, LatitudeError>> {
  const commitResult = await findCommitById({ id: commitId })
  if (commitResult.error) return commitResult
  const commit = commitResult.unwrap()

  const result = await database
    .select({ content: documentVersions.content })
    .from(documentVersions)
    .where(
      and(
        eq(documentVersions.id, documentId),
        eq(documentVersions.commitId, commit.id),
      ),
    )

  if (result.length === 0) {
    return Result.error(new NotFoundError('Document not found'))
  }

  const documentVersion = result[0]!
  return Result.ok({ content: documentVersion.content ?? '' })
}

export async function listCommitChanges(
  { commitId }: { commitId: number },
  tx = database,
) {
  const changedDocuments = await tx.query.documentVersions.findMany({
    where: eq(documentVersions.commitId, commitId),
  })

  return Result.ok(changedDocuments)
}
