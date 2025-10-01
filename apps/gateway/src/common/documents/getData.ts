import { omit } from 'lodash-es'

import { Message } from '@latitude-data/constants/legacyCompiler'
import {
  Commit,
  DocumentVersion,
  Project,
  type Workspace,
} from '@latitude-data/core/browser'
import { findFirstUserInWorkspace } from '@latitude-data/core/data-access'
import { publisher } from '@latitude-data/core/events/publisher'
import { BadRequestError } from '@latitude-data/constants/errors'
import { Result } from '@latitude-data/core/lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
  ProviderApiKeysRepository,
} from '@latitude-data/core/repositories'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import {
  ChainCallResponseDto,
  LegacyChainEvent,
  LegacyChainEventTypes,
  LegacyEventData,
  LegacyLatitudeEventData,
  Providers,
  StreamEventTypes,
} from '@latitude-data/constants'
import { getDocumentMetadata } from '@latitude-data/core/services/documents/scan'
import { documentPresenterWithProviderAndMetadata } from '$/presenters/documentPresenter'

async function getProjectByVersionData({
  workspace,
  projectId,
  commitUuid,
}: {
  workspace: Workspace
  projectId: number
  commitUuid: string
}) {
  const projectsScope = new ProjectsRepository(workspace.id)
  const commitsScope = new CommitsRepository(workspace.id)

  const pid = Number(projectId)
  if (isNaN(pid)) {
    return Result.error(new BadRequestError(`Invalid project id ${projectId}`))
  }

  const projectResult = await projectsScope.getProjectById(pid)
  if (projectResult.error) return projectResult
  const project = projectResult.value

  const commitResult = await commitsScope.getCommitByUuid({
    projectId: project.id,
    uuid: commitUuid,
  })
  if (commitResult.error) return commitResult
  const commit = commitResult.value
  return Result.ok({ project, commit })
}

export async function getAllDocumentsAtCommitWithMetadata({
  workspace,
  projectId,
  commitUuid,
}: {
  workspace: Workspace
  projectId: number
  commitUuid: string
}) {
  const projectResult = await getProjectByVersionData({
    workspace,
    projectId,
    commitUuid,
  })

  if (projectResult.error) return projectResult

  const { commit } = projectResult.value
  const docsScope = new DocumentVersionsRepository(workspace.id)

  const docsResult = await docsScope.getDocumentsAtCommit(commit)
  if (docsResult.error) return docsResult

  const docs = docsResult.value
  const docsWithMetadata = await Promise.all(
    docs.map(async (document) => {
      const metadata = await getDocumentMetadata({
        document,
        getDocumentByPath: async (path) => docs.find((d) => d.path === path),
      })
      return {
        document,
        metadata,
      }
    }),
  )

  const providerNames = docsWithMetadata
    .map((d) => d.metadata?.config?.provider as string)
    .filter((providerName) => !!providerName)
  const providersScope = new ProviderApiKeysRepository(workspace.id)
  const allUsedProviders = await providersScope.findAllByNames(providerNames)
  const llmProviders = allUsedProviders.reduce(
    (acc, provider) => {
      acc[provider.name] = provider.provider
      return acc
    },
    {} as Record<string, Providers>,
  )

  return Result.ok(
    docs.map((document) => {
      const doc = docsWithMetadata.find(
        (d) => d.document.documentUuid === document.documentUuid,
      )
      const provider = doc?.metadata?.config?.provider
      return documentPresenterWithProviderAndMetadata({
        document,
        metadata: doc?.metadata,
        provider: llmProviders[provider as string],
        commit,
      })
    }),
  )
}

export const getData = async ({
  workspace,
  projectId,
  commitUuid,
  documentPath,
}: {
  workspace: Workspace
  projectId: number
  commitUuid: string
  documentPath: string
}) => {
  const projectResult = await getProjectByVersionData({
    workspace,
    projectId,
    commitUuid,
  })

  if (projectResult.error) return projectResult

  const { project, commit } = projectResult.value
  const docsScope = new DocumentVersionsRepository(workspace.id)
  const documentResult = await docsScope.getDocumentByPath({
    commit,
    path: documentPath,
  })
  if (documentResult.error) return documentResult
  const document = documentResult.value

  return Result.ok({ project, commit, document })
}

export function legacyChainEventPresenter(event: LegacyChainEvent) {
  switch (event.event) {
    case StreamEventTypes.Provider:
      return event.data
    case StreamEventTypes.Latitude:
      return latitudeLegacyEventPresenter(
        event as {
          data: LegacyLatitudeEventData
          event: StreamEventTypes.Latitude
        },
      )
    default:
      throw new BadRequestError(
        `Unknown event type in chainEventPresenter ${JSON.stringify(event)}`,
      )
  }
}

function latitudeLegacyEventPresenter(event: {
  data: LegacyLatitudeEventData
  event: StreamEventTypes.Latitude
}): LegacyEventData {
  switch (event.data.type) {
    case LegacyChainEventTypes.Step:
    case LegacyChainEventTypes.StepComplete:
      return {
        ...omit(event.data, 'documentLogUuid'),
        uuid: event.data.documentLogUuid!,
      } as {
        type: LegacyChainEventTypes.Step
        config: LatitudePromptConfig
        isLastStep: boolean
        messages: Message[]
        uuid?: string
      }
    case LegacyChainEventTypes.Complete:
      return {
        ...omit(event.data, 'documentLogUuid'),
        uuid: event.data.response.documentLogUuid!,
        response: omit(
          event.data.response,
          'providerLog',
          'documentLogUuid',
        ) as ChainCallResponseDto,
      }
    case LegacyChainEventTypes.Error:
      return {
        type: LegacyChainEventTypes.Error,
        error: {
          name: event.data.error.name,
          message: event.data.error.message,
          stack: event.data.error.stack,
        },
      }
    default:
      throw new BadRequestError(
        `Unknown event type in chainEventPresenter ${JSON.stringify(event)}`,
      )
  }
}

export async function publishDocumentRunRequestedEvent({
  workspace,
  project,
  commit,
  document,
  parameters,
}: {
  workspace: Workspace
  project: Project
  commit: Commit
  document: DocumentVersion
  parameters: Record<string, any>
}) {
  const user = await findFirstUserInWorkspace(workspace)

  const commitsScope = new CommitsRepository(workspace.id)
  const headCommit = await commitsScope
    .getHeadCommit(project.id)
    .then((r) => r.unwrap())

  if (user) {
    publisher.publishLater({
      type: 'documentRunRequested',
      data: {
        parameters,
        projectId: project.id,
        commitUuid: commit.uuid,
        isLiveCommit: headCommit.uuid === commit.uuid,
        documentPath: document.path,
        workspaceId: workspace.id,
        userEmail: user.email,
      },
    })
  }
}
