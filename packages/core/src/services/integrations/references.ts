import { LatitudeError } from '@latitude-data/constants/errors'
import { DocumentTrigger, IntegrationDto } from '../../schema/types'
import { PromisedResult } from '../../lib/Transaction'
import { DocumentTriggersRepository } from '../../repositories'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import {
  DocumentTriggerType,
  IntegrationReference,
} from '@latitude-data/constants'
import { DocumentIntegrationReferencesRepository } from '../../repositories/documentIntegrationReferencesRepository'

export async function listIntegrationReferences(
  integration: IntegrationDto,
  db = database,
): PromisedResult<IntegrationReference[], LatitudeError> {
  const workspaceId = integration.workspaceId

  const triggersScope = new DocumentTriggersRepository(workspaceId, db)
  const triggersResult = await triggersScope.getAllTriggers()
  if (!Result.isOk(triggersResult)) return triggersResult
  const triggers = triggersResult.unwrap()

  const triggerReferences: IntegrationReference[] = triggers
    .filter(
      (trigger) =>
        trigger.triggerType === DocumentTriggerType.Integration &&
        (trigger as DocumentTrigger<DocumentTriggerType.Integration>)
          .configuration.integrationId === integration.id,
    )
    .map((trigger) => ({
      type: 'trigger',
      triggerUuid: trigger.uuid,
      integrationName: integration.name,
      projectId: trigger.projectId,
      commitId: trigger.commitId,
      documentUuid: trigger.documentUuid,
    }))

  const toolIntegrationsScope = new DocumentIntegrationReferencesRepository(
    workspaceId,
    db,
  )
  const documentTools = await toolIntegrationsScope.getAllActive()

  const toolReferences: IntegrationReference[] = documentTools
    .filter((documentTool) => documentTool.integrationId === integration.id)
    .map((documentTool) => ({
      type: 'tool',
      integrationName: integration.name,
      projectId: documentTool.projectId,
      commitId: documentTool.commitId,
      documentUuid: documentTool.documentUuid,
    }))

  return Result.ok([...triggerReferences, ...toolReferences])
}
