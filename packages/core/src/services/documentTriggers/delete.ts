import { DocumentTriggerType } from '@latitude-data/constants'
import { and, eq } from 'drizzle-orm'
import { DocumentTrigger, Workspace } from '../../browser'
import { database } from '../../client'
import { LatitudeError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { documentTriggers } from '../../schema'
import { destroyPipedreamTrigger } from '../integrations/pipedream/triggers'

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
  if (documentTrigger.triggerType === DocumentTriggerType.Integration) {
    const destroyIntegrationTriggerResult = await destroyPipedreamTrigger({
      workspace,
      documentTrigger,
    })

    if (!Result.isOk(destroyIntegrationTriggerResult)) {
      return destroyIntegrationTriggerResult
    }
  }

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
