import { and, eq } from 'drizzle-orm'
import { omit } from 'lodash-es'
import { Commit, DocumentVersion, Workspace } from '../../browser'
import { database } from '../../client'
import { DocumentVersionsRepository } from '../../repositories'
import { documentVersions } from '../../schema'
import { inheritDocumentRelations } from './inheritRelations'
import { ConflictError } from './../../lib/errors'
import { LatitudeError } from './../../lib/errors'
import { Result } from './../../lib/Result'
import { TypedResult } from './../../lib/Result'
import Transaction from './../../lib/Transaction'

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
  db = database,
): Promise<TypedResult<DocumentVersion, Error>> {
  const docRepo = new DocumentVersionsRepository(workspace!.id, db)
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

  return await Transaction.call(async (tx) => {
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
      tx,
    ).then((r) => r.unwrap())

    // Invalidate all resolvedContent for this commit
    await tx
      .update(documentVersions)
      .set({ resolvedContent: null })
      .where(eq(documentVersions.commitId, draft.id))

    return Result.ok(insertedDocument[0]!)
  }, db)
}
