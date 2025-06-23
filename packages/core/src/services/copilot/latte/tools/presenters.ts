import type { ConversationMetadata as LegacyMetadata } from '@latitude-data/compiler'
import type { ConversationMetadata as PromptlMetadata } from 'promptl-ai'
import {
  Commit,
  DocumentVersion,
  IntegrationDto,
  Project,
  ProviderApiKey,
} from '../../../../browser'
import { IntegrationType } from '@latitude-data/constants'

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

export function promptPresenter({
  document,
  projectId,
  versionUuid,
  metadata,
}: {
  document: DocumentVersion
  projectId: number
  versionUuid: string
  metadata?: LegacyMetadata | PromptlMetadata
}) {
  if (document.deletedAt) {
    return {
      uuid: document.documentUuid,
      deleted: true,
    }
  }

  const errors = metadata?.errors?.length ? { errors: metadata.errors } : {}

  return {
    uuid: document.documentUuid,
    path: document.path,
    isAgent: document.documentType === 'agent',
    href: `/projects/${projectId}/versions/${versionUuid}/documents/${document.documentUuid}`,
    ...errors,
  }
}

export function providerPresenter(provider: ProviderApiKey) {
  return {
    name: provider.name,
    type: provider.provider,
  }
}

export function integrationPresenter(integration: IntegrationDto) {
  if (integration.type === IntegrationType.HostedMCP) {
    return {
      name: integration.name,
      type: integration.configuration.type,
    }
  }

  if (integration.type === IntegrationType.Pipedream) {
    return {
      name: integration.name,
      type: integration.configuration.appName,
    }
  }

  if (integration.type === IntegrationType.Latitude) {
    return {
      name: integration.name,
      type: integration.type,
    }
  }

  return {
    name: integration.name,
    type: integration.type,
    configuration: integration.configuration,
  }
}
