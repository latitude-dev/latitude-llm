import type { LatitudeError } from '@latitude-data/constants/errors'
import type { DocumentTrigger, IntegrationDto } from '../../browser'
import type { PromisedResult } from '../../lib/Transaction'
import { DocumentTriggersRepository } from '../../repositories'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import { DocumentTriggerType, type IntegrationReference } from '@latitude-data/constants'

export async function listReferences(
  integration: IntegrationDto,
  db = database,
): PromisedResult<IntegrationReference[], LatitudeError> {
  const triggersScope = new DocumentTriggersRepository(integration.workspaceId, db)

  const triggersResult = await triggersScope.getAllActiveTriggersInWorkspace()
  if (!Result.isOk(triggersResult)) return triggersResult

  const triggers = triggersResult.unwrap()
  const references = triggers.filter(
    (trigger) =>
      trigger.triggerType === DocumentTriggerType.Integration &&
      (trigger as DocumentTrigger<DocumentTriggerType.Integration>).configuration.integrationId ===
        integration.id,
  )

  return Result.ok(
    references.map((trigger) => ({
      projectId: trigger.projectId,
      documentUuid: trigger.documentUuid,
      asTrigger: true,
    })),
  )
}
