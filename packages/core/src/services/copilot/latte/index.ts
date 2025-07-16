import {
  Message,
  MessageRole,
  UserMessage,
} from '@latitude-data/constants/legacyCompiler'
import { LogSources } from '@latitude-data/constants'
import { Commit, DocumentVersion, Workspace } from '../../../browser'
import { RunLatteJobData } from '../../../jobs/job-definitions/copilot/chat'
import { documentsQueue } from '../../../jobs/queues'
import { BACKGROUND, TelemetryContext } from '../../../telemetry'
import { assertCopilotIsSupported, sendWebsockets } from './helpers'
import { PromisedResult } from '../../../lib/Transaction'
import { runDocumentAtCommit } from '../../commits'
import { addMessages } from '../../documentLogs/addMessages'
import { ErrorResult, Result } from '../../../lib/Result'
import { LatitudeError } from '@latitude-data/constants/errors'

export * from './threads/checkpoints/clearCheckpoints'
export * from './threads/checkpoints/createCheckpoint'
export * from './threads/checkpoints/undoChanges'
export * from './threads/createThread'

async function generateCopilotResponse({
  context,
  copilotWorkspace,
  copilotCommit,
  copilotDocument,
  clientWorkspace,
  threadUuid,
  initialParameters,
  messages,
}: {
  context: TelemetryContext
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  threadUuid: string
  initialParameters?: { message: string; context: string } // for the first “new” request
  messages?: Message[] // for subsequent “add” requests
}): PromisedResult<undefined> {
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
      })
    : await addMessages({
        context: context,
        workspace: copilotWorkspace,
        documentLogUuid: threadUuid,
        messages: messages!,
        source: LogSources.API,
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
    return Result.error(runError)
  }

  // Agent returned a response. The run flow has finished.
  return Result.nil()
}

export async function runNewLatte({
  copilotWorkspace,
  copilotCommit,
  copilotDocument,
  clientWorkspace,
  threadUuid,
  message,
  context,
}: {
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  threadUuid: string
  message: string
  context: string
}): PromisedResult<undefined> {
  return generateCopilotResponse({
    context: BACKGROUND({ workspaceId: copilotWorkspace.id }),
    copilotWorkspace,
    copilotCommit,
    copilotDocument,
    clientWorkspace,
    threadUuid,
    initialParameters: { message, context },
  })
}

export async function addMessageToExistingLatte({
  copilotWorkspace,
  copilotCommit,
  copilotDocument,
  clientWorkspace,
  threadUuid,
  message,
  context,
}: {
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
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

  return generateCopilotResponse({
    context: BACKGROUND({ workspaceId: copilotWorkspace.id }),
    copilotWorkspace,
    copilotCommit,
    copilotDocument,
    clientWorkspace,
    threadUuid,
    messages: [userMessage],
  })
}

export async function createLatteJob({
  workspace,
  threadUuid,
  message,
  context,
}: {
  workspace: Workspace
  threadUuid: string
  message: string
  context: string
}): PromisedResult<undefined> {
  const supportResult = assertCopilotIsSupported()
  if (!supportResult.ok) return supportResult as ErrorResult<LatitudeError>

  await documentsQueue.add('runLatteJob', {
    workspaceId: workspace.id,
    threadUuid,
    message,
    context,
  } as RunLatteJobData)

  return Result.nil()
}
