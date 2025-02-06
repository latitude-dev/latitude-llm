import { omit } from 'lodash-es'

import { Message } from '@latitude-data/compiler'
import {
  Commit,
  DocumentVersion,
  Project,
  type Workspace,
} from '@latitude-data/core/browser'
import { findFirstUserInWorkspace } from '@latitude-data/core/data-access'
import { publisher } from '@latitude-data/core/events/publisher'
import { BadRequestError } from '@latitude-data/core/lib/errors'
import { Result } from '@latitude-data/core/lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
} from '@latitude-data/core/repositories'
import { Config } from '@latitude-data/core/services/ai/helpers'
import {
  ChainCallResponseDto,
  ChainEventDto,
  LegacyChainEvent,
  LegacyChainEventTypes,
  LegacyLatitudeEventData,
  StreamEventTypes,
} from '@latitude-data/constants'

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
  const projectsScope = new ProjectsRepository(workspace.id)
  const commitsScope = new CommitsRepository(workspace.id)
  const docsScope = new DocumentVersionsRepository(workspace.id)

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

  const documentResult = await docsScope.getDocumentByPath({
    commit,
    path: documentPath,
  })
  if (documentResult.error) return documentResult
  const document = documentResult.value

  return Result.ok({ project, commit, document })
}

export function chainEventPresenter(event: LegacyChainEvent) {
  switch (event.event) {
    case StreamEventTypes.Provider:
      return event.data
    case StreamEventTypes.Latitude:
      return latitudeEventPresenter(event)
  }
}

function latitudeEventPresenter(event: {
  data: LegacyLatitudeEventData
  event: StreamEventTypes.Latitude
}): ChainEventDto | string {
  switch (event.data.type) {
    case LegacyChainEventTypes.Step:
    case LegacyChainEventTypes.StepComplete:
      return {
        ...omit(event.data, 'documentLogUuid'),
        uuid: event.data.documentLogUuid!,
      } as {
        type: LegacyChainEventTypes.Step
        config: Config
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
  if (user) {
    publisher.publishLater({
      type: 'documentRunRequested',
      data: {
        parameters,
        projectId: project.id,
        commitUuid: commit.uuid,
        documentPath: document.path,
        workspaceId: workspace.id,
        userEmail: user.email,
      },
    })
  }
}
