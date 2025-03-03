import { omit } from 'lodash-es'

import { and, eq, inArray, ne } from 'drizzle-orm'

import { Commit, DocumentVersion, Workspace } from '../../browser'
import { database } from '../../client'
import { Result, Transaction, TypedResult } from '../../lib'
import { documentVersions, evaluationVersions } from '../../schema'
import { pingProjectUpdate } from '../projects'
import { inheritDocumentRelations } from './inheritRelations'

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

async function hardDestroyEvaluations({
  documentUuids,
  tx,
}: {
  documentUuids: string[]
  tx: typeof database
}) {
  return tx
    .delete(evaluationVersions)
    .where(inArray(evaluationVersions.documentUuid, documentUuids))
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

  await hardDestroyEvaluations({ documentUuids: uuids, tx })

  return tx
    .delete(documentVersions)
    .where(inArray(documentVersions.documentUuid, uuids))
}

async function createDocumentsAsSoftDeleted({
  toBeCreated,
  commitId,
  workspace,
  tx,
}: {
  toBeCreated: DocumentVersion[]
  commitId: number
  workspace: Workspace
  tx: typeof database
}) {
  if (!toBeCreated.length) return

  const inserted = await tx
    .insert(documentVersions)
    .values(
      toBeCreated.map((d) => ({
        ...omit(d, ['id', 'updatedAt', 'createdAt']),
        deletedAt: new Date(),
        commitId,
      })),
    )
    .returning()

  await Promise.all(
    inserted.map(async (toVersion) => {
      const fromVersion = toBeCreated.find(
        (d) => d.documentUuid === toVersion.documentUuid,
      )!
      return await inheritDocumentRelations(
        { fromVersion, toVersion, workspace },
        tx,
      ).then((r) => r.unwrap())
    }),
  )
}

async function updateEvaluationsAsSoftDeleted({
  commitId,
  documentUuids,
  tx,
}: {
  commitId: number
  documentUuids: string[]
  tx: typeof database
}) {
  return tx
    .update(evaluationVersions)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(evaluationVersions.commitId, commitId),
        inArray(evaluationVersions.documentUuid, documentUuids),
      ),
    )
}

async function updateDocumentsAsSoftDeleted({
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

  await updateEvaluationsAsSoftDeleted({
    commitId,
    documentUuids: uuids,
    tx,
  })

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
  workspace,
  trx = database,
}: {
  documents: DocumentVersion[]
  commit: Commit
  workspace: Workspace
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
      createDocumentsAsSoftDeleted({ toBeCreated, commitId, workspace, tx }),
      updateDocumentsAsSoftDeleted({ toBeUpdated, commitId, tx }),
    ])

    await invalidateDocumentsCacheInCommit(commitId, tx)

    await pingProjectUpdate({ projectId: commit.projectId }, tx)

    return Result.ok(true)
  }, trx)
}
