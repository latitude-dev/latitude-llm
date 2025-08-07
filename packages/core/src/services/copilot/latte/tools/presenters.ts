import type { ConversationMetadata as PromptlMetadata } from 'promptl-ai'
import {
  type Commit,
  type DocumentTrigger,
  type DocumentVersion,
  type IntegrationDto,
  listModelsForProvider,
  type Project,
  type ProviderApiKey,
} from '../../../../browser'
import { DocumentTriggerType, IntegrationType } from '@latitude-data/constants'
import type { PromisedResult } from '../../../../lib/Transaction'
import { IntegrationsRepository } from '../../../../repositories'
import { Result } from '../../../../lib/Result'
import { env } from '@latitude-data/env'

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
    ),
    defaultModel: provider.defaultModel,
  }
}

export function integrationPresenter(integration: IntegrationDto) {
  if (integration.type === IntegrationType.HostedMCP) {
    return {
      name: integration.name,
      type: integration.configuration.type,
      hasTools: integration.hasTools,
      hasTriggers: integration.hasTriggers,
    }
  }

  if (integration.type === IntegrationType.Pipedream) {
    return {
      id: integration.id,
      name: integration.name,
      type: integration.configuration.appName,
      hasTools: integration.hasTools,
      hasTriggers: integration.hasTriggers,
    }
  }

  if (integration.type === IntegrationType.Latitude) {
    return {
      name: integration.name,
      type: integration.type,
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

async function triggerDocumentPresenter({
  triggers,
  workspaceId,
}: {
  triggers: DocumentTrigger[]
  workspaceId: number
}): PromisedResult<string[]> {
  const documentTriggerNames: string[] = []

  if (triggers.some((trigger) => trigger.triggerType === DocumentTriggerType.Email)) {
    documentTriggerNames.push(DocumentTriggerType.Email)
  }

  if (triggers.some((trigger) => trigger.triggerType === DocumentTriggerType.Scheduled)) {
    documentTriggerNames.push(DocumentTriggerType.Scheduled)
  }
  const integrationTriggers = triggers.filter(
    (trigger) => trigger.triggerType === DocumentTriggerType.Integration,
  ) as DocumentTrigger<DocumentTriggerType.Integration>[]

  const integrationScope = new IntegrationsRepository(workspaceId)
  for (const trigger of integrationTriggers) {
    const integration = await integrationScope.find(trigger.configuration.integrationId)
    if (!integration.ok) {
      return Result.error(integration.error!)
    }
    documentTriggerNames.push(integration.unwrap().name)
  }

  return Result.ok(documentTriggerNames)
}
