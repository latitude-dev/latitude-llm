import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import { database } from '../../client'
import { BadRequestError, ConflictError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { DocumentVersionsRepository } from '../../repositories'
import { getChangesToRevertDocuments } from '../commits/computeRevertChanges'

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
