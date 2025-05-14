import { env } from '@latitude-data/env'
import { ErrorResult, Result, TypedResult } from '../../../lib/Result'
import { LatitudeError, NotImplementedError } from '../../../lib/errors'
import { Project, Workspace, DocumentVersion, Commit } from '../../../browser'
import {
  unsafelyFindProject,
  unsafelyFindWorkspace,
} from '../../../data-access'
import { PromisedResult } from '../../../lib/Transaction'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../repositories'
import {
  ChainEvent,
  ChainEventTypes,
  StreamEventTypes,
} from '@latitude-data/constants'
import { streamToGenerator } from '../../../lib/streamToGenerator'
import { WorkerSocket } from '../../../websockets/workers'

function missingKeyError(key: string): ErrorResult<LatitudeError> {
  return Result.error(
    new NotImplementedError(
      `Copilot is not supported in this environment. Please set the ${key} environment variable.`,
    ),
  )
}

export function assertCopilotIsSupported(): TypedResult<
  undefined,
  LatitudeError
> {
  if (!env.COPILOT_PROJECT_ID) return missingKeyError('COPILOT_PROJECT_ID')
  if (!env.COPILOT_LATTE_PROMPT_PATH) {
    return missingKeyError('COPILOT_LATTE_PROMPT_PATH')
  }

  return Result.nil()
}

export async function getCopilotDocument(): PromisedResult<
  {
    workspace: Workspace
    project: Project
    commit: Commit
    document: DocumentVersion
  },
  LatitudeError
> {
  const supportResult = assertCopilotIsSupported()
  if (!supportResult.ok) return supportResult as ErrorResult<LatitudeError>

  const project = await unsafelyFindProject(env.COPILOT_PROJECT_ID!)
  if (!project) {
    return Result.error(
      new NotImplementedError(
        `Copilot is not supported in this environment. There is no project with ID $COPILOT_PROJECT_ID`,
      ),
    )
  }
  const workspace = await unsafelyFindWorkspace(project.workspaceId).then(
    (w) => w!,
  )

  const commitScope = new CommitsRepository(workspace.id)
  const commitResult = await commitScope.getHeadCommit(project.id)
  if (!commitResult.ok || !commitResult.value) {
    return Result.error(
      new NotImplementedError(
        `Copilot is not supported in this environment. There is no commit for project with ID $COPILOT_PROJECT_ID`,
      ),
    )
  }
  const commit = commitResult.unwrap()!

  const documentScope = new DocumentVersionsRepository(workspace.id)
  const documentResult = await documentScope.getDocumentByPath({
    path: env.COPILOT_LATTE_PROMPT_PATH!,
    commit,
  })
  if (!documentResult.ok) {
    return Result.error(
      new NotImplementedError(
        `Copilot is not supported in this environment. There is no document with path $COPILOT_LATTE_PROMPT_PATH`,
      ),
    )
  }
  const document = documentResult.unwrap()

  return Result.ok({ workspace, project, commit, document })
}

export async function sendWebsockets({
  websockets,
  workspace,
  chatUuid,
  stream,
}: {
  websockets: WorkerSocket
  workspace: Workspace
  chatUuid: string
  stream: ReadableStream<ChainEvent>
}) {
  for await (const payload of streamToGenerator(stream)) {
    const { event, data } = payload
    if (event !== StreamEventTypes.Latitude) continue
    if (data.type !== ChainEventTypes.ProviderCompleted) continue

    const message = data.messages.at(-1)!
    websockets.emit('copilotChatMessage', {
      workspaceId: workspace.id,
      data: {
        chatUuid,
        message,
      },
    })
  }
}
