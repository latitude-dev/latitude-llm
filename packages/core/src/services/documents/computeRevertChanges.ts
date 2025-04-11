import { Commit, DocumentVersion, Workspace } from '../../browser'
import { database } from '../../client'
import { DocumentVersionsRepository } from '../../repositories'
import { getChangesToRevertDocuments } from '../commits/computeRevertChanges'
import { BadRequestError } from './../../lib/errors'
import { ConflictError } from './../../lib/errors'
import { Result } from './../../lib/Result'
import { TypedResult } from './../../lib/Result'

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

  const docsRepo = new DocumentVersionsRepository(workspace!.id, db)
  const documentsInDraft = await docsRepo.getDocumentsAtCommit(draft)
  if (documentsInDraft.error) return Result.error(documentsInDraft.error)

  const changesToRevert: Partial<DocumentVersion>[] =
    getChangesToRevertDocuments({
      originalDocuments: originalDocument ? [originalDocument] : [],
      changedDocuments: changedDocument ? [changedDocument] : [],
      targetDraftDocuments: documentsInDraft.value,
    })

  if (Object.keys(changesToRevert).length === 0) {
    return Result.error(new ConflictError('No changes to revert'))
  }

  return Result.ok(changesToRevert[0]!)
}
