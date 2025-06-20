import { Commit, DocumentVersion, Workspace } from '../../browser'
import { database } from '../../client'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { DocumentVersionsRepository } from '../../repositories'
import { destroyOrSoftDeleteDocuments } from '../documents/destroyOrSoftDeleteDocuments'
import { createNewDocument, updateDocument } from '../documents'

export interface PushChangeDocument {
  path: string
  content: string
  status: 'added' | 'modified' | 'deleted' | 'unchanged'
  contentHash?: string
}

export interface PersistPushChangesParams {
  commit: Commit
  workspace: Workspace
  changes: PushChangeDocument[]
}

type DocumentVersionToProcess = Partial<DocumentVersion> &
  Pick<DocumentVersion, 'path' | 'content'>

/**
 * Persists push changes to a commit by creating, updating, or deleting document versions
 */
export async function persistPushChanges(
  { commit, workspace, changes }: PersistPushChangesParams,
  tx = database,
): Promise<TypedResult<Commit, Error>> {
  const docsScope = new DocumentVersionsRepository(workspace.id)
  const originDocuments = await docsScope
    .getDocumentsAtCommit(commit)
    .then((r) => r.unwrap())

  return await Transaction.call(async (trx) => {
    // Ensure the commit is a draft
    assertCommitIsDraft(commit).unwrap()

    // Filter out unchanged documents
    const changeDocuments = changes.filter((doc) => doc.status !== 'unchanged')

    if (changeDocuments.length === 0) {
      return Result.ok(commit)
    }

    // Create a map of current documents by path for quick lookup
    const originDocMap = new Map(originDocuments.map((doc) => [doc.path, doc]))

    // Prepare document versions for each change
    const documentVersionsToProcess: DocumentVersionToProcess[] = []
    const documentsToDelete: DocumentVersion[] = []

    for (const changeDoc of changeDocuments) {
      const originDoc = originDocMap.get(changeDoc.path)

      if (changeDoc.status === 'deleted') {
        // Mark for deletion
        if (originDoc) {
          documentsToDelete.push(originDoc)
        }
      } else if (
        changeDoc.status === 'added' ||
        changeDoc.status === 'modified'
      ) {
        const documentVersion: DocumentVersionToProcess = {
          documentUuid: originDocMap.get(changeDoc.path)?.documentUuid,
          path: changeDoc.path,
          content: changeDoc.content,
        }

        documentVersionsToProcess.push(documentVersion)
      }
    }

    // Delete documents that should be removed
    if (documentsToDelete.length > 0) {
      await destroyOrSoftDeleteDocuments({
        documents: documentsToDelete,
        commit,
        workspace,
        trx,
      })
    }

    // Separate documents to insert vs update
    const [docsToInsert, docsToUpdate] = documentVersionsToProcess.reduce(
      (acc, doc) => {
        const existingDoc = originDocuments.find(
          (d) => d.documentUuid === doc.documentUuid,
        )
        if (existingDoc) {
          acc[1].push(doc)
        } else {
          acc[0].push(doc)
        }
        return acc
      },
      [[], []] as [DocumentVersionToProcess[], DocumentVersionToProcess[]],
    )

    await Promise.all(
      docsToInsert.map((doc) =>
        createNewDocument(
          {
            content: doc.content,
            workspace,
            commit,
            path: doc.path,
          },
          trx,
        ).then((r) => r.unwrap()),
      ),
    )

    // Update existing documents
    await Promise.all(
      docsToUpdate.map((doc) =>
        updateDocument(
          {
            document: originDocMap.get(doc.path)!,
            commit,
            path: doc.path,
            content: doc.content,
          },
          trx,
        ).then((r) => r.unwrap()),
      ),
    )

    return Result.ok(commit)
  }, tx)
}
