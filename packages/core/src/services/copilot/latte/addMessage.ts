import { LogSources } from '@latitude-data/constants'
import { LatitudeError } from '@latitude-data/constants/errors'
import {
  Message,
  MessageRole,
  UserMessage,
} from '@latitude-data/constants/legacyCompiler'
import { Commit, DocumentVersion, User, Workspace } from '../../../browser'
import { RunLatteJobData } from '../../../jobs/job-definitions/copilot/chat'
import { documentsQueue } from '../../../jobs/queues'
import { ErrorResult, Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { BACKGROUND, TelemetryContext } from '../../../telemetry'
import { WebsocketClient } from '../../../websockets/workers'
import { runDocumentAtCommit } from '../../commits'
import { addMessages } from '../../documentLogs/addMessages/index'
import { assertCopilotIsSupported, sendWebsockets } from './helpers'
import { buildToolHandlers } from './tools'

export * from './threads/checkpoints/clearCheckpoints'
export * from './threads/checkpoints/createCheckpoint'
export * from './threads/checkpoints/undoChanges'
export * from './threads/createThread'

export async function runNewLatte({
  copilotWorkspace,
  copilotCommit,
  copilotDocument,
  clientWorkspace,
  user,
  threadUuid,
  message,
  context,
}: {
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  user: User
  threadUuid: string
  message: string
  context: string
}): PromisedResult<undefined> {
  return generateLatteResponse({
    context: BACKGROUND({ workspaceId: copilotWorkspace.id }),
    copilotWorkspace,
    copilotCommit,
    copilotDocument,
    clientWorkspace,
    user,
    threadUuid,
    initialParameters: { message, context },
  })
}

export async function addMessageToExistingLatte({
  copilotWorkspace,
  copilotCommit,
  copilotDocument,
  clientWorkspace,
  user,
  threadUuid,
  message,
  context,
}: {
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  user: User
  threadUuid: string
  message: string
  context: string
}): PromisedResult<undefined> {
  const userMessage: UserMessage = {
    role: MessageRole.user,
    content: [
      {
        type: 'text',
        text: context,
      },
      {
        type: 'text',
        text: message,
      },
    ],
  }

  return generateLatteResponse({
    context: BACKGROUND({ workspaceId: copilotWorkspace.id }),
    copilotWorkspace,
    copilotCommit,
    copilotDocument,
    clientWorkspace,
    user,
    threadUuid,
    messages: [userMessage],
  })
}

export async function createLatteJob({
  workspace,
  user,
  threadUuid,
  message,
  context,
}: {
  workspace: Workspace
  user: User
  threadUuid: string
  message: string
  context: string
}): PromisedResult<undefined> {
  const supportResult = assertCopilotIsSupported()
  if (!supportResult.ok) return supportResult as ErrorResult<LatitudeError>

  await documentsQueue.add('runLatteJob', {
    workspaceId: workspace.id,
    userId: user.id,
    threadUuid,
    message,
    context,
  } as RunLatteJobData)

  return Result.nil()
}

async function generateLatteResponse({
  context,
  copilotWorkspace,
  copilotCommit,
  copilotDocument,
  clientWorkspace,
  user,
  threadUuid,
  initialParameters,
  messages,
}: {
  context: TelemetryContext
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  user: User
  threadUuid: string
  initialParameters?: { message: string; context: string } // for the first “new” request
  messages?: Message[] // for subsequent “add” requests
}): PromisedResult<undefined> {
  const tools = buildToolHandlers({
    workspace: clientWorkspace,
    threadUuid,
    user,
  })

  const runResult = initialParameters
    ? await runDocumentAtCommit({
        context: context,
        workspace: copilotWorkspace,
        commit: copilotCommit,
        document: copilotDocument,
        customIdentifier: String(clientWorkspace.id),
        parameters: initialParameters,
        source: LogSources.API,
        errorableUuid: threadUuid,
        tools,
      })
    : await addMessages({
        context: context,
        workspace: copilotWorkspace,
        documentLogUuid: threadUuid,
        messages: messages!,
        source: LogSources.API,
        tools,
      })
  if (!runResult.ok) return runResult as ErrorResult<LatitudeError>
  const run = runResult.unwrap()

  await sendWebsockets({
    workspace: clientWorkspace,
    threadUuid,
    stream: run.stream,
  })

  const runError = await run.error
  if (runError) {
    WebsocketClient.sendEvent('latteThreadUpdate', {
      workspaceId: clientWorkspace.id,
      data: {
        threadUuid,
        type: 'error',
        error: {
          name: runError.name,
          message: runError.message,
        },
      },
    })
    return Result.error(runError)
  }

  return Result.nil()
}
