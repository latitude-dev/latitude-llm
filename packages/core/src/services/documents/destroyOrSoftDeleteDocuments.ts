import { omit } from 'lodash-es'

import { database } from '$core/client'
import { Result, Transaction, TypedResult } from '$core/lib'
import { Commit, DocumentVersion, documentVersions } from '$core/schema'
import { and, eq, inArray, ne } from 'drizzle-orm'

async function findUuidsInOtherCommits({
  tx,
  documents,
  commitId,
}: {
  documents: DocumentVersion[]
  commitId: number
  tx: typeof database
}) {
  const uuids = documents.map((d) => d.documentUuid)
  const docs = await tx
    .select()
    .from(documentVersions)
    .where(
      and(
        inArray(documentVersions.documentUuid, uuids),
        ne(documentVersions.commitId, commitId),
      ),
    )

  return docs.map((d) => d.documentUuid)
}

function getToBeSoftDeleted({
  documents,
  existingUuids,
}: {
  documents: DocumentVersion[]
  existingUuids: string[]
}) {
  return documents.filter((d) => existingUuids.includes(d.documentUuid))
}

/**
 * Destroy documents that were NOT CREATED in other commits in the past
 * This is a hard delete so we don't leave leftovers in the database
 */
async function hardDestroyDocuments({
  documents,
  existingUuids,
  tx,
}: {
  documents: DocumentVersion[]
  existingUuids: string[]
  tx: typeof database
}) {
  const uuids = documents
    .filter((d) => !existingUuids.includes(d.documentUuid))
    .map((d) => d.documentUuid)
  if (uuids.length === 0) return
  return tx
    .delete(documentVersions)
    .where(inArray(documentVersions.documentUuid, uuids))
}

async function createDocumentsAsSoftDeleted({
  toBeCreated,
  commitId,
  tx,
}: {
  toBeCreated: DocumentVersion[]
  commitId: number
  tx: typeof database
}) {
  if (!toBeCreated.length) return

  return tx.insert(documentVersions).values(
    toBeCreated.map((d) => ({
      ...omit(d, ['id', 'updatedAt', 'createdAt']),
      deletedAt: new Date(),
      commitId,
    })),
  )
}

async function updateDocumetsAsSoftDeleted({
  toBeUpdated,
  commitId,
  tx,
}: {
  toBeUpdated: DocumentVersion[]
  commitId: number
  tx: typeof database
}) {
  const uuids = toBeUpdated.map((d) => d.documentUuid)
  if (!uuids.length) return

  return tx
    .update(documentVersions)
    .set({ deletedAt: new Date() })
    .where(
      and(
        inArray(documentVersions.documentUuid, uuids),
        eq(documentVersions.commitId, commitId),
      ),
    )
}

async function invalidateDocumentsCacheInCommit(
  commitId: number,
  tx = database,
) {
  return tx
    .update(documentVersions)
    .set({ resolvedContent: null })
    .where(eq(documentVersions.commitId, commitId))
}

/**
 * Destroy or soft delete documents in a commit
 * A document can:
 *
 * 1. Not exists in previous commits. In this case, it will be hard deleted
 * 2. Exists in previous commits and in the commit. It will be updated the `deletedAt` field
 * 3. Exists in previous commits but not in the commit. It will be created as soft deleted
 */
export async function destroyOrSoftDeleteDocuments({
  documents,
  commit,
  trx = database,
}: {
  documents: DocumentVersion[]
  commit: Commit
  trx?: typeof database
}): Promise<TypedResult<boolean, Error>> {
  return Transaction.call(async (tx) => {
    const commitId = commit.id
    const existingUuids = await findUuidsInOtherCommits({
      tx,
      documents,
      commitId,
    })
    const toBeSoftDeleted = getToBeSoftDeleted({ documents, existingUuids })
    const toBeCreated = toBeSoftDeleted.filter((d) => d.commitId !== commitId)
    const toBeUpdated = toBeSoftDeleted.filter((d) => d.commitId === commitId)

    await Promise.all([
      hardDestroyDocuments({ documents, existingUuids, tx }),
      createDocumentsAsSoftDeleted({ toBeCreated, commitId, tx }),
      updateDocumetsAsSoftDeleted({ toBeUpdated, commitId, tx }),
      invalidateDocumentsCacheInCommit(commitId, tx),
    ])

    return Result.ok(true)
  }, trx)
}
