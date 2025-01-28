import { omit } from 'lodash-es'
import { Commit, DocumentVersion, Workspace } from '../../browser'
import { database } from '../../client'
import { BadRequestError, Result, TypedResult } from '../../lib'
import { DocumentVersionsRepository } from '../../repositories'
import DiffMatchPatch from 'diff-match-patch'

/**
 * Computes the patches made from oldValue to newValue, and applies them to target
 */
function resolveContentChanges({
  oldValue,
  newValue,
  target,
}: {
  oldValue: string
  newValue: string
  target: string
}): string {
  const dmp = new DiffMatchPatch()
  const patches = dmp.patch_make(oldValue, newValue)
  return dmp.patch_apply(patches, target)[0]
}

type GroupedDocumentVersions = {
  originalDocument?: DocumentVersion
  changedDocument?: DocumentVersion
}[]
function groupDocumentVersionsByUuid({
  originalDocuments,
  changedDocuments,
}: {
  originalDocuments: DocumentVersion[]
  changedDocuments: DocumentVersion[]
}): GroupedDocumentVersions {
  const groupedDocs: GroupedDocumentVersions = originalDocuments.map(
    (oldDoc) => ({
      originalDocument: oldDoc,
    }),
  )

  changedDocuments.forEach((newDoc) => {
    const idx = groupedDocs.findIndex(
      (doc) => doc.originalDocument?.documentUuid === newDoc.documentUuid,
    )
    if (idx === -1) {
      groupedDocs.push({ changedDocument: newDoc })
    } else {
      groupedDocs[idx]!.changedDocument = newDoc
    }
  })

  return groupedDocs
}

function getChangesToRevertDocument({
  originalDocument,
  changedDocument,
}: {
  originalDocument?: DocumentVersion
  changedDocument?: DocumentVersion
}): Partial<DocumentVersion> {
  if (!originalDocument && !changedDocument) {
    return {}
  }

  if (!originalDocument) {
    // If the file did not exist, the revert action is to delete it
    return {
      deletedAt: new Date(),
    }
  }

  if (!changedDocument) {
    // If the file was deleted, the revert action is to restore it
    return {
      deletedAt: null,
    }
  }

  // Return values from originalDocument that have been changed in changedDocument
  return omit(
    Object.fromEntries(
      Object.entries(originalDocument).filter(
        ([key, value]) =>
          changedDocument[key as keyof DocumentVersion] !== value,
      ),
    ),
    [
      'id',
      'resolvedContent',
      'contentHash',
      'createdAt',
      'updatedAt',
      'mergedAt', // Why is this here (?)
      'commitId',
      'datasetId',
      'linkedDataset',
    ],
  )
}

export function getChangesToRevertDocuments({
  originalDocuments = [],
  changedDocuments = [],
  targetDraftDocuments,
}: {
  originalDocuments?: DocumentVersion[]
  changedDocuments?: DocumentVersion[]
  targetDraftDocuments: DocumentVersion[]
}): Partial<DocumentVersion>[] {
  const groupedDocs = groupDocumentVersionsByUuid({
    originalDocuments,
    changedDocuments,
  })

  return groupedDocs
    .map((docChanges) => {
      const documentUuid = (docChanges.originalDocument ??
        docChanges.changedDocument)!.documentUuid

      const changesToRevertDocument = getChangesToRevertDocument(docChanges)

      if (Object.keys(changesToRevertDocument).length === 0) {
        // No changes to be made
        return null
      }

      const documentInDraft = targetDraftDocuments.find(
        (d) => d.documentUuid === documentUuid,
      )

      if (!documentInDraft && changesToRevertDocument.deletedAt !== null) {
        // If the document is currently deleted and the changes to revert it do not include restoring it back, ignore it
        return null
      }

      if (documentInDraft && changesToRevertDocument.content) {
        const changedDocumentContent = changedDocuments.find(
          (d) => d.documentUuid === documentUuid,
        )?.content

        changesToRevertDocument.content = resolveContentChanges({
          oldValue: changedDocumentContent!, // We know this is defined because the content has changed
          newValue: changesToRevertDocument.content,
          target: documentInDraft.content,
        })
      }

      return {
        documentUuid,
        ...changesToRevertDocument,
      }
    })
    .filter((d) => d !== null)
}

export async function computeChangesToRevertCommit(
  {
    workspace,
    originalCommit,
    changedCommit,
    targetDraft,
  }: {
    workspace: Workspace
    originalCommit?: Commit
    changedCommit?: Commit
    targetDraft: Commit
  },
  db = database,
): Promise<TypedResult<Partial<DocumentVersion>[], Error>> {
  if (originalCommit && changedCommit) {
    if (originalCommit.id == changedCommit.id) {
      return Result.error(new BadRequestError('Commits must be different'))
    }
  }

  const documentsScope = new DocumentVersionsRepository(workspace.id, db)

  const originalDocs = await documentsScope.getDocumentsAtCommit(originalCommit)
  const changedDocs = await documentsScope.getDocumentsAtCommit(changedCommit)
  const documentsInDraft =
    await documentsScope.getDocumentsAtCommit(targetDraft)
  if (originalDocs.error) return Result.error(originalDocs.error)
  if (changedDocs.error) return Result.error(changedDocs.error)
  if (documentsInDraft.error) return Result.error(documentsInDraft.error)

  const changesToRevert = getChangesToRevertDocuments({
    originalDocuments: originalDocs.value,
    changedDocuments: changedDocs.value,
    targetDraftDocuments: documentsInDraft.value,
  })

  return Result.ok(changesToRevert)
}
