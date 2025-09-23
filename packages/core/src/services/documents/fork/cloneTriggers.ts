import { DocumentTriggerType } from '@latitude-data/constants'
import {
  Commit,
  DocumentTrigger,
  DocumentVersion,
  Project,
  Workspace,
} from '../../../browser'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import {
  DocumentTriggerConfiguration,
  EmailTriggerConfiguration,
  IntegrationTriggerConfiguration,
} from '@latitude-data/constants/documentTriggers'
import { createDocumentTrigger } from '../../documentTriggers/create'
import { IntegrationMapping } from './types'

function copyTriggerConfiguration<T extends DocumentTriggerType>(
  originalTrigger: DocumentTrigger<T>,
  integrationMapping: IntegrationMapping,
): DocumentTriggerConfiguration<T> {
  if (originalTrigger.triggerType === DocumentTriggerType.Integration) {
    // Use mapped integration, and ignore the properties for privacy
    const originalTriggerConfiguration =
      originalTrigger.configuration as IntegrationTriggerConfiguration

    const newIntegration =
      integrationMapping.id[originalTriggerConfiguration.integrationId]

    return {
      componentId: originalTriggerConfiguration.componentId,
      payloadParameters: originalTriggerConfiguration.payloadParameters,
      integrationId: newIntegration.id,
      properties: {}, // Empty properties
    } as DocumentTriggerConfiguration<T>
  }

  if (originalTrigger.triggerType === DocumentTriggerType.Email) {
    const originalTriggerConfiguration =
      originalTrigger.configuration as EmailTriggerConfiguration

    return {
      replyWithResponse: originalTriggerConfiguration.replyWithResponse,
      name: originalTriggerConfiguration.name,
      parameters: originalTriggerConfiguration.parameters,
      emailWhitelist: undefined, // Empty whitelist
      domainWhitelist: undefined,
    } as DocumentTriggerConfiguration<T>
  }

  // For others, all config is safe to copy
  return originalTrigger.configuration
}

export async function cloneDocumentTriggers({
  workspace,
  project,
  commit,
  document,
  triggers,
  integrationMapping,
}: {
  workspace: Workspace
  project: Project
  commit: Commit
  document: DocumentVersion
  triggers: DocumentTrigger[]
  integrationMapping: IntegrationMapping
}): PromisedResult<DocumentTrigger[]> {
  const newTriggers: DocumentTrigger[] = []

  for (const trigger of triggers) {
    const createTriggerResult = await createDocumentTrigger({
      workspace,
      project,
      commit,
      document,
      triggerType: trigger.triggerType,
      configuration: copyTriggerConfiguration(trigger, integrationMapping),
      skipDeployment: true,
    })

    if (!Result.isOk(createTriggerResult)) {
      return createTriggerResult
    }

    newTriggers.push(createTriggerResult.unwrap())
  }

  return Result.ok(newTriggers)
}
