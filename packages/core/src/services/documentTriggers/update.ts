import { LatitudeError } from '@latitude-data/constants/errors'
import { and, eq } from 'drizzle-orm'
import { DocumentTrigger, Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { documentTriggers } from '../../schema'
import { buildConfiguration } from './helpers/buildConfiguration'
import {
  DocumentTriggerWithConfiguration,
  IntegrationTriggerConfiguration,
} from './helpers/schema'
import { DocumentTriggerType } from '@latitude-data/constants'
import { updatePipedreamTrigger } from '../integrations/pipedream/triggers'

export async function updateDocumentTriggerConfiguration(
  {
    workspace,
    documentTrigger,
    configuration,
  }: {
    workspace: Workspace
    documentTrigger: DocumentTrigger
    configuration: DocumentTriggerWithConfiguration['configuration']
  },
  transaction = new Transaction(),
): PromisedResult<DocumentTrigger> {
  if (documentTrigger.triggerType === DocumentTriggerType.Integration) {
    const preupdateResult = await updatePipedreamTrigger({
      workspace,
      originalConfig: documentTrigger.configuration,
      updatedConfig: configuration as IntegrationTriggerConfiguration,
    })

    if (!Result.isOk(preupdateResult)) return preupdateResult
    configuration = preupdateResult.unwrap()
  }

  return await transaction.call(async (tx) => {
    const result = await tx
      .update(documentTriggers)
      .set({
        configuration: buildConfiguration({
          triggerType: documentTrigger.triggerType,
          configuration,
        }),
      })
      .where(
        and(
          eq(documentTriggers.workspaceId, workspace.id),
          eq(documentTriggers.id, documentTrigger.id),
        ),
      )
      .returning()

    if (!result.length) {
      return Result.error(
        new LatitudeError('Failed to update document trigger configuration'),
      )
    }

    return Result.ok(result[0]! as DocumentTrigger)
  })
}
