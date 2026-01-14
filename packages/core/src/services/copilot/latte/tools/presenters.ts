import type { ConversationMetadata as PromptlMetadata } from 'promptl-ai'
import { type Commit } from '../../../../schema/models/types/Commit'
import { type DocumentTrigger } from '../../../../schema/models/types/DocumentTrigger'
import { type DocumentVersion } from '../../../../schema/models/types/DocumentVersion'
import { type Project } from '../../../../schema/models/types/Project'
import { type ProviderApiKey } from '../../../../schema/models/types/ProviderApiKey'
import { IntegrationDto } from '../../../../schema/models/types/Integration'
import { listModelsForProvider } from '../../../ai/providers/models'
import { DocumentTriggerType, IntegrationType } from '@latitude-data/constants'
import { PromisedResult } from '../../../../lib/Transaction'
import { IntegrationsRepository } from '../../../../repositories'
import { Result } from '../../../../lib/Result'
import { env } from '@latitude-data/env'
import { IntegrationTriggerConfiguration } from '@latitude-data/constants/documentTriggers'

export function projectPresenter(project: Project) {
  return {
    id: project.id,
    name: project.name,
    href: `/projects/${project.id}`,
  }
}

export function versionPresenter(commit: Commit) {
  return {
    uuid: commit.uuid,
    title: commit.title,
    isMerged: !!commit.mergedAt,
  }
}

export async function promptPresenter({
  document,
  projectId,
  versionUuid,
  metadata,
  triggers,
  workspaceId,
}: {
  document: DocumentVersion
  projectId: number
  versionUuid: string
  metadata?: PromptlMetadata
  triggers: DocumentTrigger[]
  workspaceId: number
}) {
  if (document.deletedAt) {
    return {
      uuid: document.documentUuid,
      deleted: true,
    }
  }

  const documentTriggerNames = await triggerDocumentPresenter({
    triggers,
    workspaceId,
  })

  if (!documentTriggerNames.ok) {
    return Result.error(documentTriggerNames.error!)
  }

  const documentTriggerNamesUnwrapped = documentTriggerNames.unwrap()

  const errors = metadata?.errors?.length ? { errors: metadata.errors } : {}

  return {
    uuid: document.documentUuid,
    path: document.path,
    isAgent: document.documentType === 'agent',
    href: `/projects/${projectId}/versions/${versionUuid}/documents/${document.documentUuid}`,
    triggers: documentTriggerNamesUnwrapped,
    ...errors,
  }
}

export function providerPresenter(provider: ProviderApiKey) {
  return {
    name: provider.name,
    type: provider.provider,
    models: Object.values(
      listModelsForProvider({
        provider: provider.provider,
        name: provider.name,
        defaultProviderName: env.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
      }),
    ).map((m) => m.id),
    defaultModel: provider.defaultModel,
  }
}

export function integrationPresenter(integration: IntegrationDto) {
  if (integration.type === IntegrationType.Pipedream) {
    return {
      id: integration.id,
      appNickname: integration.name,
      appName: integration.configuration.appName,
      hasTools: integration.hasTools,
      hasTriggers: integration.hasTriggers,
    }
  }

  if (integration.type === IntegrationType.Latitude) {
    return {
      appNickname: integration.name,
      appName: integration.type,
      hasTools: integration.hasTools,
      hasTriggers: integration.hasTriggers,
    }
  }

  return {
    name: integration.name,
    type: integration.type,
    hasTools: integration.hasTools,
    hasTriggers: integration.hasTriggers,
    configuration: integration.configuration,
  }
}

/*
 * This function is used to present the document triggers in a way that is easy to understand for Latte.
 *  We return the integration name for the integration trigger and the trigger type for the other triggers.
 */
async function triggerDocumentPresenter({
  triggers,
  workspaceId,
}: {
  triggers: DocumentTrigger[]
  workspaceId: number
}): PromisedResult<string[]> {
  const documentTriggerNames: string[] = []
  const integrationScope = new IntegrationsRepository(workspaceId)

  for (const trigger of triggers) {
    switch (trigger.triggerType) {
      case DocumentTriggerType.Email:
        documentTriggerNames.push(DocumentTriggerType.Email)
        break

      case DocumentTriggerType.Scheduled:
        documentTriggerNames.push(DocumentTriggerType.Scheduled)
        break

      case DocumentTriggerType.Integration: {
        const integration = await integrationScope.find(
          (trigger.configuration as IntegrationTriggerConfiguration)
            .integrationId,
        )
        if (!integration.ok) {
          return Result.error(integration.error!)
        }
        documentTriggerNames.push(integration.unwrap().name)
        break
      }
    }
  }

  return Result.ok(documentTriggerNames)
}
