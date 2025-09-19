import { LogSources } from '@latitude-data/constants'
import { LatitudeError } from '@latitude-data/constants/errors'
import {
  Message,
  MessageRole,
  UserMessage,
} from '@latitude-data/constants/legacyCompiler'
import {
  Commit,
  DocumentVersion,
  User,
  Workspace,
  Project,
} from '../../../browser'

import { ErrorResult, Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { BACKGROUND, TelemetryContext } from '../../../telemetry'
import { captureException } from '../../../utils/workers/sentry'
import { WebsocketClient } from '../../../websockets/workers'
import { runDocumentAtCommit } from '../../commits'
import { addMessages } from '../../documentLogs/addMessages/index'
import { checkLatteCredits } from './credits/check'
import { consumeLatteCredits } from './credits/consume'
import { isLatteDebugSession } from './debugVersions'
import { sendWebsockets } from './helpers'
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
  clientProject,
  user,
  threadUuid,
  message,
  context,
  abortSignal,
  debugVersionUuid,
}: {
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  clientProject: Project
  user: User
  threadUuid: string
  message: string
  context: string
  abortSignal?: AbortSignal
  debugVersionUuid?: string
}): PromisedResult<undefined> {
  return generateLatteResponse({
    context: BACKGROUND({ workspaceId: copilotWorkspace.id }),
    copilotWorkspace,
    copilotCommit,
    copilotDocument,
    clientWorkspace,
    clientProject,
    user,
    threadUuid,
    initialParameters: { message, context },
    abortSignal,
    debugVersionUuid,
  })
}

export async function addMessageToExistingLatte({
  copilotWorkspace,
  copilotCommit,
  copilotDocument,
  clientWorkspace,
  clientProject,
  user,
  threadUuid,
  message,
  context,
  abortSignal,
  debugVersionUuid,
}: {
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  clientProject: Project
  user: User
  threadUuid: string
  message: string
  context: string
  abortSignal?: AbortSignal
  debugVersionUuid?: string
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
    clientProject,
    user,
    threadUuid,
    messages: [userMessage],
    abortSignal,
    debugVersionUuid,
  })
}

type GenerateLatteResponseArgs = {
  context: TelemetryContext
  copilotWorkspace: Workspace
  copilotCommit: Commit
  copilotDocument: DocumentVersion
  clientWorkspace: Workspace
  clientProject: Project
  threadUuid: string
  initialParameters?: { message: string; context: string } // for the first "new" request
  messages?: Message[] // for subsequent "add" requests
  user: User
  abortSignal?: AbortSignal
  debugVersionUuid?: string
}

async function generateLatteResponse(args: GenerateLatteResponseArgs) {
  const checking = await checkLatteCredits({ workspace: args.clientWorkspace })
  if (!Result.isOk(checking)) {
    return Result.error(checking.error)
  }

  let usage, error
  try {
    const run = await innerGenerateLatteResponse(args).then((r) => r.unwrap())
    usage = await run.runUsage
    error = await run.error
  } catch (exception) {
    error = exception as Error
  }

  const consuming = await consumeLatteCredits({
    usage: usage ?? {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    threadUuid: args.threadUuid,
    error: error,
    user: args.user,
    workspace: args.clientWorkspace,
  }) // Note: failing silently
  if (!Result.isOk(consuming)) {
    captureException(consuming.error)
  }

  if (error) {
    WebsocketClient.sendEvent('latteThreadUpdate', {
      workspaceId: args.clientWorkspace.id,
      data: {
        threadUuid: args.threadUuid,
        type: 'error',
        error: {
          name: error.name,
          message: error.message,
        },
      },
    })
  }

  return Result.nil()
}

async function innerGenerateLatteResponse({
  context,
  copilotWorkspace,
  copilotCommit,
  copilotDocument,
  clientWorkspace,
  clientProject,
  threadUuid,
  initialParameters,
  messages,
  user,
  abortSignal,
  debugVersionUuid,
}: GenerateLatteResponseArgs) {
  const tools = buildToolHandlers({
    user,
    workspace: clientWorkspace,
    project: clientProject,
    threadUuid,
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
        abortSignal,
      })
    : await addMessages({
        context: context,
        workspace: copilotWorkspace,
        documentLogUuid: threadUuid,
        messages: messages!,
        source: LogSources.API,
        tools,
        abortSignal,
      })
  if (!Result.isOk(runResult)) return runResult as ErrorResult<LatitudeError>
  const run = runResult.unwrap()

  const isLatteDebugSessionResult = await isLatteDebugSession(
    clientWorkspace.id,
    debugVersionUuid,
  )

  if (!Result.isOk(isLatteDebugSessionResult)) {
    return isLatteDebugSessionResult
  }

  await sendWebsockets({
    workspace: clientWorkspace,
    threadUuid,
    stream: run.stream,
    isLatteDebugSession: isLatteDebugSessionResult.unwrap(),
  })

  return Result.ok(run)
}
