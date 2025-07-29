import {
  DocumentTriggerType,
  DocumentVersion,
  IntegrationType,
} from '@latitude-data/constants'
import { DocumentTrigger, Project, Workspace } from '../../browser'
import { BadRequestError, LatitudeError } from '../../lib/errors'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { IntegrationsRepository } from '../../repositories'
import { documentTriggers } from '../../schema'
import { deployPipedreamTrigger } from '../integrations/pipedream/triggers'
import { buildConfiguration } from './helpers/buildConfiguration'
import {
  DocumentTriggerConfiguration,
  InsertDocumentTriggerWithConfiguration,
  IntegrationTriggerConfiguration,
} from '@latitude-data/constants/documentTriggers'
import { database } from '../../client'

async function completeIntegrationTriggerConfig(
  {
    workspace,
    triggerUuid,
    configuration,
  }: {
    workspace: Workspace
    triggerUuid: string
    configuration: Omit<IntegrationTriggerConfiguration, 'triggerId'>
  },
  db = database,
): PromisedResult<IntegrationTriggerConfiguration> {
  const integrationsScope = new IntegrationsRepository(workspace.id, db)
  const integrationResult = await integrationsScope.find(
    configuration.integrationId,
  )

  if (!Result.isOk(integrationResult)) return integrationResult

  const integration = integrationResult.unwrap()

  if (integration.type !== IntegrationType.Pipedream) {
    throw new BadRequestError(
      `Integration type ${integration.type} is not supported for document triggers`,
    )
  }

  const deployResult = await deployPipedreamTrigger({
    triggerUuid,
    integration,
    componentId: { key: configuration.componentId },
    configuredProps: configuration.properties ?? {},
  })
  if (!Result.isOk(deployResult)) {
    return Result.error(deployResult.error)
  }

  const { id: deployedTriggerId } = deployResult.unwrap()

  return Result.ok({
    ...configuration,
    triggerId: deployedTriggerId,
  })
}

export async function createDocumentTrigger(
  {
    workspace,
    document,
    project,
    triggerType,
    configuration,
  }: {
    workspace: Workspace
    document: DocumentVersion
    project: Project
  } & InsertDocumentTriggerWithConfiguration,
  transaction = new Transaction(),
): PromisedResult<DocumentTrigger> {
  return await transaction.call(async (tx) => {
    const triggerUuid = generateUUIDIdentifier()
    const documentTriggerConfiguration = await getFullConfiguration({
      workspace,
      triggerUuid,
      triggerType,
      configuration,
    })

    if (!Result.isOk(documentTriggerConfiguration)) {
      return documentTriggerConfiguration
    }

    const result = await tx
      .insert(documentTriggers)
      .values({
        uuid: triggerUuid,
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        projectId: project.id,
        triggerType,
        configuration: documentTriggerConfiguration.unwrap(),
      })
      .returning()

    if (!result.length) {
      return Result.error(
        new LatitudeError('Failed to create document trigger'),
      )
    }

    return Result.ok(result[0]! as DocumentTrigger)
  })
}

export async function getFullConfiguration({
  workspace,
  triggerUuid,
  triggerType,
  configuration,
}: {
  workspace: Workspace
  triggerUuid: string
  triggerType: DocumentTriggerType
  configuration: InsertDocumentTriggerWithConfiguration['configuration']
}): PromisedResult<DocumentTriggerConfiguration> {
  if (triggerType === DocumentTriggerType.Integration) {
    return completeIntegrationTriggerConfig({
      workspace: workspace,
      triggerUuid: triggerUuid,
      configuration: configuration as IntegrationTriggerConfiguration,
    })
  }
  return Result.ok(buildConfiguration({ triggerType, configuration }))
}
