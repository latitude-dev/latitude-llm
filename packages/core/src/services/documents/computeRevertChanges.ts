import { omit } from 'lodash-es'
import { Commit, DocumentVersion, Workspace } from '../../browser'
import { database } from '../../client'
import { BadRequestError, ConflictError, Result, TypedResult } from '../../lib'
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

function getChangesToRevert({
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
  return Object.fromEntries(
    Object.entries(originalDocument).filter(
      ([key, value]) => changedDocument[key as keyof DocumentVersion] !== value,
    ),
  )
}

export async function computeDocumentRevertChanges(
  {
    workspace,
    originalDocument,
    changedDocument,
    draft,
  }: {
    workspace: Workspace
    originalDocument?: DocumentVersion
    changedDocument?: DocumentVersion
    draft: Commit
  },
  db = database,
): Promise<TypedResult<Partial<DocumentVersion>, Error>> {
  if (originalDocument && changedDocument) {
    if (originalDocument.documentUuid !== changedDocument.documentUuid) {
      return Result.error(new BadRequestError('Document UUIDs do not match'))
    }
    if (originalDocument.commitId == changedDocument.commitId) {
      return Result.error(new BadRequestError('Document versions are the same'))
    }
  }

  const changesToRevert: Partial<DocumentVersion> = omit(
    getChangesToRevert({ originalDocument, changedDocument }),
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

  if (Object.keys(changesToRevert).length === 0) {
    return Result.ok({})
  }

  const documentUuid =
    originalDocument?.documentUuid ?? changedDocument!.documentUuid

  const docsRepo = new DocumentVersionsRepository(workspace!.id, db)
  const documentsInDraft = await docsRepo.getDocumentsAtCommit(draft)
  if (documentsInDraft.error) return Result.error(documentsInDraft.error)
  const currentDocument = documentsInDraft.value.find(
    (d) => d.documentUuid === documentUuid,
  )

  if (
    !documentsInDraft.value.some((d) => d.documentUuid === documentUuid) &&
    changesToRevert.deletedAt !== null
  ) {
    // Reverting changes from a deleted document but keeping it deleted makes no sense
    return Result.error(
      new ConflictError('Cannot revert changes on a deleted document'),
    )
  }

  if (currentDocument && changesToRevert.content) {
    changesToRevert.content = resolveContentChanges({
      oldValue: changedDocument!.content,
      newValue: changesToRevert.content,
      target: currentDocument.content,
    })
  }

  return Result.ok(changesToRevert)
}
