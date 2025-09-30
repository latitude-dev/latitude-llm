import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { Workspace } from '../../../schema/types'
import { Result } from '../../../lib/Result'
import { DocumentTriggersRepository } from '../../../repositories/documentTriggersRepository'
import { IntegrationsRepository } from '../../../repositories/integrationsRepository'
import {
  DocumentTriggerStatus,
  DocumentTriggerType,
  IntegrationType,
} from '@latitude-data/constants'
import { database } from '../../../client'

export async function checkNextStepNecessary(
  {
    currentStep,
    workspace,
  }: {
    currentStep: OnboardingStepKey
    workspace: Workspace
  },
  db = database,
) {
  if (currentStep === OnboardingStepKey.SetupIntegrations) {
    const integrationsScope = new IntegrationsRepository(workspace.id, db)
    const integrationsResult = await integrationsScope.findAll()
    if (!Result.isOk(integrationsResult)) {
      return integrationsResult
    }
    const integrations = integrationsResult.unwrap()
    // Hosted MCPs are not supported anymore and don't need configuration
    const configurableIntegrations = integrations.filter(
      (integration) =>
        integration.type === IntegrationType.Pipedream ||
        integration.type === IntegrationType.ExternalMCP,
    )
    if (configurableIntegrations.length === 0) {
      return Result.ok(false)
    }
    return Result.ok(true)
  }

  if (currentStep === OnboardingStepKey.ConfigureTriggers) {
    const documentTriggersScope = new DocumentTriggersRepository(
      workspace.id,
      db,
    )
    const documentTriggersResult = await documentTriggersScope.findAll()
    if (!Result.isOk(documentTriggersResult)) {
      return documentTriggersResult
    }
    const documentTriggers = documentTriggersResult.unwrap()
    // For now, only pipedream integrations have triggers
    const pendingIntegrationTriggers = documentTriggers.filter(
      (trigger) =>
        trigger.triggerType === DocumentTriggerType.Integration &&
        trigger.triggerStatus === DocumentTriggerStatus.Pending,
    )
    if (pendingIntegrationTriggers.length === 0) {
      return Result.ok(false)
    }
    return Result.ok(true)
  }

  // We assume there will always be a trigger in an agent, so step 3 and 4 will always be necessary
  return Result.ok(true)
}
