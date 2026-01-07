import { omit } from 'lodash-es'

import { and, eq, inArray, ne } from 'drizzle-orm'

import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { EvaluationsV2Repository } from '../../repositories'
import { documentVersions } from '../../schema/models/documentVersions'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import { updateCommit } from '../commits'
import { deleteDocumentTriggersFromDocuments } from '../documentTriggers/deleteDocumentTriggersFromDocuments'
import { deleteEvaluationV2 } from '../evaluationsV2/delete'
import { pingProjectUpdate } from '../projects'

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
 * Destroy or soft delete documents in a commit:
 * - If the document was created in this same draft version, it will be hard deleted
 * - If the document was created in a previous commit, it will be soft deleted (upserting deletedAt)
 */
export async function destroyOrSoftDeleteDocuments(
  {
    documents,
    commit,
    workspace,
  }: {
    documents: DocumentVersion[]
    commit: Commit
    workspace: Workspace
  },
  transaction = new Transaction(),
): Promise<TypedResult<boolean, Error>> {
  let softDeletedDocumentUuids: string[] = []
  let hardDeletedDocumentUuids: string[] = []

  return transaction.call(
    async (tx) => {
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
              deleteEvaluationV2(
                { evaluation, commit, workspace },
                transaction,
              ).then((r) => r.unwrap()),
            ),
          )
        }),
      )
      const deleteAllTriggerDocumentsResult =
        await deleteDocumentTriggersFromDocuments(
          {
            commit,
            workspace,
            documents,
          },
          transaction,
        )

      if (!Result.isOk(deleteAllTriggerDocumentsResult)) {
        return deleteAllTriggerDocumentsResult
      }

      // If main document has been deleted, set it to null
      if (
        commit.mainDocumentUuid &&
        documents.map((d) => d.documentUuid).includes(commit.mainDocumentUuid)
      ) {
        const commitUpdateResult = await updateCommit(
          {
            workspace,
            commit,
            data: {
              mainDocumentUuid: null,
            },
          },
          transaction,
        )

        if (commitUpdateResult.error) return commitUpdateResult
      }

      const existingUuids = await findUuidsInOtherCommits({
        tx: tx,
        documents: documents,
        commit: commit,
      })
      const toBeSoftDeleted = getToBeSoftDeleted({ documents, existingUuids })
      const toBeCreated = toBeSoftDeleted.filter(
        (d) => d.commitId !== commit.id,
      )
      const toBeUpdated = toBeSoftDeleted.filter(
        (d) => d.commitId === commit.id,
      )

      hardDeletedDocumentUuids = documents
        .filter((d) => !existingUuids.includes(d.documentUuid))
        .map((d) => d.documentUuid)
      softDeletedDocumentUuids = toBeSoftDeleted.map((d) => d.documentUuid)

      await Promise.all([
        hardDestroyDocuments({ documents, existingUuids, tx }),
        createDocumentsAsSoftDeleted({ toBeCreated, commit, tx }),
        updateDocumentsAsSoftDeleted({ toBeUpdated, commit, tx }),
      ])

      await invalidateDocumentsCacheInCommit(commit.id, tx)
      await pingProjectUpdate({ projectId: commit.projectId }, transaction)

      return Result.ok(true)
    },
    () => {
      publisher.publishLater({
        type: 'documentsDeleted',
        data: {
          workspaceId: workspace.id,
          projectId: commit.projectId,
          commitUuid: commit.uuid,
          documentUuids: documents.map((d) => d.documentUuid),
          softDeletedDocumentUuids,
          hardDeletedDocumentUuids,
        },
      })
    },
  )
}
