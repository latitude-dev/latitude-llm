import { DocumentTriggerType, IntegrationType } from '@latitude-data/constants'
import {
  Commit,
  DocumentTrigger,
  DocumentVersion,
  IntegrationDto,
  Project,
  User,
  Workspace,
} from '../../../browser'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import {
  DocumentTriggersRepository,
  IntegrationsRepository,
} from '../../../repositories'
import {
  DocumentTriggerConfiguration,
  EmailTriggerConfiguration,
  IntegrationTriggerConfiguration,
} from '@latitude-data/constants/documentTriggers'
import {
  PipedreamIntegrationConfiguration,
  UnconfiguredPipedreamIntegrationConfiguration,
} from '../../integrations/helpers/schema'
import { createIntegration } from '../../integrations'
import { createDocumentTrigger } from '../../documentTriggers/create'

function isMatching(a: IntegrationDto, b: IntegrationDto): boolean {
  if (a.type !== b.type) return false
  if (a.type !== IntegrationType.Pipedream) return true
  const aApp = (a.configuration as PipedreamIntegrationConfiguration).appName
  const bApp = (b.configuration as PipedreamIntegrationConfiguration).appName
  return aApp === bApp
}

function generateNewIntegrationName({
  existingNames,
  name,
}: {
  existingNames: string[]
  name: string
}): string {
  let newName = name
  let i = 1
  while (existingNames.includes(newName)) {
    newName = `${name}_${i}`
    i++
  }
  return newName
}

function copyIntegrationConfiguration(
  integration: IntegrationDto,
): IntegrationDto['configuration'] {
  if (integration.type === IntegrationType.Pipedream) {
    const pipedreamConfig =
      integration.configuration as UnconfiguredPipedreamIntegrationConfiguration
    return {
      appName: pipedreamConfig.appName,
      metadata: pipedreamConfig.metadata,
    } as UnconfiguredPipedreamIntegrationConfiguration
  }

  return integration.configuration
}

function copyTriggerConfiguration<T extends DocumentTriggerType>(
  trigger: DocumentTrigger<T>,
  matchingIntegrationsMap: Record<number, number>,
): DocumentTriggerConfiguration<T> {
  if (trigger.triggerType === DocumentTriggerType.Integration) {
    // Use mapped integration, and ignore the properties for privacy
    const originalTriggerConfiguration =
      trigger.configuration as IntegrationTriggerConfiguration
    const integrationId =
      matchingIntegrationsMap[originalTriggerConfiguration.integrationId]
    return {
      componentId: originalTriggerConfiguration.componentId,
      payloadParameters: originalTriggerConfiguration.payloadParameters,
      integrationId,
      properties: {}, // Empty properties
    } as DocumentTriggerConfiguration<T>
  }

  if (trigger.triggerType === DocumentTriggerType.Email) {
    const originalTriggerConfiguration =
      trigger.configuration as EmailTriggerConfiguration
    return {
      replyWithResponse: originalTriggerConfiguration.replyWithResponse,
      name: originalTriggerConfiguration.name,
      parameters: originalTriggerConfiguration.parameters,
      emailWhitelist: undefined, // Empty whitelist
      domainWhitelist: undefined,
    } as DocumentTriggerConfiguration<T>
  }

  // For others, all config is safe to copy
  return trigger.configuration
}

async function findMatchingIntegration({
  originIntegration,
  targetIntegrations,
  targetWorkspace,
  targetUser,
}: {
  originIntegration: IntegrationDto
  targetIntegrations: IntegrationDto[]
  targetWorkspace: Workspace
  targetUser: User
}): PromisedResult<IntegrationDto> {
  // First, find if there is an integration with the same name and type
  const sameNameAndType = targetIntegrations.find((targetIntegration) => {
    return (
      targetIntegration.name === originIntegration.name &&
      isMatching(originIntegration, targetIntegration)
    )
  })
  if (sameNameAndType) return Result.ok(sameNameAndType)

  // If not, find any matching integration
  const sameType = targetIntegrations.find((targetIntegration) => {
    return isMatching(originIntegration, targetIntegration)
  })
  if (sameType) return Result.ok(sameType)

  // If not, create a new integration
  const newIntegrationName = generateNewIntegrationName({
    existingNames: targetIntegrations.map((i) => i.name),
    name: originIntegration.name,
  })

  const newIntegrationResult = await createIntegration({
    workspace: targetWorkspace,
    name: newIntegrationName,
    type: originIntegration.type,
    configuration: copyIntegrationConfiguration(originIntegration)!,
    author: targetUser,
  })
  return newIntegrationResult
}

/**
 * Given a list of integrations from the origin workspace, finds the ID from matching integrations
 * in the target workspace or creates new ones if they don't exist.
 */
async function mapMatchingIntegrationIds({
  originIntegrations,
  targetWorkspace,
  targetUser,
}: {
  originIntegrations: IntegrationDto[]
  targetWorkspace: Workspace
  targetUser: User
}): PromisedResult<Record<number, number>> {
  const targetIntegrationsRepo = new IntegrationsRepository(targetWorkspace.id)
  const targetIntegrationsResult = await targetIntegrationsRepo.findAll()
  if (!Result.isOk(targetIntegrationsResult)) return targetIntegrationsResult
  const targetIntegrations = targetIntegrationsResult.unwrap()

  const integrationIds: Record<number, number> = {}
  for (const originIntegration of originIntegrations) {
    const matchingIntegrationResult = await findMatchingIntegration({
      originIntegration,
      targetIntegrations,
      targetWorkspace,
      targetUser,
    })

    if (!Result.isOk(matchingIntegrationResult)) {
      return matchingIntegrationResult
    }

    const matchingIntegration = matchingIntegrationResult.unwrap()

    // add integration to array if it has been recently created
    if (!targetIntegrations.some((i) => i.id === matchingIntegration.id)) {
      targetIntegrations.push(matchingIntegration)
    }

    integrationIds[originIntegration.id] = matchingIntegration.id
  }

  return Result.ok(integrationIds)
}

export async function cloneDocumentTriggers({
  originWorkspace,
  originCommit,
  originDocument,
  targetWorkspace,
  targetProject,
  targetCommit,
  targetDocument,
  targetUser,
}: {
  originWorkspace: Workspace
  originCommit: Commit
  originDocument: DocumentVersion
  targetWorkspace: Workspace
  targetProject: Project
  targetCommit: Commit
  targetDocument: DocumentVersion
  targetUser: User
}): PromisedResult<DocumentTrigger[]> {
  const originIntegrationsRepo = new IntegrationsRepository(originWorkspace.id)
  const originIntegrationsResult = await originIntegrationsRepo.findAll()
  if (!Result.isOk(originIntegrationsResult)) return originIntegrationsResult
  const originIntegrations = originIntegrationsResult.unwrap()

  const originTriggersRepo = new DocumentTriggersRepository(originWorkspace.id)
  const originTriggersResult = await originTriggersRepo.getTriggersInDocument({
    documentUuid: originDocument.documentUuid,
    commit: originCommit,
  })
  if (!Result.isOk(originTriggersResult)) return originTriggersResult
  const originTriggers = originTriggersResult.unwrap()

  // All integrations that are being used in at least one trigger from the origin document
  const integrationsToImport = originIntegrations.filter((integration) =>
    originTriggers.some((trigger) => {
      if (trigger.triggerType !== DocumentTriggerType.Integration) return false
      const configuration =
        trigger.configuration as IntegrationTriggerConfiguration
      if (configuration.integrationId === integration.id) return true
      return false
    }),
  )

  const matchingIntegrationsMapResult = await mapMatchingIntegrationIds({
    originIntegrations: integrationsToImport,
    targetWorkspace,
    targetUser,
  })
  if (!Result.isOk(matchingIntegrationsMapResult)) {
    return matchingIntegrationsMapResult
  }
  const matchingIntegrationsMap = matchingIntegrationsMapResult.unwrap()

  const newTriggers: DocumentTrigger[] = []

  for (const trigger of originTriggers) {
    const createTriggerResult = await createDocumentTrigger({
      workspace: targetWorkspace,
      project: targetProject,
      commit: targetCommit,
      document: targetDocument,
      triggerType: trigger.triggerType,
      configuration: copyTriggerConfiguration(trigger, matchingIntegrationsMap),
    })

    if (!Result.isOk(createTriggerResult)) {
      return createTriggerResult
    }

    newTriggers.push(createTriggerResult.unwrap())
  }

  return Result.ok(newTriggers)
}
