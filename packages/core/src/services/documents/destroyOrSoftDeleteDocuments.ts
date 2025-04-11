import { omit } from 'lodash-es'

import { and, eq, inArray, ne } from 'drizzle-orm'

import { Commit, DocumentVersion, Workspace } from '../../browser'
import { database } from '../../client'
import { EvaluationsV2Repository } from '../../repositories'
import { documentVersions } from '../../schema'
import { deleteEvaluationV2 } from '../evaluationsV2'
import { pingProjectUpdate } from '../projects'
import { Result } from './../../lib/Result'
import { TypedResult } from './../../lib/Result'
import Transaction from './../../lib/Transaction'

async function findUuidsInOtherCommits({
  tx,
  documents,
  commit,
}: {
  documents: DocumentVersion[]
  commit: Commit
  tx: typeof database
}) {
  const uuids = documents.map((d) => d.documentUuid)
  const docs = await tx
    .select()
    .from(documentVersions)
    .where(
      and(
        inArray(documentVersions.documentUuid, uuids),
        ne(documentVersions.commitId, commit.id),
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
  commit,
  tx,
}: {
  toBeCreated: DocumentVersion[]
  commit: Commit
  tx: typeof database
}) {
  if (!toBeCreated.length) return

  return tx.insert(documentVersions).values(
    toBeCreated.map((d) => ({
      ...omit(d, ['id', 'updatedAt', 'createdAt']),
      deletedAt: new Date(),
      commitId: commit.id,
    })),
  )
}

async function updateDocumentsAsSoftDeleted({
  toBeUpdated,
  commit,
  tx,
}: {
  toBeUpdated: DocumentVersion[]
  commit: Commit
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
        eq(documentVersions.commitId, commit.id),
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
    const repository = new EvaluationsV2Repository(workspace.id, tx)

    await Promise.all(
      documents.map(async (document) => {
        const evaluations = await repository
          .listAtCommitByDocument({
            commitUuid: commit.uuid,
            documentUuid: document.documentUuid,
          })
          .then((r) => r.unwrap())

        await Promise.all(
          evaluations.map((evaluation) =>
            deleteEvaluationV2({ evaluation, commit, workspace }, tx).then(
              (r) => r.unwrap(),
            ),
          ),
        )
      }),
    )

    const existingUuids = await findUuidsInOtherCommits({
      tx: tx,
      documents: documents,
      commit: commit,
    })
    const toBeSoftDeleted = getToBeSoftDeleted({ documents, existingUuids })
    const toBeCreated = toBeSoftDeleted.filter((d) => d.commitId !== commit.id)
    const toBeUpdated = toBeSoftDeleted.filter((d) => d.commitId === commit.id)

    await Promise.all([
      hardDestroyDocuments({ documents, existingUuids, tx }),
      createDocumentsAsSoftDeleted({ toBeCreated, commit, tx }),
      updateDocumentsAsSoftDeleted({ toBeUpdated, commit, tx }),
    ])

    await invalidateDocumentsCacheInCommit(commit.id, tx)

    await pingProjectUpdate({ projectId: commit.projectId }, tx)

    return Result.ok(true)
  }, trx)
}
