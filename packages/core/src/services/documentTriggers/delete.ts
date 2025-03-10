import { DocumentTrigger, Workspace } from '../../browser'
import { LatitudeError, PromisedResult, Result, Transaction } from '../../lib'
import { documentTriggers } from '../../schema'
import { database } from '../../client'
import { and, eq } from 'drizzle-orm'

export async function deleteDocumentTrigger(
  {
    workspace,
    documentTrigger,
  }: {
    workspace: Workspace
    documentTrigger: DocumentTrigger
  },
  db = database,
): PromisedResult<DocumentTrigger> {
  return await Transaction.call(async (tx) => {
    const result = await tx
      .delete(documentTriggers)
      .where(
        and(
          eq(documentTriggers.workspaceId, workspace.id),
          eq(documentTriggers.id, documentTrigger.id),
        ),
      )
      .returning()

    if (!result.length) {
      return Result.error(
        new LatitudeError('Failed to delete document trigger'),
      )
    }

    return Result.ok(result[0]! as DocumentTrigger)
  }, db)
}
