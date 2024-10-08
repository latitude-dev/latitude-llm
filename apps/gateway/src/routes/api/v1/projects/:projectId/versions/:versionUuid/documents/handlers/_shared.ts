import { omit } from 'lodash-es'

import { Message } from '@latitude-data/compiler'
import {
  ChainEventDto,
  ChainEventTypes,
  LatitudeEventData,
  StreamEventTypes,
  type ChainEvent,
  type Workspace,
} from '@latitude-data/core/browser'
import { BadRequestError } from '@latitude-data/core/lib/errors'
import { Result } from '@latitude-data/core/lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
} from '@latitude-data/core/repositories'
import { Config } from '@latitude-data/core/services/ai/helpers'

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

  const projectResult = await projectsScope.getProjectById(projectId)
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

export function chainEventPresenter(event: ChainEvent) {
  switch (event.event) {
    case StreamEventTypes.Provider:
      return event.data
    case StreamEventTypes.Latitude:
      return latitudeEventPresenter(event)
  }
}

function latitudeEventPresenter(event: {
  data: LatitudeEventData
  event: StreamEventTypes.Latitude
}): ChainEventDto | string {
  switch (event.data.type) {
    case ChainEventTypes.Step:
    case ChainEventTypes.StepComplete:
      return {
        ...omit(event.data, 'documentLogUuid'),
        uuid: event.data.documentLogUuid!,
      } as {
        type: ChainEventTypes.Step
        config: Config
        isLastStep: boolean
        messages: Message[]
        uuid?: string
      }
    case ChainEventTypes.Complete:
      return {
        ...omit(event.data, 'documentLogUuid'),
        uuid: event.data.response.documentLogUuid!,
        response: omit(event.data.response, 'providerLog', 'documentLogUuid'),
      }
    case ChainEventTypes.Error:
      return {
        type: ChainEventTypes.Error,
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
