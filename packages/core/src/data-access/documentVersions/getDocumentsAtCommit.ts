import {
  commits,
  database,
  DocumentVersion,
  documentVersions,
  findCommitById,
  Result,
  TypedResult,
} from '@latitude-data/core'
import { LatitudeError } from '$core/lib/errors'
import { and, eq, getTableColumns, isNotNull, lte, max } from 'drizzle-orm'

async function fetchDocumentsFromMergedCommits(
  {
    projectId,
    maxMergedAt,
  }: {
    projectId: number
    maxMergedAt: Date | null
  },
  tx = database,
): Promise<DocumentVersion[]> {
  const filterByMaxMergedAt = () => {
    const mergedAtNotNull = isNotNull(commits.mergedAt)
    if (maxMergedAt === null) return mergedAtNotNull
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
      .where(and(filterByMaxMergedAt(), eq(commits.projectId, projectId)))
      .groupBy(documentVersions.documentUuid),
  )

  const documentsFromMergedCommits = await tx
    .with(lastVersionOfEachDocument)
    .select(getTableColumns(documentVersions))
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

  return documentsFromMergedCommits
}

function mergeDocuments(
  ...documentsArr: DocumentVersion[][]
): DocumentVersion[] {
  return documentsArr.reduce((acc, documents) => {
    return acc
      .filter((d) => {
        return !documents.find((d2) => d2.documentUuid === d.documentUuid)
      })
      .concat(documents)
  }, [])
}

export async function getDocumentsAtCommit(
  { commitId }: { commitId: number },
  tx = database,
): Promise<TypedResult<DocumentVersion[], LatitudeError>> {
  const commitResult = await findCommitById({ id: commitId })
  if (commitResult.error) return commitResult
  const commit = commitResult.value!

  const documentsFromMergedCommits = await fetchDocumentsFromMergedCommits({
    projectId: commit.projectId,
    maxMergedAt: commit.mergedAt,
  })

  if (commit.mergedAt !== null) {
    // Referenced commit is merged. No additional documents to return.
    return Result.ok(documentsFromMergedCommits)
  }

  const documentsFromDraft = await tx
    .select(getTableColumns(documentVersions))
    .from(documentVersions)
    .innerJoin(commits, eq(commits.id, documentVersions.commitId))
    .where(eq(commits.id, commitId))

  const totalDocuments = mergeDocuments(
    documentsFromMergedCommits,
    documentsFromDraft,
  )

  return Result.ok(totalDocuments)
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
