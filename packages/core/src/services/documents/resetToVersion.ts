import { and, eq } from 'drizzle-orm'
import { omit } from 'lodash-es'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import { ConflictError, LatitudeError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { assertCanEditCommit } from '../../lib/assertCanEditCommit'
import { DocumentVersionsRepository } from '../../repositories'
import { documentVersions } from '../../schema/models/documentVersions'
import { inheritDocumentRelations } from './inheritRelations'

export async function resetToDocumentVersion(
  {
    workspace,
    documentVersion,
    draft,
  }: {
    workspace: Workspace
    documentVersion: DocumentVersion
    draft: Commit
  },
  transaction = new Transaction(),
): Promise<TypedResult<DocumentVersion, Error>> {
  return await transaction.call(async (tx) => {
    const canEditCheck = await assertCanEditCommit(draft, tx)
    if (canEditCheck.error) return canEditCheck

    const docRepo = new DocumentVersionsRepository(workspace!.id, tx)
    const documentsInDraft = await docRepo.getDocumentsAtCommit(draft)
    if (documentsInDraft.error) return Result.error(documentsInDraft.error)
    if (
      documentsInDraft.value.some(
        (d) =>
          d.path === documentVersion.path &&
          d.documentUuid !== documentVersion.documentUuid,
      )
    ) {
      return Result.error(
        new ConflictError(
          'Document with the same path already exists in the draft',
        ),
      )
    }

    await tx
      .delete(documentVersions)
      .where(
        and(
          eq(documentVersions.commitId, draft.id),
          eq(documentVersions.documentUuid, documentVersion.documentUuid),
        ),
      )

    const insertedDocument = await tx
      .insert(documentVersions)
      .values({
        ...omit(documentVersion, ['id', 'commitId', 'updatedAt', 'createdAt']),
        commitId: draft.id,
      })
      .returning()

    if (insertedDocument.length === 0) {
      return Result.error(new LatitudeError('Could not reset to version'))
    }

    await inheritDocumentRelations(
      {
        fromVersion: documentVersion,
        toVersion: insertedDocument[0]!,
        workspace: workspace,
      },
      transaction,
    ).then((r) => r.unwrap())

    // Invalidate all resolvedContent for this commit
    await tx
      .update(documentVersions)
      .set({ resolvedContent: null })
      .where(eq(documentVersions.commitId, draft.id))

    return Result.ok(insertedDocument[0]!)
  })
}
