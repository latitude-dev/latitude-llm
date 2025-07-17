import {
  DocumentTriggerType,
  DocumentVersion,
  IntegrationType,
} from '@latitude-data/constants'
import { DocumentTrigger, Project, Workspace } from '../../browser'
import { database } from '../../client'
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
} from './helpers/schema'

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

  if (!Result.isOk(integrationResult)) {
    return Result.error(integrationResult.error)
  }
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
  db = database,
): PromisedResult<DocumentTrigger> {
  return await Transaction.call(async (tx) => {
    const triggerUuid = generateUUIDIdentifier()

    if (triggerType === DocumentTriggerType.Integration) {
      configuration = await completeIntegrationTriggerConfig(
        {
          workspace,
          triggerUuid,
          configuration: configuration as IntegrationTriggerConfiguration,
        },
        tx,
      ).then((r) => r.unwrap())
    }

    const result = await tx
      .insert(documentTriggers)
      .values({
        uuid: triggerUuid,
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        projectId: project.id,
        triggerType,
        configuration: buildConfiguration({
          triggerType,
          configuration: configuration as DocumentTriggerConfiguration,
        }),
      })
      .returning()

    if (!result.length) {
      return Result.error(
        new LatitudeError('Failed to create document trigger'),
      )
    }

    return Result.ok(result[0]! as DocumentTrigger)
  }, db)
}
