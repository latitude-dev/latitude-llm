import { IntegrationReference } from '@latitude-data/constants'
import { LatitudeError } from '@latitude-data/constants/errors'
import { IntegrationDto } from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import { PromisedResult } from '../../lib/Transaction'
import { DocumentTriggersRepository } from '../../repositories'

export async function listReferences(
  integration: IntegrationDto,
  db = database,
): PromisedResult<IntegrationReference[], LatitudeError> {
  const triggersScope = new DocumentTriggersRepository(
    integration.workspaceId,
    db,
  )
  const references = await triggersScope.findByIntegrationId(integration.id)

  return Result.ok(
    references.map((trigger) => ({
      projectId: trigger.projectId,
      documentUuid: trigger.documentUuid,
      asTrigger: true,
    })),
  )
}
