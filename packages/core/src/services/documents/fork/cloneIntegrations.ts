import { IntegrationType } from '@latitude-data/constants'
import { type User } from '../../../schema/models/types/User'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { IntegrationDto } from '../../../schema/models/types/Integration'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { findAllIntegrations } from '../../../queries/integrations/findAll'
import {
  PipedreamIntegrationConfiguration,
  UnconfiguredPipedreamIntegrationConfiguration,
} from '../../integrations/helpers/schema'
import { createIntegration } from '../../integrations'
import { IntegrationMapping } from './types'

function isMatching(a: IntegrationDto, b: IntegrationDto): boolean {
  if (a.type !== b.type) return false
  if (a.type !== IntegrationType.Pipedream) return true
  const aApp = (a.configuration as PipedreamIntegrationConfiguration).appName
  const bApp = (b.configuration as PipedreamIntegrationConfiguration).appName
  return aApp === bApp
}

function neutralNameForIntegration(integration: IntegrationDto): string {
  if (integration.type === IntegrationType.Pipedream) {
    return (integration.configuration as PipedreamIntegrationConfiguration)
      .appName
  }

  return integration.name
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
    name: neutralNameForIntegration(originIntegration),
  })

  const newIntegrationResult = await createIntegration({
    workspace: targetWorkspace,
    name: newIntegrationName,
    type: originIntegration.type,
    configuration: copyIntegrationConfiguration(originIntegration)!,
    author: targetUser,
  })

  if (!newIntegrationResult.ok) {
    return Result.error(newIntegrationResult.error!)
  }

  return Result.ok(newIntegrationResult.value!.integration)
}

/**
 * Given a list of integrations from the origin workspace, finds the ID from matching integrations
 * in the target workspace or creates new ones if they don't exist.
 */
export async function cloneIntegrations({
  originIntegrations,
  targetWorkspace,
  targetUser,
}: {
  originIntegrations: IntegrationDto[]
  targetWorkspace: Workspace
  targetUser: User
}): PromisedResult<IntegrationMapping> {
  const targetIntegrations = await findAllIntegrations({
    workspaceId: targetWorkspace.id,
  })

  const integrationMapping: IntegrationMapping = {
    name: {},
    id: {},
  }
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

    integrationMapping.name[originIntegration.name] = matchingIntegration
    integrationMapping.id[originIntegration.id] = matchingIntegration
  }

  return Result.ok(integrationMapping)
}
